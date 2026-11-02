package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.LinkedHashMap;
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
 * The case diary under BNSS 192 (design board 14, V39): one page per day. The officer's own entries, and the steps taken
 * in the app that day read from their own records (so they are never typed twice). Only the case team reads or writes it
 * (reads: ReadAccess); a protected case's diary is logged like its people. Entries go on today's page only, and a closed
 * page takes no more; nothing is changed or removed.
 */
@RestController
@RequestMapping("/api/firs/{firId}/diary")
class CaseDiaryController {
    record Entry(@NotBlank @Size(min = 3, max = 5000) String text) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ProtectedReads reads;

    CaseDiaryController(JdbcClient db, CaseTeam team, ProtectedReads reads) {
        this.db = db;
        this.team = team;
        this.reads = reads;
    }

    private LocalDate today() {
        return db.sql("select ist_date(now())").query(LocalDate.class).single();
    }

    /** One day's page (today unless a date is given), and the list of days that have a page. */
    @GetMapping
    Map<String, Object> page(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @RequestParam(required = false) LocalDate date) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        LocalDate day = date == null ? today() : date;
        var entries = db.sql("""
                select e.at, e.text, u.full_name as author_name from case_diary_entry e join app_user u on u.id = e.author
                where e.fir_id = ? and e.diary_date = ? order by e.at""").params(firId, day).query().listOfRows();
        // the steps taken in the app that day, from their own records; labels and codes only, no person's name
        var events = db.sql("""
                select issued_at as at, 'notice_sent' as what, kind || ' · ' || addressee as detail from notice
                  where fir_id = ? and issued_at is not null and ist_date(issued_at) = ?
                union all select seized_at, 'evidence_seized', label from evidence_item where fir_id = ? and ist_date(seized_at) = ?
                union all select a.arrested_at, 'arrest', p.label from arrest_current a join person p on p.id = a.person_id
                  where p.fir_id = ? and ist_date(a.arrested_at) = ?
                union all select at, 'io_assigned', null from fir_io_assignment where fir_id = ? and ist_date(at) = ?
                union all select recorded_at, 'victim_update', told_to from victim_update where fir_id = ? and ist_date(recorded_at) = ?
                union all select recorded_at, 'chargesheet', report_no from chargesheet where fir_id = ? and ist_date(recorded_at) = ?
                order by 1""").params(firId, day, firId, day, firId, day, firId, day, firId, day, firId, day).query().listOfRows();
        var closed = db.sql("""
                select p.page_no, p.closed_at, u.full_name as closed_by_name from case_diary_page p join app_user u on u.id = p.closed_by
                where p.fir_id = ? and p.diary_date = ?""").params(firId, day).query().listOfRows();
        var days = db.sql("""
                select d.diary_date, p.page_no from (select distinct diary_date from case_diary_entry where fir_id = ?
                  union select diary_date from case_diary_page where fir_id = ?) d
                left join case_diary_page p on p.fir_id = ? and p.diary_date = d.diary_date order by d.diary_date desc limit 60""")
                .params(firId, firId, firId).query().listOfRows();
        if (!entries.isEmpty() && team.identityProtected(firId)) reads.fir(me, firId, "diary");
        var out = new LinkedHashMap<String, Object>();
        out.put("date", day);
        out.put("today", day.equals(today()));
        out.put("page", closed.isEmpty() ? null : closed.get(0));
        out.put("entries", entries);
        out.put("events", events);
        out.put("days", days);
        return out;
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Entry e) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        try {
            var at = db.sql("insert into case_diary_entry (fir_id, author, text) values (?, ?, ?) returning at")
                    .params(firId, me, e.text.trim()).query(java.time.OffsetDateTime.class).single();
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("at", at));
        } catch (DataIntegrityViolationException closedPage) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Today's page of the case diary is closed. Write it on tomorrow's page.");
        }
    }

    /** Closes today's page with the next page number. A day with nothing written cannot be closed. */
    @PostMapping("/close")
    @Transactional
    Map<String, Object> close(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        db.sql("select pg_advisory_xact_lock(hashtext('diary:' || ?::text))").param(firId).query().listOfRows();
        LocalDate day = today();
        if (db.sql("select exists (select 1 from case_diary_page where fir_id = ? and diary_date = ?)").params(firId, day).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Today's page of the case diary is already closed.");
        if (!db.sql("select exists (select 1 from case_diary_entry where fir_id = ? and diary_date = ?)").params(firId, day).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Write at least one entry before closing today's page.");
        int pageNo = db.sql("""
                insert into case_diary_page (fir_id, diary_date, page_no, closed_by)
                values (?, ?, (select coalesce(max(page_no), 0) + 1 from case_diary_page where fir_id = ?), ?) returning page_no""")
                .params(firId, day, firId, me).query(Integer.class).single();
        return Map.of("page_no", pageNo);
    }
}
