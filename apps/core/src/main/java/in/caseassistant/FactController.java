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

    /**
     * Identifiers of this FIR seen in other FIRs of its station (board 2, V65): for each confirmed phone, account, UTR or
     * UPI fact with a key, the other FIRs of the station with a confirmed fact of the same kind and key. An FIR the caller
     * is on the case team of is named (id and number); the others are only counted, so the officer knows to ask whoever
     * holds them, and nothing of them is shown. No link is made from or to a case that protects the victim's identity:
     * its numbers may be the victim's own. Only the other FIR's id and number leave, never its facts or text.
     */
    @GetMapping("/links")
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> links(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (team.identityProtected(firId)) return List.of();
        var rows = db.sql("""
                select distinct f.id as fact_id, f.kind, f.value, f.confirmed_at, o.id as other_id, o.fir_no, o.fir_year,
                       (%s) as open
                from fir_fact f join fir here on here.id = f.fir_id
                join fir_fact g on g.kind = f.kind and g.fir_id <> f.fir_id
                     and fact_identifier_key(g.kind, g.value) = fact_identifier_key(f.kind, f.value)
                join fir o on o.id = g.fir_id and o.station_id = here.station_id
                where f.fir_id = ? and fact_identifier_key(f.kind, f.value) is not null and not identity_protected_case(o.id)
                order by f.confirmed_at, f.id, o.fir_year, o.fir_no""".formatted(team.includesSql("o.id")))
                .params(me, firId).query().listOfRows();
        var out = new java.util.LinkedHashMap<UUID, Map<String, Object>>();
        for (var r : rows) {
            var link = out.computeIfAbsent((UUID) r.get("fact_id"), id -> new java.util.HashMap<>(Map.of(
                    "fact_id", id, "kind", r.get("kind"), "value", r.get("value"), "firs", new java.util.ArrayList<Map<String, Object>>(), "others", 0)));
            if ((Boolean) r.get("open")) ((List<Map<String, Object>>) link.get("firs")).add(Map.of("id", r.get("other_id"), "fir_no", r.get("fir_no"), "fir_year", r.get("fir_year")));
            else link.put("others", (Integer) link.get("others") + 1);
        }
        return List.copyOf(out.values());
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Fact f) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (team.identityProtected(firId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The AI is not used on a case whose victim's identity is protected, so its result is not taken.");
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
