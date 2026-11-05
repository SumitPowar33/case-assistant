package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Forensic and medical requests (design board 16, V44): requests sent to a lab or a hospital and the steps until the
 * report is back. The list is of the cases the caller may open (case team, station readers); writing is for the case
 * team. Steps are kept as written; the status of a request is its newest step. A request with no report for
 * {@link #REMINDER_DAYS} days is marked "reminder due" (the officer decides to send it). Nothing here judges a report.
 */
@RestController
class ExpertRequestController {
    static final int REMINDER_DAYS = 30;
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    record NewRequest(@NotBlank @Pattern(regexp = "forensic|medical") String kind, @NotBlank @Size(min = 2, max = 200) String subject,
            @NotBlank @Size(min = 2, max = 160) String sentTo, @NotBlank String date, String evidenceId) {}

    record NewStep(@NotBlank @Pattern(regexp = "at_lab|sample_sent|report_received|reminder_sent") String status, @NotBlank String date,
            @Size(max = 500) String note) {}

    private final JdbcClient db;
    private final CaseTeam team;

    ExpertRequestController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/expert-requests")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        var rows = db.sql("""
                select r.id, r.fir_id, r.kind, r.subject, r.sent_to, r.sent_on, fir.fir_no, fir.fir_year, s.name as station,
                       n.status, n.on_date as status_on, n.note, e.label as evidence_label
                from expert_request r
                join fir on fir.id = r.fir_id
                join police_station s on s.id = fir.station_id
                left join evidence_item e on e.id = r.evidence_item_id
                left join lateral (select * from expert_request_step where request_id = r.id and status <> 'reminder_sent'
                                   order by recorded_at desc, id desc limit 1) n on true
                where """ + " " + team.canReadFirSql() + """
                 order by (n.status = 'report_received') nulls first, r.sent_on, r.id limit 500""").params(me).query().listOfRows();
        LocalDate today = LocalDate.now(IST);
        var counts = new LinkedHashMap<String, Integer>();
        for (String k : List.of("open", "reminder_due", "report_received")) counts.put(k, 0);
        for (var r : rows) {
            boolean done = "report_received".equals(r.get("status"));
            long days = ChronoUnit.DAYS.between(((java.sql.Date) r.get("sent_on")).toLocalDate(), today);
            r.put("days_waiting", done ? null : days);
            r.put("reminder_due", !done && days >= REMINDER_DAYS);
            counts.merge(done ? "report_received" : "open", 1, Integer::sum);
            if (!done && days >= REMINDER_DAYS) counts.merge("reminder_due", 1, Integer::sum);
        }
        return Map.of("requests", rows, "counts", counts, "reminderDays", REMINDER_DAYS);
    }

    @GetMapping("/api/firs/{firId}/expert-requests/{id}/steps")
    List<Map<String, Object>> steps(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID id) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        return db.sql("select id, status, on_date, note, recorded_at from expert_request_step where request_id = ? and fir_id = ? order by recorded_at, id")
                .params(id, firId).query().listOfRows();
    }

    @PostMapping("/api/firs/{firId}/expert-requests")
    @Transactional
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewRequest r) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        LocalDate on = pastDate(r.date);
        UUID evidence = optionalId(r.evidenceId);
        try {
            UUID id = db.sql("""
                    insert into expert_request (fir_id, kind, subject, sent_to, sent_on, evidence_item_id, recorded_by)
                    values (?, ?, ?, ?, ?, ?, ?) returning id""")
                    .params(firId, r.kind, r.subject.trim(), r.sentTo.trim(), on, evidence, me).query(UUID.class).single();
            db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, recorded_by) values (?, ?, 'sent', ?, ?)").params(id, firId, on, me).update();
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
        } catch (DataIntegrityViolationException notOfThisCase) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The evidence item must belong to this case.");
        }
    }

    @PostMapping("/api/firs/{firId}/expert-requests/{id}/steps")
    ResponseEntity<Map<String, Object>> step(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID id, @Valid @RequestBody NewStep s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        LocalDate sentOn = db.sql("select sent_on from expert_request where id = ? and fir_id = ?").params(id, firId).query(LocalDate.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such request in this case."));
        LocalDate on = pastDate(s.date);
        if (on.isBefore(sentOn)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date cannot be before the request was sent.");
        if (db.sql("select count(*) from expert_request_step where request_id = ? and status = 'report_received'").param(id).query(Long.class).single() > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The report has already been received for this request.");
        String note = s.note == null || s.note.isBlank() ? null : s.note.trim();
        UUID stepId = db.sql("insert into expert_request_step (request_id, fir_id, status, on_date, note, recorded_by) values (?, ?, ?, ?, ?, ?) returning id")
                .params(id, firId, s.status, on, note, me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", stepId));
    }

    /** The day of the step: a real date, not in the future (Indian time). */
    private static LocalDate pastDate(String text) {
        try {
            LocalDate d = LocalDate.parse(text);
            if (d.isAfter(LocalDate.now(IST))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date cannot be in the future.");
            return d;
        } catch (DateTimeException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date must be written as YYYY-MM-DD.");
        }
    }

    private static UUID optionalId(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An id must be one of this case.");
        }
    }
}
