package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
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
 * Court and trial tracker (design board 12, V45): the dates of a case in court and the summons to each witness. The list
 * is of the cases the caller may open; writing is for the case team. Rows are kept as written. The "next date" is the
 * earliest coming court date. The board's ICJS feed, AI prosecutor brief and victim-update button are not built here
 * (the victim update is on the FIR's own part, BNSS 193(3)(ii)). Nothing here judges a witness, an accused or the case.
 */
@RestController
class CourtController {
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    record NewEvent(@NotBlank @Pattern(regexp = "chargesheet_filed|cognizance|copies_given|charge_framing|prosecution_evidence|arguments|judgment|other") String kind,
            @NotBlank String date, @Size(max = 160) String court, @Size(max = 60) String caseNo, @Size(max = 500) String note) {}

    record NewSummons(@NotBlank @Size(min = 2, max = 160) String witness, @Size(max = 100) String role,
            @NotBlank @Pattern(regexp = "sent|served|not_served|appeared|excused") String status, @NotBlank String date, @Size(max = 500) String note) {}

    private final JdbcClient db;
    private final CaseTeam team;

    CourtController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/court")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        var cases = db.sql("""
                select fir.id as fir_id, fir.fir_no, fir.fir_year, s.name as station,
                       (select court from court_event where fir_id = fir.id and court is not null order by recorded_at desc, id desc limit 1) as court,
                       (select case_no from court_event where fir_id = fir.id and case_no is not null order by recorded_at desc, id desc limit 1) as case_no,
                       (select min(on_date) from court_event where fir_id = fir.id and on_date >= ?) as next_date,
                       (select count(*) from court_event where fir_id = fir.id) as events,
                       (select count(*) from (select distinct on (lower(btrim(witness))) status from court_summons where fir_id = fir.id
                                              order by lower(btrim(witness)), recorded_at desc, id desc) w where w.status in ('sent', 'not_served')) as summons_open
                from fir join police_station s on s.id = fir.station_id
                where exists (select 1 from court_event where fir_id = fir.id) and """ + " " + team.canReadFirSql() + """
                 order by next_date nulls last, fir.fir_year desc, fir.fir_no desc limit 500""").params(LocalDate.now(IST), me).query().listOfRows();
        long coming = cases.stream().filter(c -> c.get("next_date") != null).count();
        return Map.of("cases", cases, "counts", Map.of("coming", coming, "no_date", cases.size() - coming));
    }

    @GetMapping("/api/firs/{firId}/court")
    Map<String, Object> one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        List<Map<String, Object>> events = db.sql("select id, kind, on_date, court, case_no, note from court_event where fir_id = ? order by on_date, recorded_at, id")
                .param(firId).query().listOfRows();
        List<Map<String, Object>> summons = db.sql("""
                select distinct on (lower(btrim(witness))) id, witness, role, status, on_date, note from court_summons where fir_id = ?
                 order by lower(btrim(witness)), recorded_at desc, id desc""").param(firId).query().listOfRows();
        return Map.of("events", events, "summons", summons);
    }

    @PostMapping("/api/firs/{firId}/court-events")
    ResponseEntity<Map<String, Object>> addEvent(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewEvent e) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        LocalDate on = date(e.date);
        LocalDate registered = db.sql("select (registered_at at time zone 'Asia/Kolkata')::date from fir where id = ?").param(firId).query(LocalDate.class).single();
        if (on.isBefore(registered)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A court date cannot be before the FIR was registered.");
        UUID id = db.sql("insert into court_event (fir_id, kind, on_date, court, case_no, note, recorded_by) values (?, ?, ?, ?, ?, ?, ?) returning id")
                .params(firId, e.kind, on, shortText(e.court), blankToNull(e.caseNo), blankToNull(e.note), me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/firs/{firId}/court-summons")
    ResponseEntity<Map<String, Object>> addSummons(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewSummons s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        LocalDate on = date(s.date);
        if (on.isAfter(LocalDate.now(IST))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date of a summons step cannot be in the future.");
        UUID id = db.sql("insert into court_summons (fir_id, witness, role, status, on_date, note, recorded_by) values (?, ?, ?, ?, ?, ?, ?) returning id")
                .params(firId, s.witness.trim(), shortText(s.role), s.status, on, blankToNull(s.note), me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text);
        } catch (DateTimeException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date must be written as YYYY-MM-DD.");
        }
    }

    /** A court name or role: blank means none, one letter is a mistake. */
    private static String shortText(String text) {
        String t = blankToNull(text);
        if (t != null && t.length() < 2) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A court name or role needs at least two letters.");
        return t;
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
