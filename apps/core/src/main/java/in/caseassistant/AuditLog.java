package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.Types;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * One audit screen (board 20): for a police station, newest first, the reads of protected victim details, the
 * readiness gaps a person accepted with a reason (and their withdrawals), the checks of an accused's earlier records
 * (InvolvementController; what: the person's label and the number of records found), the reads of call records
 * (CdrController; what: the number of files), the exports of a case's audit entries and the admin's changes to accounts
 * and the station. All of them are append-only tables.
 *
 * <p>The AI's drafts and decisions are kept by the AI gateway, which holds no station: it asks {@link #cases} which cases
 * of the station the signed-in auditor may see (GET /api/audit-log/cases, with the officer's own token) and the screen
 * names the officers through {@link #people}. {@link #export} gives one case's entries with a reason, and keeps that the
 * export was taken (V72). The same permission as the reads log, at the station.
 */
@RestController
class AuditLog {
    static final int MOST_PEOPLE = 200;
    private final JdbcClient db;
    private final CaseTeam team;
    private final Playbooks playbooks;

    AuditLog(JdbcClient db, CaseTeam team, Playbooks playbooks) {
        this.db = db;
        this.team = team;
        this.playbooks = playbooks;
    }

    record Export(@NotNull UUID firId, @NotBlank String reason) {}

    @GetMapping("/api/audit-log")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId,
            @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
        if (limit < 1 || limit > 200 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to 200 and offset 0 or more");
        requireAuditor(jwt, stationId);
        return named(db.sql(described(entries("r.station_id = :st", "f.station_id = :st", "e.station_id = :st", "a.station_id = :st or t.station_id = :st"))
                        + " order by at desc, kind limit :lim offset :off")
                .param("st", stationId).param("lim", limit).param("off", offset).query().listOfRows());
    }

    /**
     * The cases of one station, newest FIR first: its FIRs and its front-desk complaints (the AI is also used on a signed
     * complaint). Numbers only, nothing of their content. With {@code firId}: that FIR and the complaint it came from.
     */
    @GetMapping("/api/audit-log/cases")
    List<Map<String, Object>> cases(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId, @RequestParam(required = false) UUID firId) {
        requireAuditor(jwt, stationId);
        if (firId != null && !db.sql("select exists (select 1 from fir where id = ? and station_id = ?)").params(firId, stationId).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such FIR at this police station.");
        // the cast: an empty parameter has no type of its own
        return db.sql("""
                select id, kind, fir_id, ref from (
                  select f.id, 'fir' as kind, f.id as fir_id, f.fir_year || '/' || f.fir_no as ref, f.fir_year, f.fir_no from fir f
                  where f.station_id = :st and (:fir::uuid is null or f.id = :fir::uuid)
                  union all
                  select c.id, 'complaint', c.fir_id, f.fir_year || '/' || f.fir_no, f.fir_year, f.fir_no from complaint c left join fir f on f.id = c.fir_id
                  where c.station_id = :st and (:fir::uuid is null or c.fir_id = :fir::uuid)
                ) x order by fir_year desc nulls last, fir_no desc, kind desc, id""")
                .param("st", stationId).param("fir", firId, Types.OTHER).query().listOfRows();
    }

    /** The name and rank of officers the AI gateway's entries name by id: only officers of the station's own state. */
    @GetMapping("/api/audit-log/people")
    List<Map<String, Object>> people(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId, @RequestParam(name = "id") List<UUID> ids) {
        requireAuditor(jwt, stationId);
        if (ids.size() > MOST_PEOPLE) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "at most " + MOST_PEOPLE + " officers at a time");
        return db.sql("""
                select u.id, u.full_name, u.rank from app_user u join police_station us on us.id = u.station_id
                where u.id = any(?) and us.state_code = (select state_code from police_station where id = ?)""")
                .params(ids.toArray(UUID[]::new), stationId).query().listOfRows();
    }

    /**
     * One case's entries, oldest first, for a court or an inquiry (the screen adds the AI gateway's entries and makes the
     * file). Taking it is written down first, with the reason. An FIR the caller does not audit answers 404. On a case that
     * protects the victim's identity (BNS 72, POCSO 23), a person outside its case team gets the entries without the
     * officers' written reasons, which are free text and may name the victim.
     */
    @Transactional
    @PostMapping("/api/audit-log/exports")
    Map<String, Object> export(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Export e) {
        UUID who = CaseTeam.user(jwt);
        var fir = db.sql("""
                select f.station_id, f.fir_year || '/' || f.fir_no as ref, s.name as station_name from fir f
                join police_station s on s.id = f.station_id where f.id = ?""").param(e.firId).query().listOfRows().stream().findFirst().orElse(null);
        if (fir == null || !team.canAt(who, ProtectedReads.PERMISSION, (UUID) fir.get("station_id")))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such FIR.");
        String reason = e.reason.trim();
        int length = reason.codePointCount(0, reason.length());   // as the database counts (V72)
        if (length < 10 || length > 500)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Write which court or inquiry asked for the export (10 to 500 characters).");
        db.sql("insert into audit_export (exported_by, station_id, fir_id, fir_ref, reason) values (?,?,?,?,?)")
                .params(who, fir.get("station_id"), e.firId, fir.get("ref"), reason).update();
        boolean withheld = team.identityProtected(e.firId) && !team.includes(who, e.firId);
        var rows = named(db.sql(described(entries("r.fir_id = :fir or r.complaint_id in (select id from complaint where fir_id = :fir)",
                "f.id = :fir", "e.fir_id = :fir", "false")) + " order by at, kind").param("fir", e.firId).query().listOfRows());
        if (withheld) rows.forEach(r -> r.put("reason", null));
        var by = db.sql("select full_name, rank from app_user where id = ?").param(who).query().singleRow();
        return Map.of("fir_ref", fir.get("ref"), "station_name", fir.get("station_name"), "exported_by_name", by.get("full_name"),
                "exported_by_rank", by.get("rank"), "reasons_withheld", withheld, "rows", rows);
    }

    private void requireAuditor(Jwt jwt, UUID stationId) {
        if (!team.canAt(CaseTeam.user(jwt), ProtectedReads.PERMISSION, stationId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only those who audit this police station see its audit log.");
    }

    /**
     * The entries with "about": what the stored key of an accepted readiness gap points at, in words that name nobody (an
     * account holder or an evidence item by its label, a notice by the day it was issued, a section, a POCSO step; the
     * playbook's ingredient text is added by {@link #named}). Null for every other entry, and when the record is gone.
     */
    private static String described(String entries) {
        return """
                select x.*, case when x.kind in ('override', 'override_withdrawn') then coalesce(
                    (select p.label from person p where p.fir_id = x.fir_id and x.what = 'second-link:' || p.id),
                    (select i.label from evidence_item i where i.fir_id = x.fir_id and x.what = 'certificate:' || i.id),
                    (select to_char(ist_date(n.issued_at), 'FMDD Mon YYYY') from notice n where n.fir_id = x.fir_id and x.what = 'notice-certificate:' || n.id),
                    case when x.what like 'section-report:%%' then substr(x.what, length('section-report:') + 1)
                         when x.what like 'pocso-step:%%' then substr(x.what, length('pocso-step:') + 1) end) end as about,
                  (select c.playbook_id from case_playbook c where c.fir_id = x.fir_id) as playbook_id
                from (%s) x""".formatted(entries);
    }

    /** Adds the ingredient's text to an accepted "ingredient:charge/ingredient" gap, from the case's playbook first. */
    private List<Map<String, Object>> named(List<Map<String, Object>> rows) {
        for (var r : rows) {
            String playbook = (String) r.remove("playbook_id");
            String what = (String) r.get("what");
            if (((String) r.get("kind")).startsWith("override") && what.startsWith("ingredient:"))
                r.put("about", playbooks.ingredientText(playbook, what.substring("ingredient:".length())).orElse(null));
        }
        return rows;
    }

    /** The rows of every audit table, each narrowed by its own condition: a station's log, or one case's export. */
    private static String entries(String reads, String firs, String exports, String admin) {
        return """
                select 'protected_read' as kind, r.at, u.full_name as who_name, u.rank as who_rank, r.what, null::text as reason, r.fir_id, r.fir_ref
                from protected_read r join app_user u on u.id = r.reader where %1$s
                union all
                select 'override', o.decided_at, u.full_name, u.rank, o.gap_key, o.reason, f.id, f.fir_year || '/' || f.fir_no
                from readiness_override o join fir f on f.id = o.fir_id join app_user u on u.id = o.decided_by where %2$s
                union all
                select 'override_withdrawn', o.withdrawn_at, u.full_name, u.rank, o.gap_key, o.withdrawn_reason, f.id, f.fir_year || '/' || f.fir_no
                from readiness_override o join fir f on f.id = o.fir_id join app_user u on u.id = o.withdrawn_by where (%2$s) and o.withdrawn_at is not null
                union all
                select 'involvement_search', i.at, u.full_name, u.rank, p.label || ': ' || i.matches, null, f.id, f.fir_year || '/' || f.fir_no
                from involvement_search i join fir f on f.id = i.fir_id join person p on p.id = i.person_id join app_user u on u.id = i.searcher where %2$s
                union all
                select 'cdr_read', c.at, u.full_name, u.rank, c.files::text, null, f.id, f.fir_year || '/' || f.fir_no
                from cdr_read c join fir f on f.id = c.fir_id join app_user u on u.id = c.reader where %2$s
                union all
                select 'audit_export', e.at, u.full_name, u.rank, 'case', e.reason, e.fir_id, e.fir_ref
                from audit_export e join app_user u on u.id = e.exported_by where %3$s
                union all
                select 'admin_action', a.at, u.full_name, u.rank, a.action, a.reason, null::uuid, null::text
                from admin_action a join app_user u on u.id = a.actor_id left join app_user t on t.id = a.user_id
                where %4$s""".formatted(reads, firs, exports, admin);
    }
}
