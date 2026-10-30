package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The front desk: information given at a police station, written down in the informant's words, read over to them and
 * signed (BNSS 173(1)), with the golden-hour steps of its kind ({@link ComplaintKinds}) and what became of it. An FIR is
 * registered from a signed complaint through {@link FirController} and carries its text unchanged. Only staff of the
 * station who may register FIRs ("fir.register") see or touch its complaints; anyone else gets 404.
 */
@RestController
@RequestMapping("/api")
class ComplaintController {
    static final Duration E_SIGN_LIMIT = Duration.ofDays(3);   // BNSS 173(1)(ii)

    record NewComplaint(@NotNull UUID stationId, @NotNull OffsetDateTime receivedAt, @NotBlank @Pattern(regexp = "oral|phone|written|electronic") String mode,
                        @NotBlank @Size(max = 200) String informantName, @Size(max = 200) String informantContact, @NotBlank String kind,
                        @NotBlank @Size(max = 50000) String text, @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,4})?") String textLanguage) {}

    record Correction(@NotBlank @Size(max = 200) String informantName, @Size(max = 200) String informantContact, @NotBlank String kind,
                      @NotBlank @Size(max = 50000) String text, @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,4})?") String textLanguage) {}

    record Sign(@Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,4})?") String readBackLanguage) {}

    record Step(@NotBlank String stepId, @Size(max = 2000) String note) {}

    record Outcome(@NotBlank @Pattern(regexp = "ncr|preliminary_enquiry|transferred|no_offence|not_signed_in_time") String outcome,
                   @NotBlank @Size(min = 10, max = 2000) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ComplaintKinds kinds;

    ComplaintController(JdbcClient db, CaseTeam team, ComplaintKinds kinds) {
        this.db = db;
        this.team = team;
        this.kinds = kinds;
    }

    @GetMapping("/complaint-kinds")
    List<ComplaintKinds.Kind> kinds() {
        return kinds.all();
    }

    @PostMapping("/complaints")
    ResponseEntity<Map<String, UUID>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewComplaint c) {
        UUID me = CaseTeam.user(jwt);
        team.requireStationStaff(me, c.stationId);
        requireKind(c.kind);
        if (c.receivedAt.toInstant().isAfter(Instant.now())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The time received is in the future.");
        UUID id = db.sql("""
                insert into complaint (station_id, received_at, mode, informant_name, informant_contact, kind, text_original, text_language, recorded_by)
                values (?,?,?,?,?,?,?,?,?) returning id""")
                .params(c.stationId, c.receivedAt, c.mode, c.informantName.trim(), blank(c.informantContact), c.kind, c.text.trim(), c.textLanguage, me)
                .query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** The complaints of the user's own station, newest first; "open" = no outcome yet. */
    @GetMapping("/complaints")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean open) {
        UUID me = CaseTeam.user(jwt);
        UUID station = db.sql("select station_id from app_user where id = ?").param(me).query(UUID.class).optional().orElse(null);
        if (station == null || !team.canRegisterAt(me, station)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only station staff who register FIRs see its complaints.");
        var out = new ArrayList<Map<String, Object>>();
        for (var r : db.sql("""
                select id, received_at, mode, informant_name, kind, signed_at, outcome, fir_id from complaint
                where station_id = ? and (not ? or outcome is null) order by received_at desc limit 200""").params(station, open).query().listOfRows()) {
            var row = new LinkedHashMap<>(r);
            row.put("steps_overdue", steps((UUID) r.get("id"), r).stream().filter(s -> Boolean.TRUE.equals(s.get("overdue"))).count());
            out.add(row);
        }
        return out;
    }

    @GetMapping("/complaints/{id}")
    Map<String, Object> one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var c = open(jwt, id);
        var out = new LinkedHashMap<>(c);
        out.put("kind_label", kinds.get((String) c.get("kind")).label());
        out.put("steps", steps(id, c));
        out.put("sign_by", c.get("mode").equals("electronic") ? ((java.sql.Timestamp) c.get("received_at")).toInstant().plus(E_SIGN_LIMIT) : null);
        return out;
    }

    /** Corrections while the text is read over; once signed it is the informant's text and stays as it is. */
    @PutMapping("/complaints/{id}")
    @Transactional
    ResponseEntity<Void> correct(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Correction c) {
        open(jwt, id);
        requireKind(c.kind);
        if (db.sql("""
                update complaint set informant_name = ?, informant_contact = ?, kind = ?, text_original = ?, text_language = ?
                where id = ? and signed_at is null and outcome is null""")
                .params(c.informantName.trim(), blank(c.informantContact), c.kind, c.text.trim(), c.textLanguage, id).update() == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The informant has signed this text; it cannot be changed.");
        return ResponseEntity.noContent().build();
    }

    /**
     * The informant signed the written text. Spoken information (oral, phone) must first have been read over to them, in
     * the language named; electronic information counts only if signed within three days of receipt.
     */
    @PostMapping("/complaints/{id}/sign")
    @Transactional
    ResponseEntity<Void> sign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Sign s) {
        var c = open(jwt, id);
        if (c.get("signed_at") != null || c.get("outcome") != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "This complaint is already signed or closed.");
        boolean spoken = c.get("mode").equals("oral") || c.get("mode").equals("phone");
        if (spoken && (s.readBackLanguage == null || s.readBackLanguage.isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say in which language the text was read over to the informant.");
        if (c.get("mode").equals("electronic") && Instant.now().isAfter(((java.sql.Timestamp) c.get("received_at")).toInstant().plus(E_SIGN_LIMIT)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Electronic information must be signed within three days of receipt (BNSS 173(1)(ii)); close it as not signed in time.");
        db.sql("update complaint set signed_at = clock_timestamp(), signed_recorded_by = ?, read_back_language = ? where id = ?")
                .params(CaseTeam.user(jwt), spoken ? s.readBackLanguage : null, id).update();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/complaints/{id}/steps")
    ResponseEntity<Void> step(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Step s) {
        var c = open(jwt, id);
        if (kinds.get((String) c.get("kind")).steps().stream().noneMatch(k -> k.id().equals(s.stepId)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such step for this kind of complaint.");
        if (db.sql("insert into complaint_step (complaint_id, step_id, done_at, done_by, note) values (?,?,clock_timestamp(),?,?) on conflict do nothing")
                .params(id, s.stepId, CaseTeam.user(jwt), blank(s.note)).update() == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This step is already recorded.");
        return ResponseEntity.noContent().build();   // no body: the web client reads a body on every other success
    }

    /** Closes a complaint without an FIR (an FIR is registered through POST /api/firs with the complaint's id). */
    @PostMapping("/complaints/{id}/outcome")
    @Transactional
    ResponseEntity<Void> outcome(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Outcome o) {
        var c = open(jwt, id);
        if (c.get("outcome") != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "This complaint is already closed.");
        if (o.outcome.equals("not_signed_in_time")) {
            if (!c.get("mode").equals("electronic") || c.get("signed_at") != null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only unsigned electronic information can lapse.");
        } else if (c.get("signed_at") == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The informant has not signed the text yet.");
        db.sql("update complaint set outcome = ?, outcome_reason = ?, outcome_at = clock_timestamp(), outcome_by = ? where id = ?")
                .params(o.outcome, o.reason.trim(), CaseTeam.user(jwt), id).update();
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------------------------------------

    /** The complaint, locked for this transaction, or 404 for anyone who may not register FIRs at its station. */
    private Map<String, Object> open(Jwt jwt, UUID id) {
        var c = db.sql("""
                select c.*, r.full_name as recorded_by_name, s.full_name as signed_by_name, o.full_name as outcome_by_name, f.fir_no, f.fir_year
                from complaint c join app_user r on r.id = c.recorded_by left join app_user s on s.id = c.signed_recorded_by
                left join app_user o on o.id = c.outcome_by left join fir f on f.id = c.fir_id where c.id = ?""")
                .param(id).query().listOfRows().stream().findFirst().orElse(null);
        if (c == null || !team.canRegisterAt(CaseTeam.user(jwt), (UUID) c.get("station_id")))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such complaint.");
        db.sql("select 1 from complaint where id = ? for update").param(id).query().listOfRows();
        return c;
    }

    /** The golden-hour steps of the complaint's kind: due time (from receipt), done or not, overdue while open. */
    private List<Map<String, Object>> steps(UUID id, Map<String, Object> c) {
        var done = new HashMap<String, Map<String, Object>>();
        db.sql("select d.step_id, d.done_at, d.note, u.full_name as done_by_name from complaint_step d join app_user u on u.id = d.done_by where d.complaint_id = ?")
                .param(id).query().listOfRows().forEach(r -> done.put((String) r.get("step_id"), r));
        Instant received = ((java.sql.Timestamp) c.get("received_at")).toInstant();
        var out = new ArrayList<Map<String, Object>>();
        for (var s : kinds.get((String) c.get("kind")).steps()) {
            var row = new LinkedHashMap<String, Object>();
            Instant due = s.withinMinutes() == null ? null : received.plus(Duration.ofMinutes(s.withinMinutes()));
            row.put("id", s.id());
            row.put("text", s.text());
            row.put("basis", s.basis());
            row.put("due_at", due);
            var d = done.get(s.id());
            row.put("done_at", d == null ? null : d.get("done_at"));
            row.put("done_by_name", d == null ? null : d.get("done_by_name"));
            row.put("note", d == null ? null : d.get("note"));
            row.put("overdue", d == null && due != null && c.get("outcome") == null && Instant.now().isAfter(due));
            out.add(row);
        }
        return out;
    }

    private void requireKind(String kind) {
        if (kinds.get(kind) == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown kind of complaint.");
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
