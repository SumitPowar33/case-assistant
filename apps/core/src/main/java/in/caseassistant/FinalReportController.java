package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Draft and sign the final report under BNSS 193 (design board 10, V41). The officer writes the facts in brief and the
 * evidence for the charges (the AI gateway may draft them later; a person always reads and decides), submits the draft
 * once the readiness check has been made and has no open gap, the holder of {@code chargesheet.approve} (packs
 * roles.json) approves it or returns it with a reason, and the officer who submitted it signs. Nobody approves their
 * own submission. Every step is kept in an event list nobody can change. Filing with the court is recorded elsewhere
 * (chargesheets, V14).
 */
@RestController
@RequestMapping("/api/firs/{firId}/final-report")
class FinalReportController {
    static final String APPROVE = "chargesheet.approve";

    record Words(@NotBlank @Pattern(regexp = "[a-z]{2,3}") String language, @Size(max = 40000) String facts, @Size(max = 40000) String evidence) {}
    record Decision(@NotBlank @Pattern(regexp = "approve|return") String decision, @Size(max = 2000) String note) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ReadinessController readiness;

    FinalReportController(JdbcClient db, CaseTeam team, ReadinessController readiness) {
        this.db = db;
        this.team = team;
        this.readiness = readiness;
    }

    private UUID stationOf(UUID firId) {
        return db.sql("select station_id from fir where id = ?").param(firId).query(UUID.class).single();
    }

    private Map<String, Object> draft(UUID firId) {
        return db.sql("select * from final_report_draft where fir_id = ?").param(firId).query().listOfRows().stream().findFirst().orElse(null);
    }

    private void event(UUID draft, UUID by, String action, String note) {
        db.sql("insert into final_report_event (draft_id, by_user, action, note) values (?,?,?,?)").params(draft, by, action, note).update();
    }

    @GetMapping
    Map<String, Object> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var d = draft(firId);
        var out = new LinkedHashMap<String, Object>();
        out.put("draft", d == null ? null : db.sql("""
                select d.id, d.language, d.facts_text, d.evidence_text, d.status, d.updated_at, s.full_name as submitted_by_name,
                       a.full_name as decided_by_name, g.full_name as signed_by_name, d.submitted_by, d.decided_by, d.signed_by
                from final_report_draft d left join app_user s on s.id = d.submitted_by left join app_user a on a.id = d.decided_by
                left join app_user g on g.id = d.signed_by where d.fir_id = ?""").param(firId).query().singleRow());
        out.put("events", d == null ? java.util.List.of() : db.sql("""
                select e.at, e.action, e.note, u.full_name as by_name from final_report_event e join app_user u on u.id = e.by_user
                where e.draft_id = ? order by e.at, e.id""").param(d.get("id")).query().listOfRows());
        boolean checked = db.sql("select exists (select 1 from case_playbook where fir_id = ?)").param(firId).query(Boolean.class).single();
        out.put("readinessChecked", checked);
        out.put("openGaps", readiness.openGaps(firId));
        out.put("canApprove", team.canAt(me, APPROVE, stationOf(firId)));
        out.put("particulars", db.sql("""
                select (select coalesce(string_agg(act || ' ' || section, ', ' order by act, section), '') from fir_section where fir_id = :f) as sections,
                       (select count(*) from person where fir_id = :f and role = 'accused') as accused,
                       (select count(*) from person where fir_id = :f and role = 'witness') as witnesses,
                       (select count(distinct person_id) from witness_statement where fir_id = :f) as statements_from,
                       (select count(*) from evidence_item where fir_id = :f) as evidence_items""")
                .param("f", firId).query().singleRow());
        return out;
    }

    /** Creates the draft, or changes the words of one that is a draft or returned. */
    @PutMapping
    Map<String, Object> save(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Words w) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var d = draft(firId);
        String facts = w.facts == null ? "" : w.facts.trim(), evidence = w.evidence == null ? "" : w.evidence.trim();
        if (d == null) {
            UUID id = db.sql("insert into final_report_draft (fir_id, language, facts_text, evidence_text, created_by) values (?,?,?,?,?) returning id")
                    .params(firId, w.language, facts, evidence, me).query(UUID.class).single();
            event(id, me, "saved", null);
            return Map.of("id", id, "status", "draft");
        }
        String status = (String) d.get("status");
        if (!status.equals("draft") && !status.equals("returned"))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The words can be changed only while the report is a draft or returned (now " + status + ").");
        db.sql("update final_report_draft set language = ?, facts_text = ?, evidence_text = ?, updated_at = clock_timestamp() where id = ?")
                .params(w.language, facts, evidence, d.get("id")).update();
        event((UUID) d.get("id"), me, "saved", null);
        return Map.of("id", d.get("id"), "status", status);
    }

    @PostMapping("/submit")
    Map<String, Object> submit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var d = draft(firId);
        if (d == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Write the facts and the evidence first.");
        String status = (String) d.get("status");
        if (!status.equals("draft") && !status.equals("returned"))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This report was already submitted (now " + status + ").");
        if (((String) d.get("facts_text")).isBlank() || ((String) d.get("evidence_text")).isBlank()
                || ((String) d.get("facts_text")).trim().length() < 20 || ((String) d.get("evidence_text")).trim().length() < 20)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Write the facts in brief and the evidence (at least 20 characters each) before submitting.");
        if (!db.sql("select exists (select 1 from case_playbook where fir_id = ?)").param(firId).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose the playbook and make the readiness check before submitting.");
        long gaps = readiness.openGaps(firId);
        if (gaps > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, gaps + " gap(s) of the readiness check are open. Close each, or accept it in writing, before submitting.");
        db.sql("update final_report_draft set status = 'submitted', submitted_by = ?, decided_by = null, updated_at = clock_timestamp() where id = ?")
                .params(me, d.get("id")).update();
        event((UUID) d.get("id"), me, "submitted", null);
        return Map.of("status", "submitted");
    }

    @PostMapping("/decision")
    Map<String, Object> decide(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Decision x) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (!team.canAt(me, APPROVE, stationOf(firId)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the station head or the district head approves or returns a final report.");
        var d = draft(firId);
        if (d == null || !"submitted".equals(d.get("status")))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "There is no submitted report to decide.");
        if (me.equals(d.get("submitted_by")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You submitted this report; someone else approves it.");
        boolean approve = x.decision.equals("approve");
        String note = x.note == null || x.note.isBlank() ? null : x.note.trim();
        if (!approve && (note == null || note.length() < 10))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the reason for returning the report (at least 10 characters).");
        String status = approve ? "approved" : "returned";
        db.sql("update final_report_draft set status = ?, decided_by = ?, updated_at = clock_timestamp() where id = ?").params(status, me, d.get("id")).update();
        event((UUID) d.get("id"), me, status, note);
        return Map.of("status", status);
    }

    @PostMapping("/sign")
    Map<String, Object> sign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var d = draft(firId);
        if (d == null || !"approved".equals(d.get("status")))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an approved report is signed.");
        if (!me.equals(d.get("submitted_by")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The officer who submitted the report signs it.");
        db.sql("update final_report_draft set status = 'signed', signed_by = ?, updated_at = clock_timestamp() where id = ?").params(me, d.get("id")).update();
        event((UUID) d.get("id"), me, "signed", null);
        return Map.of("status", "signed");
    }
}
