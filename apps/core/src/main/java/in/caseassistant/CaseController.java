package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Read-only views over deadlines and evidence, plus the append-only custody log (case team or station malkhana only). */
@RestController
@RequestMapping("/api/firs/{firId}")
class CaseController {
    record Custody(@NotNull OffsetDateTime at, @NotBlank String handedBy, @NotBlank String receivedBy,
                   @NotBlank String location, @NotBlank String purpose, boolean sealIntact,
                   @Pattern(regexp = "malkhana|lab|court|owner|other") String place) {}

    /** BNSS 193(3)(ii): the progress of the investigation told to the informant or victim; no names, only to whom and how. */
    record VictimUpdate(@NotNull LocalDate givenOn, @NotBlank @Pattern(regexp = "informant|victim") String toldTo,
                        @NotBlank @Pattern(regexp = "in_person|phone|sms|email|letter|other") String means) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final Punishments punishments;

    CaseController(JdbcClient db, CaseTeam team, Punishments punishments) {
        this.db = db;
        this.team = team;
        this.punishments = punishments;
    }

    /** Suggests the highest-punishment class (so 60 or 90 days) from the FIR's sections. The officer still chooses. */
    @GetMapping("/punishment-hint")
    Map<String, Object> punishmentHint(@PathVariable UUID firId) {
        String state = team.stateOfFir(firId);
        return punishments.hint(state, db.sql("select act, section from fir_section where fir_id = ? order by act, section")
                .param(firId).query().listOfRows());
    }

    @GetMapping("/deadlines")
    List<Map<String, Object>> deadlines(@PathVariable UUID firId) {
        return db.sql("select kind, due_on, basis from case_deadline where fir_id = ? order by due_on")
                .param(firId).query().listOfRows();
    }

    /** The progress updates given (BNSS 193(3)(ii)), oldest first; the first one ends the 90-day deadline. */
    @GetMapping("/victim-updates")
    List<Map<String, Object>> victimUpdates(@PathVariable UUID firId) {
        return db.sql("""
                select v.given_on, v.told_to, v.means, u.full_name as recorded_by_name, v.recorded_at
                from victim_update v join app_user u on u.id = v.recorded_by where v.fir_id = ? order by v.given_on, v.recorded_at""")
                .param(firId).query().listOfRows();
    }

    /**
     * Which of the generic steps of the 90-day letter (A7) the case has already taken, read from the case: only four yes/no
     * answers, no name and no text, so it is safe on any case. Statements of a person masked by hand do not count.
     */
    @GetMapping("/progress-steps")
    Map<String, Boolean> progressSteps(@PathVariable UUID firId) {
        return db.sql("""
                select exists (select 1 from witness_statement s join person p on p.id = s.person_id where s.fir_id = :f and not p.identity_masked) as statements,
                       exists (select 1 from evidence_item where fir_id = :f) as evidence,
                       exists (select 1 from notice where fir_id = :f) as enquiries,
                       exists (select 1 from expert_request where fir_id = :f) as expert""")
                .param("f", firId).query((rs, i) -> {
                    var m = new java.util.LinkedHashMap<String, Boolean>();
                    for (String k : new String[] {"statements", "evidence", "enquiries", "expert"}) m.put(k, rs.getBoolean(k));
                    return (Map<String, Boolean>) m;
                }).single();
    }

    /**
     * The language the victim (else the informant) reads, kept on the person's record (V62); null when none is recorded.
     * One code and no name, so it is safe on any case. The 90-day letter opens in it (A7).
     */
    @GetMapping("/victim-language")
    Map<String, String> victimLanguage(@PathVariable UUID firId) {
        var language = db.sql("select language from person where fir_id = ? and role in ('victim','complainant') and language is not null "
                + "order by (role = 'victim') desc, label limit 1").param(firId).query(String.class).optional();
        var m = new java.util.HashMap<String, String>();
        m.put("language", language.orElse(null));
        return m;
    }

    @PostMapping("/victim-updates")
    ResponseEntity<Map<String, UUID>> victimUpdate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody VictimUpdate v) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (v.givenOn.isAfter(LocalDate.now(ZoneId.of("Asia/Kolkata"))))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The day the update was given cannot be in the future.");
        if (db.sql("select ? < ist_date(registered_at) from fir where id = ?").params(v.givenOn, firId).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The update cannot be before the FIR was registered.");
        UUID id = db.sql("insert into victim_update (fir_id, given_on, told_to, means, recorded_by) values (?,?,?,?,?) returning id")
                .params(firId, v.givenOn, v.toldTo, v.means, me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @GetMapping("/evidence")
    List<Map<String, Object>> evidence(@PathVariable UUID firId) {
        return db.sql("""
                select e.id, e.label, e.description, e.kind, e.sha256, r.court_ready
                from evidence_item e left join electronic_item_readiness r on r.id = e.id
                where e.fir_id = ? order by e.label""").param(firId).query().listOfRows();
    }

    @GetMapping("/evidence/{itemId}/custody")
    List<Map<String, Object>> custody(@PathVariable UUID firId, @PathVariable UUID itemId) {
        return db.sql("""
                select c.at, c.handed_by, c.received_by, c.location, c.purpose, c.seal_intact, c.place
                from custody_event c join evidence_item e on e.id = c.item_id
                where e.fir_id = ? and e.id = ? order by c.at, c.id""").params(firId, itemId).query().listOfRows();
    }

    @PostMapping("/evidence/{itemId}/custody")
    ResponseEntity<Void> handOver(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID itemId, @Valid @RequestBody Custody c) {
        team.requireCustodian(CaseTeam.user(jwt), firId);
        boolean exists = db.sql("select exists (select 1 from evidence_item where id = ? and fir_id = ?)")
                .params(itemId, firId).query(Boolean.class).single();
        if (!exists) return ResponseEntity.notFound().build();
        db.sql("insert into custody_event (item_id, at, handed_by, received_by, location, purpose, seal_intact, place) "
                        + "values (?,?,?,?,?,?,?,?)")
                .params(itemId, c.at, c.handedBy, c.receivedBy, c.location, c.purpose, c.sealIntact, c.place).update();
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this entry."));
    }
}
