package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Freezing bank accounts (V57). The freeze itself is a notice of kind BNSS_106 to the bank naming the accounts, drafted,
 * signed and sent like any notice. Here: each such notice with what followed it: the report of the seizure to the
 * Magistrate (BNSS 106(3); its deadline is in case_deadline until recorded) and the release of the freeze (the order or
 * letter, with a reason), each recorded once and kept as written; and the amounts the bank says it holds on those accounts
 * (the money trail's holds, matched by account, spaces and case ignored). Case team only.
 */
@RestController
class FreezeController {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    record Step(@NotBlank String kind, @NotNull LocalDate onDate, @NotBlank @Size(min = 3, max = 200) String reference,
                @Size(max = 1000) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;

    FreezeController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/firs/{firId}/freezes")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var rows = db.sql("""
                select n.id, n.addressee, to_json(n.items_requested)::text as accounts, n.status, n.issued_at,
                       ist_date(n.issued_at) + effective_policy_days(f.station_id, 'freeze_report_days', 1) as report_due_on,
                       (select coalesce(sum(h.amount_paise), 0) from money_hold h where h.fir_id = n.fir_id
                          and upper(regexp_replace(h.account, '\\s', '', 'g')) in (select upper(regexp_replace(a, '\\s', '', 'g')) from unnest(n.items_requested) a)) as held_paise
                from notice n join fir f on f.id = n.fir_id
                where n.fir_id = ? and n.kind = 'BNSS_106' and n.status <> 'draft' order by n.issued_at""").param(firId).query().listOfRows();
        for (var r : rows) {
            var steps = new LinkedHashMap<String, Object>();
            for (var s : db.sql("""
                    select s.kind, s.on_date, s.reference, s.reason, s.recorded_at, u.full_name as recorded_by
                    from freeze_step s join app_user u on u.id = s.recorded_by where s.notice_id = ?""").param(r.get("id")).query().listOfRows())
                steps.put((String) s.remove("kind"), s);
            r.put("steps", steps);
        }
        return rows;
    }

    @PostMapping("/api/firs/{firId}/freezes/{noticeId}/steps")
    ResponseEntity<Map<String, Object>> step(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID noticeId, @Valid @RequestBody Step in) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (!in.kind.equals("reported") && !in.kind.equals("released")) throw bad("A step is the report to the Magistrate or the release.");
        var n = db.sql("select status, ist_date(issued_at) as issued_on from notice where id = ? and fir_id = ? and kind = 'BNSS_106'")
                .params(noticeId, firId).query().listOfRows();
        if (n.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such freeze notice in this FIR.");
        String status = (String) n.get(0).get("status");
        if (status.equals("draft") || status.equals("cancelled")) throw bad("Sign and send the freeze notice to the bank first.");
        LocalDate issued = ((java.sql.Date) n.get(0).get("issued_on")).toLocalDate();
        if (in.onDate.isBefore(issued) || in.onDate.isAfter(LocalDate.now(IST)))
            throw bad("The date must be between the day the notice was issued (" + issued + ") and today.");
        var done = db.sql("select kind from freeze_step where notice_id = ?").param(noticeId).query(String.class).list();
        if (done.contains(in.kind)) throw bad(in.kind.equals("reported") ? "The report to the Magistrate is already recorded." : "The release is already recorded.");
        String reason = in.reason == null || in.reason.isBlank() ? null : in.reason.trim();
        if (in.kind.equals("released")) {
            if (!done.contains("reported")) throw bad("Record the report to the Magistrate before the release.");
            if (reason == null || reason.length() < 10) throw bad("Give the reason for the release (at least 10 characters).");
        }
        UUID id = db.sql("insert into freeze_step (notice_id, kind, on_date, reference, reason, recorded_by) values (?,?,?,?,?,?) returning id")
                .params(noticeId, in.kind, in.onDate, in.reference.trim(), reason, me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
