package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/firs")
class FirController {
    record NewFir(
            @NotNull UUID stationId, @Positive int firYear, @Positive int firNo, @NotBlank String gdEntryNo,
            @NotNull OffsetDateTime registeredAt, @NotNull OffsetDateTime informationReceivedAt,
            boolean zeroFir, String outsideLimitsPlace, @NotBlank String contentsOriginal,
            @NotBlank String contentsLanguage, @NotBlank String actionTaken, String actionReason,
            UUID ioId, boolean sexualOffence, List<Section> sections) {}

    record Section(@NotBlank String act, @NotBlank String section) {}

    record AssignIo(@NotNull UUID ioId, @jakarta.validation.constraints.Size(max = 2000) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;

    FirController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
        if (limit < 1 || limit > 200 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to 200 and offset 0 or more");
        return db.sql("select id, fir_year, fir_no, registered_at, is_zero_fir, action_taken, sexual_offence "
                        + "from fir where " + team.canReadFirSql() + " order by registered_at desc, id limit ? offset ?")
                .params(CaseTeam.user(jwt), limit, offset).query().listOfRows();
    }

    /** The complaint text names the victim, so it is withheld from anyone outside the case team on protected cases. */
    @GetMapping("/{id}")
    Map<String, Object> one(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        if (!team.canReadFir(CaseTeam.user(jwt), id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var fir = db.sql("select * from fir where id = ?").param(id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var out = new java.util.LinkedHashMap<>(fir);
        boolean withheld = team.identityProtected(id) && !team.includes(CaseTeam.user(jwt), id);
        if (withheld) out.put("contents_original", null);
        out.put("contents_withheld", withheld);
        out.put("io_name", fir.get("io_id") == null ? null
                : db.sql("select full_name from app_user where id = ?").param(fir.get("io_id")).query(String.class).single());
        out.put("sections", db.sql("select act, section from fir_section where fir_id = ? order by act, section")
                .param(id).query().listOfRows());
        return out;
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, UUID>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewFir f) {
        UUID me = CaseTeam.user(jwt);
        team.requireStationStaff(me, f.stationId);
        if (f.ioId != null && !team.canBeIo(f.ioId, f.stationId))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The IO must be an active IO or SHO of this police station.");
        UUID id = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  is_zero_fir, outside_limits_place, contents_original, contents_language, action_taken,
                  action_reason, io_id, sexual_offence)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(f.stationId, f.firYear, f.firNo, f.gdEntryNo, f.registeredAt, f.informationReceivedAt,
                        f.zeroFir, f.outsideLimitsPlace, f.contentsOriginal, f.contentsLanguage, f.actionTaken,
                        f.actionReason, f.ioId, f.sexualOffence)
                .query(UUID.class).single();
        if (f.ioId != null)
            db.sql("insert into fir_io_assignment (fir_id, to_io, assigned_by) values (?,?,?)").params(id, f.ioId, me).update();
        if (f.sections != null) {
            for (Section s : f.sections) {
                db.sql("insert into fir_section (fir_id, act, section) values (?,?,?)")
                        .params(id, s.act, s.section).update();
            }
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** Officers who can be made IO of this FIR (active IOs and SHOs of its station). For the case team. */
    @GetMapping("/{id}/io-candidates")
    List<Map<String, Object>> ioCandidates(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        team.requireTeam(CaseTeam.user(jwt), id);
        return db.sql("""
                select u.id, u.full_name, u.rank, u.role from app_user u join fir f on f.station_id = u.station_id
                where f.id = ? and u.active and u.role in """ + team.caseLeadRoles() + " order by u.full_name").param(id).query().listOfRows();
    }

    /**
     * Assigns the IO, or gives the case to another IO. Only the SHO of the station or the SP of the district.
     * A change from one IO to another needs a written reason (10+ characters). Every assignment is kept.
     */
    @PostMapping("/{id}/io")
    @Transactional
    ResponseEntity<Void> assignIo(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody AssignIo a) {
        UUID me = CaseTeam.user(jwt);
        team.requireSupervisor(me, id);
        var fir = db.sql("select station_id, io_id from fir where id = ? for update").param(id).query().singleRow();
        UUID from = (UUID) fir.get("io_id");
        String reason = a.reason == null || a.reason.isBlank() ? null : a.reason.trim();
        if (a.ioId.equals(from)) throw new ResponseStatusException(HttpStatus.CONFLICT, "This officer is already the IO.");
        if (!team.canBeIo(a.ioId, (UUID) fir.get("station_id")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The IO must be an active IO or SHO of this police station.");
        if (from != null && (reason == null || reason.length() < 10))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the reason for changing the IO (at least 10 characters).");
        db.sql("update fir set io_id = ? where id = ?").params(a.ioId, id).update();
        db.sql("insert into fir_io_assignment (fir_id, from_io, to_io, assigned_by, reason) values (?,?,?,?,?)")
                .params(id, from, a.ioId, me, reason).update();
        return ResponseEntity.noContent().build();
    }

    /** Who was IO when, newest first. */
    @GetMapping("/{id}/io-history")
    List<Map<String, Object>> ioHistory(@PathVariable UUID id) {
        return db.sql("""
                select a.at, f.full_name as from_name, t.full_name as to_name, b.full_name as assigned_by_name, a.reason
                from fir_io_assignment a left join app_user f on f.id = a.from_io join app_user t on t.id = a.to_io
                join app_user b on b.id = a.assigned_by where a.fir_id = ? order by a.at desc, a.id""").param(id).query().listOfRows();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected(DataIntegrityViolationException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this FIR (a rule or a duplicate)."));
    }
}
