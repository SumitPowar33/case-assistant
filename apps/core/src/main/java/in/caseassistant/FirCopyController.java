package in.caseassistant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the FIR copy paper holds (item 18, plan section 8): the first information report as it was registered, under BNSS
 * 173 (CrPC 154 for one registered before 1 July 2024, India time), for the case team. The sections are those entered at
 * registration (one added later is only counted: it has its own report to the Magistrate), the investigating officer the
 * first one assigned, and the informant the one who signed the complaint at the front desk, or the complainants of the
 * case where the FIR was typed or imported. Accused persons are not listed: the app cannot tell who was named at
 * registration from who was added during the investigation; the information itself is printed as written.
 *
 * <p>On a case that protects the victim's identity, or with any person whose identity is protected, the paper holds no
 * name, no place and none of the written text (BNS 72, POCSO 23): the server leaves them out. The signed record is the
 * one given to the court under cover.
 */
@RestController
class FirCopyController {
    private final JdbcClient db;
    private final CaseTeam team;

    FirCopyController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping("/api/firs/{firId}/copy")
    Map<String, Object> copy(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        boolean withheld = team.identityProtected(firId) || db.sql(
                "select exists (select 1 from person where fir_id = ? and person_masked(role, identity_masked, fir_id))")
                .param(firId).query(Boolean.class).single();
        var head = db.sql("""
                select f.fir_no, f.fir_year, f.registered_at, f.information_received_at, f.gd_entry_no, f.is_zero_fir,
                       f.outside_limits_place, f.occurrence_known, f.occurrence_from, f.occurrence_to, f.occurrence_place,
                       f.contents_original, f.contents_language, f.action_taken, f.action_reason,
                       s.name as station, dt.name as district, sp.name as state, io.full_name as io_name, io.rank as io_rank,
                       case when ist_date(f.registered_at) < date '2024-07-01' then 'crpc' else 'bnss' end as law,
                       (select coalesce(string_agg(act || ' ' || section, ', ' order by act, section), '') from fir_section
                        where fir_id = f.id and added_at is null) as sections,
                       (select count(*) from fir_section where fir_id = f.id and added_at is not null) as later_sections
                from fir f join police_station s on s.id = f.station_id left join district dt on dt.id = s.district_id
                join state_pack sp on sp.code = s.state_code
                left join lateral (select to_io from fir_io_assignment a where a.fir_id = f.id order by a.at, a.id limit 1) first on true
                left join app_user io on io.id = first.to_io
                where f.id = ?""").param(firId).query().singleRow();
        var informants = List.<Map<String, Object>>of();
        var complaint = db.sql("""
                select c.mode, c.informant_name as name, c.informant_contact as contact, c.signed_at, u.full_name as signed_recorded_by_name
                from complaint c left join app_user u on u.id = c.signed_recorded_by where c.fir_id = ?""")
                .param(firId).query().listOfRows().stream().findFirst().orElse(null);
        if (withheld) {
            for (String hidden : List.of("outside_limits_place", "occurrence_place", "contents_original", "action_reason"))
                head.put(hidden, null);
            complaint = null;
        } else if (complaint == null) {
            informants = db.sql("""
                    select label, full_name as name, parentage, age_years, gender, address_present as address, phone as contact
                    from person where fir_id = ? and role = 'complainant' order by label, id""").param(firId).query().listOfRows();
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("withheld", withheld);
        out.put("head", head);
        out.put("complaint", complaint);
        out.put("informants", informants);
        return out;
    }
}
