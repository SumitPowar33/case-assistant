package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
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
 * <p>An English translation sits beside a statement made in another language (AI feature A3, V52): the AI gateway
 * (feature statement_translate) drafts it in the browser, the officer checks it against the original, and only then is it
 * kept, with what the AI drafted. Never for a protected case or a masked person (their words would leave for the AI).
 */
@RestController
@RequestMapping("/api/firs/{firId}/statements")
class StatementController {
    record Statement(@NotBlank String personId, @NotBlank @Pattern(regexp = "[a-z]{2,3}") String language,
            @NotBlank @Pattern(regexp = "written|audio|video") String medium, @NotBlank @Size(min = 3, max = 20000) String text) {}
    record Translation(@NotBlank @Size(max = 40000) String text, @NotBlank @Size(max = 40000) String aiText, @NotNull UUID aiRequestId) {}

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
                select s.id, s.person_id, p.label, p.full_name as name, p.identity_masked as masked, s.recorded_at,
                       u.full_name as recorded_by_name, s.language, s.medium, s.original_text,
                       t.translated_text, t.translated_text <> t.ai_text as translation_corrected, t.checked_at as translation_checked_at,
                       tu.full_name as translation_checked_by_name
                from witness_statement s join person p on p.id = s.person_id join app_user u on u.id = s.recorded_by
                left join statement_translation t on t.statement_id = s.id left join app_user tu on tu.id = t.checked_by
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

    @PostMapping("/{statementId}/translation")
    ResponseEntity<Map<String, Object>> translate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID statementId,
            @Valid @RequestBody Translation t) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var statement = db.sql("""
                select s.language, p.identity_masked as masked from witness_statement s join person p on p.id = s.person_id
                where s.id = ? and s.fir_id = ?""").params(statementId, firId).query().listOfRows();
        if (statement.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if ("en".equals(statement.get(0).get("language")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A statement made in English is not translated.");
        if (Boolean.TRUE.equals(statement.get(0).get("masked")) || team.identityProtected(firId))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A statement of a protected victim's case or of a masked person is not sent for translation.");
        try {
            UUID id = db.sql("""
                    insert into statement_translation (statement_id, translated_text, ai_text, ai_request_id, checked_by)
                    values (?, ?, ?, ?, ?) returning id""")
                    .params(statementId, t.text.trim(), t.aiText.trim(), t.aiRequestId, me).query(UUID.class).single();
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
        } catch (DuplicateKeyException twice) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This statement already has a checked translation.");
        }
    }
}
