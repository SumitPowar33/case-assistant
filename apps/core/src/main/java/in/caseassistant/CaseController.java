package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
import org.springframework.web.bind.annotation.*;

/** Read-only views over deadlines and evidence, plus the append-only custody log (case team or station malkhana only). */
@RestController
@RequestMapping("/api/firs/{firId}")
class CaseController {
    record Custody(@NotNull OffsetDateTime at, @NotBlank String handedBy, @NotBlank String receivedBy,
                   @NotBlank String location, @NotBlank String purpose, boolean sealIntact) {}

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
        return punishments.hint(db.sql("select act, section from fir_section where fir_id = ? order by act, section")
                .param(firId).query().listOfRows());
    }

    @GetMapping("/deadlines")
    List<Map<String, Object>> deadlines(@PathVariable UUID firId) {
        return db.sql("select kind, due_on, basis from case_deadline where fir_id = ? order by due_on")
                .param(firId).query().listOfRows();
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
                select c.at, c.handed_by, c.received_by, c.location, c.purpose, c.seal_intact
                from custody_event c join evidence_item e on e.id = c.item_id
                where e.fir_id = ? and e.id = ? order by c.at, c.id""").params(firId, itemId).query().listOfRows();
    }

    @PostMapping("/evidence/{itemId}/custody")
    ResponseEntity<Void> handOver(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID itemId, @Valid @RequestBody Custody c) {
        team.requireCustodian(CaseTeam.user(jwt), firId);
        boolean exists = db.sql("select exists (select 1 from evidence_item where id = ? and fir_id = ?)")
                .params(itemId, firId).query(Boolean.class).single();
        if (!exists) return ResponseEntity.notFound().build();
        db.sql("insert into custody_event (item_id, at, handed_by, received_by, location, purpose, seal_intact) "
                        + "values (?,?,?,?,?,?,?)")
                .params(itemId, c.at, c.handedBy, c.receivedBy, c.location, c.purpose, c.sealIntact).update();
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this entry."));
    }
}
