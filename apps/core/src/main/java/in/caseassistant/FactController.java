package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Facts of the FIR text the officer confirmed (design board 2, AI feature A1, V50). The AI gateway (feature fir_extract)
 * suggests the facts in the browser; nothing is kept until the officer confirms one, and then it is kept as written with
 * the words of the FIR text it comes from (the database refuses a quote that is not in the text). Only the case team
 * reads or writes. The quotes are the FIR text, so reading them on a protected case is logged as a read of that text.
 */
@RestController
@RequestMapping("/api/firs/{firId}/facts")
class FactController {
    record Fact(@NotBlank @Pattern(regexp = "date|time|place|amount|utr|phone|account|upi") String kind,
            @NotBlank @Size(max = 200) String value, @NotBlank @Size(max = 200) String aiValue,
            @NotBlank @Size(max = 500) String quote, @NotNull UUID aiRequestId) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ProtectedReads reads;

    FactController(JdbcClient db, CaseTeam team, ProtectedReads reads) {
        this.db = db;
        this.team = team;
        this.reads = reads;
    }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var rows = db.sql("""
                select f.id, f.kind, f.value, f.ai_value, f.value <> f.ai_value as corrected, f.quote, f.ai_request_id,
                       f.confirmed_at, u.full_name as confirmed_by_name
                from fir_fact f join app_user u on u.id = f.confirmed_by where f.fir_id = ? order by f.confirmed_at, f.id""")
                .param(firId).query().listOfRows();
        if (!rows.isEmpty() && team.identityProtected(firId)) reads.fir(me, firId, "fir_text");
        return rows;
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Fact f) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        try {
            UUID id = db.sql("""
                    insert into fir_fact (fir_id, kind, value, ai_value, quote, ai_request_id, confirmed_by)
                    values (?, ?, ?, ?, ?, ?, ?) returning id""")
                    .params(firId, f.kind, f.value.trim(), f.aiValue.trim(), f.quote, f.aiRequestId, me).query(UUID.class).single();
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
        } catch (DuplicateKeyException twice) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This fact is already confirmed for this case.");
        } catch (org.springframework.dao.DataIntegrityViolationException notInText) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The quote of a fact must be words of the FIR text, exactly as written.");
        }
    }
}
