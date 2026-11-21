package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The report to the Magistrate on sections added during the investigation (A2, V64). The screen drafts the text from the
 * case (FIR number, dates, sections and the reasons given); the officer edits it, sends it to the court and records
 * here which court, the day it was sent, the text as sent and the added sections it covers. Each added section is
 * reported once; until it is, the readiness check shows it as a gap. Case team only; kept as written.
 */
@RestController
@RequestMapping("/api/firs/{firId}/section-reports")
class SectionReportController {
    record Section(@NotBlank String act, @NotBlank String section) {}

    record Report(@NotBlank @Size(min = 3, max = 200) String court, @NotNull LocalDate sentOn,
            @NotBlank @Size(min = 40, max = 20000) String text, @NotNull @Size(min = 1, max = 50) List<@Valid Section> sections) {}

    private final JdbcClient db;
    private final CaseTeam team;

    SectionReportController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    /** Added sections not yet in a report, oldest first (also read by the readiness check). */
    static List<Map<String, Object>> unreported(JdbcClient db, UUID firId) {
        return db.sql("""
                select s.act, s.section, s.added_at, s.reason from fir_section s
                where s.fir_id = ? and s.added_at is not null
                  and not exists (select 1 from section_report_item i where i.fir_id = s.fir_id and i.act = s.act and i.section = s.section)
                order by s.added_at, s.act, s.section""").param(firId).query().listOfRows();
    }

    @GetMapping
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var reports = db.sql("""
                select r.id, r.court, r.sent_on, r.report_text, r.recorded_at, u.full_name as recorded_by_name
                from section_report r join app_user u on u.id = r.recorded_by where r.fir_id = ? order by r.sent_on, r.recorded_at""")
                .param(firId).query().listOfRows();
        var items = db.sql("select report_id, act, section from section_report_item where fir_id = ? order by act, section")
                .param(firId).query().listOfRows();
        for (var r : reports)
            r.put("sections", items.stream().filter(i -> i.get("report_id").equals(r.get("id")))
                    .map(i -> Map.of("act", i.get("act"), "section", i.get("section"))).toList());
        var court = db.sql("""
                select court from (select court, recorded_at from section_report where fir_id = ?
                                   union all select court, recorded_at from court_event where fir_id = ? and court is not null) c
                order by recorded_at desc limit 1""").params(firId, firId).query(String.class).optional().orElse(null);
        var out = new LinkedHashMap<String, Object>();
        out.put("reports", reports);
        out.put("unreported", unreported(db, firId));
        out.put("court", court);
        return out;
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, Object>> record(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Report r) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (r.court.trim().length() < 3) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name the court the report was sent to.");
        if (r.text.trim().length() < 40) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Keep the text of the report as it was sent.");
        if (r.sentOn.isAfter(db.sql("select ist_date(now())").query(LocalDate.class).single()))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A report cannot be sent on a later day.");
        var open = unreported(db, firId);
        var seen = new HashSet<String>();
        for (var s : r.sections) {
            var match = open.stream().filter(o -> o.get("act").equals(s.act) && o.get("section").equals(s.section)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            s.act + " " + s.section + " is not a section added to this FIR that is waiting for its report."));
            if (!seen.add(s.act + " " + s.section)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A section is named twice.");
            var added = db.sql("select ist_date(?)").param(match.get("added_at")).query(LocalDate.class).single();
            if (r.sentOn.isBefore(added))
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, s.act + " " + s.section + " was added on " + added + "; the report cannot be sent before that.");
        }
        // a section reported meanwhile by another officer is refused by the database (one report per section, 400)
        UUID id = db.sql("insert into section_report (fir_id, court, sent_on, report_text, recorded_by) values (?, ?, ?, ?, ?) returning id")
                .params(firId, r.court.trim(), r.sentOn, r.text.trim(), me).query(UUID.class).single();
        for (var s : r.sections)
            db.sql("insert into section_report_item (report_id, fir_id, act, section) values (?, ?, ?, ?)").params(id, firId, s.act, s.section).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }
}
