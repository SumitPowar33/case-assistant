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
 * their checked English translations, the diary, the evidence descriptions and the notices. Only this case, only for its team (ReadAccess answers 404 to
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
