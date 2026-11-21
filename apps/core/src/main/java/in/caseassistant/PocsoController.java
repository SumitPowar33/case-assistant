package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * POCSO case mode (item 15, V56): whether the FIR is a POCSO case and its legal steps, each open until the case team
 * records it done. Two have a 24-hour limit from the information (POCSO 19(6), POCSO 27 with BNSS 184(1)) and are also
 * deadlines; the others have no limit in the law. No names are recorded: only the step, when and who recorded it.
 */
@RestController
@RequestMapping("/api/firs/{firId}")
class PocsoController {
    /** The steps in the order the screen shows them, with the law and the limit in hours (null: no limit in the law). */
    static final List<Object[]> STEPS = List.of(
            new Object[] {"cwc_court_report", "POCSO 19(6)", 24},
            new Object[] {"medical_examination", "POCSO 27; BNSS 184(1)", 24},
            new Object[] {"statement_chosen_place", "POCSO 24", null},
            new Object[] {"magistrate_statement", "BNSS 183; POCSO 25", null},
            new Object[] {"support_person", "POCSO Rules 2020, rule 4", null},
            new Object[] {"interim_compensation", "POCSO 33(8); POCSO Rules 2020, rule 9", null});

    record Step(@NotNull @Pattern(regexp = "cwc_court_report|medical_examination|statement_chosen_place|magistrate_statement|support_person|interim_compensation") String step,
                @NotNull OffsetDateTime doneAt) {}

    private final JdbcClient db;
    private final CaseTeam team;

    PocsoController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/pocso")
    Map<String, Object> pocso(@PathVariable UUID firId) {
        Map<String, Object> fir = db.sql("""
                select pocso_case(id) as pocso, information_received_at + interval '24 hours' as due_at
                from fir where id = ?""").param(firId).query().singleRow();
        List<Map<String, Object>> steps = new ArrayList<>();
        if ((Boolean) fir.get("pocso")) {
            // the latest record of each step counts (a mistake is answered by recording the step again)
            Map<String, Map<String, Object>> done = new LinkedHashMap<>();
            db.sql("""
                    select p.step, p.done_at, u.full_name as recorded_by_name from pocso_step p join app_user u on u.id = p.recorded_by
                    where p.fir_id = ? order by p.recorded_at""").param(firId).query().listOfRows()
                    .forEach(r -> done.put((String) r.get("step"), r));
            for (Object[] s : STEPS) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("step", s[0]);
                row.put("basis", s[1]);
                row.put("limit_hours", s[2]);
                row.put("due_at", s[2] == null ? null : fir.get("due_at"));
                Map<String, Object> d = done.get(s[0]);
                row.put("done_at", d == null ? null : d.get("done_at"));
                row.put("recorded_by_name", d == null ? null : d.get("recorded_by_name"));
                steps.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pocso", fir.get("pocso"));
        out.put("steps", steps);
        return out;
    }

    @PostMapping("/pocso-steps")
    ResponseEntity<Map<String, UUID>> record(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Step s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (s.doneAt.isAfter(OffsetDateTime.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The time a step was done cannot be in the future.");
        Map<String, Object> fir = db.sql("select pocso_case(id) as pocso, ?::timestamptz < information_received_at as early from fir where id = ?")
                .params(s.doneAt, firId).query().singleRow();
        if (!(Boolean) fir.get("pocso"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This FIR is not a POCSO case.");
        // a hospital may examine the child before it informs the police (POCSO 19(1), V63); no other step comes before
        if ((Boolean) fir.get("early") && !s.step.equals("medical_examination"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A step cannot be before the information was received.");
        UUID id = db.sql("insert into pocso_step (fir_id, step, done_at, recorded_by) values (?,?,?,?) returning id")
                .params(firId, s.step, s.doneAt, me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }
}
