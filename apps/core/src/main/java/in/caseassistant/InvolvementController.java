package in.caseassistant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Earlier records of an accused or suspect (V55): the other FIRs of the same state in which a person is an accused or suspect
 * with the same phone number (its last ten digits), the same name and parentage (case and spaces ignored), or an account
 * that the money trail of this FIR links to this person and that appears in the other FIR's money trail. Exact matches
 * only, each with what matched: it is not a judgement that it is the same person, and there is no score; the officer opens
 * both records and decides. No face, photo or biometric matching (CLAUDE.md). Only the case team asks, only for an accused
 * or suspect (never a victim, complainant or witness), and every check is logged with its count.
 */
@RestController
class InvolvementController {
    static final int LIMIT = 100;

    private final JdbcClient db;
    private final CaseTeam team;

    InvolvementController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @Transactional
    @GetMapping("/api/firs/{firId}/people/{personId}/involvement")
    Map<String, Object> check(@PathVariable UUID firId, @PathVariable UUID personId, @AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        String role = db.sql("select role from person where id = ? and fir_id = ?").params(personId, firId).query(String.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such person in this FIR."));
        if (!role.equals("accused") && !role.equals("suspect"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Earlier records are checked only for an accused or a suspect.");
        var rows = db.sql("""
                with me as (
                  select p.id, p.fir_id, s.state_code,
                         nullif(right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10), '') as phone10,
                         nullif(lower(regexp_replace(btrim(coalesce(p.full_name, '')), '\\s+', ' ', 'g')), '') as name,
                         nullif(lower(regexp_replace(btrim(coalesce(p.parentage, '')), '\\s+', ' ', 'g')), '') as parentage
                  from person p join fir f on f.id = p.fir_id join police_station s on s.id = f.station_id where p.id = :person),
                my_accounts as (
                  select distinct upper(regexp_replace(t.to_account, '\\s', '', 'g')) as acct from money_transfer t, me
                  where t.fir_id = me.fir_id and t.to_person_id = me.id),
                other as (
                  select o.id, o.fir_id, o.role, o.label, o.full_name, f.fir_no, f.fir_year, f.registered_at, s.name as station,
                         nullif(right(regexp_replace(coalesce(o.phone, ''), '\\D', '', 'g'), 10), '') as phone10,
                         nullif(lower(regexp_replace(btrim(coalesce(o.full_name, '')), '\\s+', ' ', 'g')), '') as name,
                         nullif(lower(regexp_replace(btrim(coalesce(o.parentage, '')), '\\s+', ' ', 'g')), '') as parentage
                  from person o join fir f on f.id = o.fir_id join police_station s on s.id = f.station_id, me
                  where o.fir_id <> me.fir_id and s.state_code = me.state_code and o.role in ('accused', 'suspect'))
                select * from (
                select o.fir_id, o.fir_no, o.fir_year, o.registered_at, o.station, o.role, o.label, o.full_name as name,
                       array_remove(array[
                         case when length(me.phone10) = 10 and o.phone10 = me.phone10 then 'phone' end,
                         case when me.name is not null and me.parentage is not null and o.name = me.name and o.parentage = me.parentage then 'name_parentage' end,
                         case when exists (select 1 from money_transfer t join my_accounts a on a.acct = upper(regexp_replace(t.to_account, '\\s', '', 'g'))
                                           where t.fir_id = o.fir_id and t.to_person_id = o.id) then 'account' end
                       ], null) as matched_on
                from other o, me) x
                where cardinality(matched_on) > 0
                order by registered_at desc, label limit :lim""")
                .param("person", personId).param("lim", LIMIT + 1).query().listOfRows();
        boolean truncated = rows.size() > LIMIT;
        List<Map<String, Object>> found = truncated ? rows.subList(0, LIMIT) : rows;
        for (var r : found) {
            r.put("matched_on", toArray(r.get("matched_on")));
            r.put("can_open", team.canReadFir(me, (UUID) r.get("fir_id")));
        }
        db.sql("insert into involvement_search (searcher, fir_id, person_id, matches) values (?,?,?,?)")
                .params(me, firId, personId, found.size()).update();
        var out = new LinkedHashMap<String, Object>();
        out.put("records", found);
        out.put("truncated", truncated);
        return out;
    }

    private static Object toArray(Object sqlArray) {
        try {
            return sqlArray instanceof java.sql.Array a ? a.getArray() : sqlArray;
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }
}
