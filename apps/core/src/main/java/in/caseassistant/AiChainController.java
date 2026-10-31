package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The AI gateway's audit chain head, kept here so that an older or rewritten copy of the gateway's own file shows
 * (V35). Only the gateway may report a head: it signs "ai-chain-head|seq|hash" with the shared AUTH_SECRET (header
 * X-Chain-Mac), on the token of the officer whose request wrote the row. An older head than the newest kept is ignored.
 */
@RestController
@RequestMapping("/api/ai-chain-head")
class AiChainController {
    record Head(@Positive long seq, @NotBlank @Pattern(regexp = "[0-9a-f]{64}") String hash) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final byte[] secret;

    AiChainController(JdbcClient db, CaseTeam team, @Value("${auth.secret}") String secret) {
        this.db = db;
        this.team = team;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    static String mac(byte[] secret, long seq, String hash) {
        try {
            var m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(m.doFinal(("ai-chain-head|" + seq + "|" + hash).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    @PostMapping
    Map<String, Object> report(@AuthenticationPrincipal Jwt jwt, @RequestHeader(value = "X-Chain-Mac", defaultValue = "") String given,
                               @Valid @RequestBody Head head) {
        if (!MessageDigest.isEqual(mac(secret, head.seq(), head.hash()).getBytes(StandardCharsets.UTF_8), given.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the AI gateway can report its audit chain head.");
        UUID me = CaseTeam.user(jwt);
        int added;
        try {
            added = db.sql("insert into ai_chain_anchor (seq, hash, reported_by) select ?, ?, ? "
                            + "where not exists (select 1 from ai_chain_anchor where seq >= ?)")
                    .params(head.seq(), head.hash(), me, head.seq()).update();
        } catch (DataIntegrityViolationException e) {   // a newer head arrived at the same moment
            added = 0;
        }
        return Map.of("kept", added == 1);
    }

    /** The newest head kept, for the admin's audit check at the gateway; empty before the first AI call. */
    @GetMapping
    Map<String, Object> newest(@AuthenticationPrincipal Jwt jwt) {
        if (!team.can(CaseTeam.user(jwt), "admin.manage"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the state admin can do this.");
        return db.sql("select seq, hash from ai_chain_anchor order by seq desc limit 1").query().listOfRows().stream()
                .findFirst().<Map<String, Object>>map(r -> r).orElse(Map.of());
    }
}
