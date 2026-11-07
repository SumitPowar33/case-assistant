package in.caseassistant;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Case property register (design board 15, V43): every seized physical item of the cases the caller may open (the case
 * team, the station's "fir.read_station" users and the "evidence.custody" users of the FIR's station), with where it
 * is now, read from its newest hand-over in the custody log. Hand-overs are recorded with the existing
 * {@code POST /api/firs/{id}/evidence/{itemId}/custody}; nothing here changes a record. It shows the item, its FIR
 * number and its place, never a victim's details; on a protected case (BNS 72) the description is withheld from anyone
 * but the case team and the malkhana. The counts are of what is listed, not a mark on anyone.
 */
@RestController
@RequestMapping("/api/property")
class PropertyController {
    static final int LIMIT = 500;

    private final JdbcClient db;
    private final CaseTeam team;

    PropertyController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping
    Map<String, Object> register(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        var rows = db.sql("""
                select e.id, e.label, e.description, e.seal_no, e.seized_at, e.fir_id, fir.fir_no, fir.fir_year, s.name as station,
                       c.at as moved_at, c.location, c.purpose, c.received_by, c.place, c.seal_intact,
                       identity_protected_case(fir.id) and not (""" + team.includesSql("fir.id") + " or " + team.custodianSql() + """
                       ) as withheld
                from evidence_item e
                join fir on fir.id = e.fir_id
                join police_station s on s.id = fir.station_id
                left join lateral (select * from custody_event where item_id = e.id order by at desc, id desc limit 1) c on true
                where e.kind = 'physical' and """ + team.canSeePropertySql() + """
                order by e.seized_at desc, e.label limit ?""").params(me, me, me, me, LIMIT + 1).query().listOfRows();
        boolean truncated = rows.size() > LIMIT;
        List<Map<String, Object>> items = truncated ? rows.subList(0, LIMIT) : rows;
        var counts = new LinkedHashMap<String, Integer>();
        for (String k : List.of("in_malkhana", "out", "released", "other", "not_stated", "not_logged")) counts.put(k, 0);
        for (var item : items) {
            // a protected case's item description can name the victim (BNS 72): only the case team and the malkhana that holds it read it
            if (Boolean.TRUE.equals(item.get("withheld"))) item.put("description", null);
            String status = status((String) item.get("place"), item.get("moved_at") != null);
            item.put("status", status);
            counts.merge(status, 1, Integer::sum);
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("items", items);
        out.put("counts", counts);
        out.put("truncated", truncated);
        return out;
    }

    /** Where the item is by its newest hand-over: no hand-over logged, or a hand-over with no place stated, are told apart from "other". */
    static String status(String place, boolean handedOver) {
        if (!handedOver) return "not_logged";
        if (place == null) return "not_stated";
        return switch (place) {
            case "malkhana" -> "in_malkhana";
            case "lab", "court" -> "out";
            case "owner" -> "released";
            default -> "other";
        };
    }
}
