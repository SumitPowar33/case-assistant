package in.caseassistant;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * The passages of one case that "Ask the case file" (design board 19) may answer from: the complaint, the statements and
 * their checked English translations, the diary, the evidence descriptions, the notices, the requests to a lab or hospital with
 * their step notes, the court events, the search and seizure memos, the money trail (transfers and bank holds) and the BSA 63(4) certificates in force. Only this case, only for its team (ReadAccess answers 404 to
 * anyone else); a person is named by their label, never by name. The question and the answer are made in the browser and
 * the AI gateway; nothing from another case or any search across cases is possible here. A protected case's read is
 * logged like its FIR text.
 */
@RestController
@RequestMapping("/api/firs/{firId}/case-file")
class CaseFileController {
    private final JdbcClient db;
    private final CaseTeam team;
    private final ProtectedReads reads;

    CaseFileController(JdbcClient db, CaseTeam team, ProtectedReads reads) {
        this.db = db;
        this.team = team;
        this.reads = reads;
    }

    @GetMapping
    Map<String, Object> passages(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var rows = new ArrayList<Map<String, Object>>();
        add(rows, "complaint", db.sql("select 'FIR complaint' as title, contents_original as text from fir where id = ?").params(firId));
        add(rows, "statement", db.sql("""
                select 'Statement of ' || p.label || ', recorded ' || to_char(ist_date(s.recorded_at), 'DD Mon YYYY') as title, s.original_text as text
                from witness_statement s join person p on p.id = s.person_id where s.fir_id = ? order by s.recorded_at limit 100""").params(firId));
        // a statement's English translation that an officer checked (V52), so an English question finds a statement made in
        // another language; the original stays the statement
        add(rows, "translation", db.sql("""
                select 'English translation of the statement of ' || p.label || ', recorded ' || to_char(ist_date(s.recorded_at), 'DD Mon YYYY') as title,
                       t.translated_text as text
                from statement_translation t join witness_statement s on s.id = t.statement_id join person p on p.id = s.person_id
                where s.fir_id = ? order by s.recorded_at limit 100""").params(firId));
        add(rows, "diary", db.sql("""
                select 'Case diary, ' || to_char(diary_date, 'DD Mon YYYY') as title, text from case_diary_entry
                where fir_id = ? order by at limit 100""").params(firId));
        add(rows, "evidence", db.sql("select 'Evidence ' || label as title, description as text from evidence_item where fir_id = ? order by label limit 100").params(firId));
        add(rows, "notice", db.sql("""
                select 'Notice ' || kind || ' to ' || addressee || ' (' || status || ')' as title, body as text from notice
                where fir_id = ? order by id limit 100""").params(firId));
        // session 93 (item 17): what the lab or hospital was asked and every step's note, the court events, the search memos
        add(rows, "expert", db.sql("""
                select 'Request to ' || r.sent_to || ' (' || r.kind || '), sent ' || to_char(r.sent_on, 'DD Mon YYYY') as title,
                       r.subject || coalesce(' | ' || (select string_agg(st.status || ' ' || to_char(st.on_date, 'DD Mon YYYY') || coalesce(': ' || st.note, ''), '; ' order by st.recorded_at)
                                                       from expert_request_step st where st.request_id = r.id), '') as text
                from expert_request r where r.fir_id = ? order by r.sent_on, r.id limit 100""").params(firId));
        add(rows, "court", db.sql("""
                select 'Court event ' || kind || ', ' || to_char(on_date, 'DD Mon YYYY') as title,
                       concat_ws(' | ', court, 'case no ' || case_no, note) as text
                from court_event where fir_id = ? order by on_date, id limit 100""").params(firId));
        add(rows, "search", db.sql("""
                select 'Search and seizure memo, ' || to_char(ist_date(started_at), 'DD Mon YYYY') as title,
                       place || ' | ' || grounds || coalesce(' | no witness: ' || no_witness_reason, '') as text
                from search_seizure where fir_id = ? order by started_at, id limit 100""").params(firId));
        // session 94 (item 17): the money trail as typed from bank replies; a receiving accused is named by label only
        add(rows, "money", db.sql("""
                select 'Transfer on ' || to_char(t.transferred_on, 'DD Mon YYYY') as title,
                       'Rs ' || to_char(t.amount_paise / 100.0, 'FM999,999,999,990.00') || ' from account ' || t.from_account || ' to account ' || t.to_account
                       || coalesce(' (' || p.label || ')', '') || coalesce(' | bank reply ' || e.label, '') as text
                from money_transfer t left join person p on p.id = t.to_person_id left join evidence_item e on e.id = t.evidence_item_id
                where t.fir_id = ? order by t.transferred_on, t.recorded_at limit 100""").params(firId));
        add(rows, "money", db.sql("""
                select 'Bank hold on ' || to_char(h.held_on, 'DD Mon YYYY') as title,
                       'Rs ' || to_char(h.amount_paise / 100.0, 'FM999,999,999,990.00') || ' held in account ' || h.account || coalesce(' | bank reply ' || e.label, '') as text
                from money_hold h left join evidence_item e on e.id = h.evidence_item_id
                where h.fir_id = ? order by h.held_on, h.recorded_at limit 100""").params(firId));
        // session 95 (item 17): the BSA 63(4) certificates in force (a certificate replaced by a correction is left out); the signer's
        // name is not given, only the part, the device, the hash and where and when it was signed
        add(rows, "certificate", db.sql("""
                select 'BSA 63(4) certificate Part ' || c.part || ' for ' || e.label || ', signed ' || to_char(ist_date(c.signed_at), 'DD Mon YYYY') as title,
                       concat_ws(' | ', c.device_type, c.device_ids, c.hash_algo || ' ' || c.hash_value, 'signed at ' || c.place) as text
                from certificate_63_4 c join evidence_item e on e.id = c.item_id
                where e.fir_id = ? and not exists (select 1 from certificate_63_4 n where n.supersedes = c.id)
                order by e.label, c.part limit 100""").params(firId));
        if (!rows.isEmpty() && team.identityProtected(firId)) reads.fir(me, firId, "fir_text");
        var out = new LinkedHashMap<String, Object>();
        out.put("passages", rows);
        return out;
    }

    private static void add(List<Map<String, Object>> rows, String kind, JdbcClient.StatementSpec query) {
        for (var r : query.query().listOfRows()) {
            var p = new LinkedHashMap<String, Object>();
            p.put("id", "P" + (rows.size() + 1));
            p.put("kind", kind);
            p.put("title", r.get("title"));
            p.put("text", r.get("text"));
            rows.add(p);
        }
    }
}
