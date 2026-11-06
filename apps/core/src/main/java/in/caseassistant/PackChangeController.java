package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * State setup and approvals (design board 21): changes proposed to a state's pack and their approval. A proposal is
 * written by the holder of {@code pack.propose}; another person who holds {@code pack.approve} in the same state
 * approves it or sends it back with a reason. The records are kept as written. Approving records the decision only:
 * pack files change with a release, so a state still cannot loosen a national rule by this route.
 */
@RestController
class PackChangeController {
    static final String PROPOSE = "pack.propose";
    static final String APPROVE = "pack.approve";

    record NewChange(@NotBlank @Pattern(regexp = "[A-Z]{2,3}") String state, @NotBlank @Size(min = 5, max = 120) String title,
                     @NotBlank @Size(min = 20, max = 2000) String body, @Size(max = 500) String testedNote) {}
    record Decision(@NotBlank @Pattern(regexp = "approve|return") String decision, @Size(max = 1000) String note) {}

    private final JdbcClient db;
    private final CaseTeam team;

    PackChangeController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    /** The state of the user's police station; null for an account without a station (the platform admin). */
    private String stateOf(UUID user) {
        return db.sql("select s.state_code from app_user u join police_station s on s.id = u.station_id where u.id = ?")
                .param(user).query(String.class).optional().orElse(null);
    }

    @GetMapping("/api/pack-changes")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String state) {
        UUID me = CaseTeam.user(jwt);
        boolean propose = team.can(me, PROPOSE), approve = team.can(me, APPROVE);
        if (!propose && !approve) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only those who propose or approve changes to a state pack see them.");
        String own = stateOf(me);
        String code = own != null ? own : state;
        if (code == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say which state's pack (state=XX).");
        if (own != null && state != null && !own.equals(state)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You see the changes of your own state only.");
        var pack = db.sql("select code, name, version, array_to_string(languages, ',') as languages, status from state_pack where code = ?")
                .param(code).query().listOfRows().stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No pack for this state."));
        var packOut = new java.util.LinkedHashMap<>(pack);
        packOut.put("languages", List.of(((String) pack.get("languages")).split(",")));
        List<Map<String, Object>> changes = db.sql("""
                select c.id, c.title, c.body, c.tested_note, c.drafted_at, u.full_name as drafted_by_name, u.rank as drafted_by_rank, c.drafted_by,
                       d.decision, d.note as decision_note, d.decided_at, v.full_name as decided_by_name, v.rank as decided_by_rank
                from pack_change c join app_user u on u.id = c.drafted_by
                left join pack_change_decision d on d.change_id = c.id left join app_user v on v.id = d.decided_by
                where c.state_code = ? order by c.drafted_at desc, c.id limit 100""").param(code).query().listOfRows();
        boolean mayDecide = approve && own != null;
        var out = new java.util.ArrayList<Map<String, Object>>();
        for (var c : changes) {
            var row = new java.util.LinkedHashMap<String, Object>(c);
            row.put("can_decide", mayDecide && c.get("decision") == null && !me.equals(c.get("drafted_by")));
            row.remove("drafted_by");
            out.add(row);
        }
        return Map.of("pack", packOut, "changes", out, "can_propose", propose && (own == null || own.equals(code)));
    }

    @PostMapping("/api/pack-changes")
    ResponseEntity<Map<String, Object>> propose(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewChange c) {
        UUID me = CaseTeam.user(jwt);
        if (!team.can(me, PROPOSE)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the state's setup officer proposes a change to a pack.");
        String own = stateOf(me);
        if (own != null && !own.equals(c.state)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You propose changes to the pack of your own state only.");
        if (db.sql("select count(*) from state_pack where code = ?").param(c.state).query(Long.class).single() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No pack for this state.");
        String tested = c.testedNote == null || c.testedNote.isBlank() ? null : c.testedNote.trim();
        if (tested != null && tested.length() < 5) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say in a few words how it was tested, or leave it empty.");
        UUID id = db.sql("insert into pack_change (state_code, title, body, tested_note, drafted_by) values (?,?,?,?,?) returning id")
                .params(c.state, c.title.trim(), c.body.trim(), tested, me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/pack-changes/{id}/decision")
    Map<String, Object> decide(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Decision x) {
        UUID me = CaseTeam.user(jwt);
        var change = db.sql("select state_code, drafted_by from pack_change where id = ?").param(id).query().listOfRows().stream().findFirst().orElse(null);
        // the same answer for a change that does not exist and one of another state: the list of another state is not shown
        if (!team.can(me, APPROVE)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the approving authority of the state decides a pack change.");
        if (change == null || !change.get("state_code").equals(stateOf(me))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such change in your state.");
        if (me.equals(change.get("drafted_by"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You proposed this change; someone else decides it.");
        if (db.sql("select count(*) from pack_change_decision where change_id = ?").param(id).query(Long.class).single() > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This change has been decided already. Propose it again to change the answer.");
        boolean approve = x.decision.equals("approve");
        String note = x.note == null || x.note.isBlank() ? null : x.note.trim();
        if (!approve && (note == null || note.length() < 10))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the reason for sending the change back (at least 10 characters).");
        db.sql("insert into pack_change_decision (change_id, decision, note, decided_by) values (?,?,?,?)")
                .params(id, approve ? "approved" : "returned", note, me).update();
        return Map.of("decision", approve ? "approved" : "returned");
    }
}
