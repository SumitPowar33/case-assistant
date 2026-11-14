package in.caseassistant;

import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the AI gateway asks before it sends a case's text to a model (weekly review of 14 Nov 2026): is the signed-in
 * officer on this FIR's case team, and is its victim's identity protected (BNS 72, BNS 124). The gateway asks with the
 * officer's own token, so an officer of another station, the front desk or a made-up case gets 404 (ReadAccess) and the
 * gateway refuses. Nothing of the case is in the answer.
 */
@RestController
class AiCaseController {
    private final CaseTeam team;

    AiCaseController(CaseTeam team) {
        this.team = team;
    }

    @GetMapping("/api/firs/{firId}/ai-check")
    Map<String, Object> check(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        return Map.of("victim_protected", team.identityProtected(firId));
    }
}
