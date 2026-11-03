package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
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

/**
 * Statements of witnesses under BNSS 180 (design board 6, V40) and the witness tracker. The tracker is read from the
 * case's people (complainant, victim, witness) and their statements, so nothing is typed twice. A statement is kept as
 * the person said it, in the language spoken, and is never changed. Only the case team reads or writes; a protected
 * case's statements are logged like its people ({@link ProtectedReads}).
 */
@RestController
@RequestMapping("/api/firs/{firId}/statements")
class StatementController {
    record Statement(@NotBlank String personId, @NotBlank @Pattern(regexp = "[a-z]{2,3}") String language,
            @NotBlank @Pattern(regexp = "written|audio|video") String medium, @NotBlank @Size(min = 3, max = 20000) String text) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ProtectedReads reads;

    StatementController(JdbcClient db, CaseTeam team, ProtectedReads reads) {
        this.db = db;
        this.team = team;
        this.reads = reads;
    }

    @GetMapping
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var witnesses = db.sql("""
                select p.id as person_id, p.role, p.label, p.full_name as name, count(s.id) as statements, max(s.recorded_at) as last_recorded_at
                from person p left join witness_statement s on s.person_id = p.id
                where p.fir_id = ? and p.role in ('complainant', 'victim', 'witness') group by p.id order by p.label, p.id""")
                .params(firId).query().listOfRows();
        var statements = db.sql("""
                select s.id, s.person_id, p.label, p.full_name as name, s.recorded_at, u.full_name as recorded_by_name, s.language, s.medium, s.original_text
                from witness_statement s join person p on p.id = s.person_id join app_user u on u.id = s.recorded_by
                where s.fir_id = ? order by s.recorded_at desc""").params(firId).query().listOfRows();
        if (!witnesses.isEmpty() && team.identityProtected(firId)) reads.fir(me, firId, "statements");
        var out = new LinkedHashMap<String, Object>();
        out.put("witnesses", witnesses);
        out.put("statements", statements);
        return out;
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Statement s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        UUID person;
        try {
            person = UUID.fromString(s.personId);
        } catch (IllegalArgumentException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "personId must be a person of this case");
        }
        try {
            var id = db.sql("""
                    insert into witness_statement (fir_id, person_id, recorded_by, language, medium, original_text)
                    values (?, ?, ?, ?, ?, ?) returning id""")
                    .params(firId, person, me, s.language, s.medium, s.text.trim()).query(UUID.class).single();
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
        } catch (DataIntegrityViolationException notAWitness) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A statement is recorded for a complainant, victim or witness of this case.");
        }
    }
}
