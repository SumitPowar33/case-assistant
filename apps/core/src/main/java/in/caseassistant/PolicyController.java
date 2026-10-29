package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
 * Each state, district and police station may tighten the policies its packs declare (see {@link Policies}).
 * Who may set one: the state admin for their own state (the platform admin for any), a role with "policy.set" and a
 * district scope (the SP) for their district and its stations, a role with "policy.set" and a station scope (the SHO)
 * for their own station. A value must be inside the pack's bounds and not looser than the unit above already asks.
 */
@RestController
@RequestMapping("/api")
class PolicyController {
    record Setting(@NotBlank @Pattern(regexp = "state|district|station") String level, String stateCode, String district,
                   UUID stationId, @NotBlank String key, int value, @NotBlank @Size(min = 10, max = 2000) String reason) {}

    private final JdbcClient db;
    private final Policies policies;
    private final Roles roles;
    private final CaseTeam team;

    PolicyController(JdbcClient db, Policies policies, Roles roles, CaseTeam team) {
        this.db = db;
        this.policies = policies;
        this.roles = roles;
        this.team = team;
    }

    /** Every policy with its limits and the value in force at the signed-in user's own police station. */
    @GetMapping("/policies")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return policies.forStation(db.sql("select station_id from app_user where id = ?").param(CaseTeam.user(jwt))
                .query(UUID.class).optional().orElse(null));
    }

    /** The newest 200 changes in the units the signed-in user may manage, with who set them and why. */
    @GetMapping("/policy-settings")
    List<Map<String, Object>> history(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        return db.sql("""
                select p.id, p.level, p.state_code, d.name as district, p.station_id, s.name as station_name, p.key, p.value::int as value,
                  p.reason, u.full_name as set_by_name, p.set_at, sd.name as station_district,
                  coalesce(p.district_id, s.district_id) as unit_district_id
                from policy_setting p join app_user u on u.id = p.set_by left join police_station s on s.id = p.station_id
                left join district d on d.id = p.district_id left join district sd on sd.id = s.district_id
                order by p.set_at desc limit 200""").query().listOfRows().stream()
                .filter(r -> mayManage(me, (String) r.get("level"), (String) r.get("state_code"),
                        (UUID) r.get("unit_district_id"), (UUID) r.get("station_id")))
                .map(r -> { var m = new java.util.LinkedHashMap<>(r); m.remove("unit_district_id"); return (Map<String, Object>) m; })
                .toList();
    }

    @PostMapping("/policy-settings")
    @Transactional
    ResponseEntity<Map<String, Object>> set(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Setting s) {
        UUID me = CaseTeam.user(jwt);
        var def = policies.def(s.key);
        if (def == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such policy.");
        if (s.value < def.min() || s.value > def.max())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This policy must be between " + def.min() + " and " + def.max() + ".");
        String state = s.stateCode;
        UUID district = null;
        UUID station = s.stationId;
        if (s.level.equals("station")) {
            var row = db.sql("select state_code, district_id from police_station where id = ?").param(station == null ? UUID.randomUUID() : station)
                    .query().listOfRows().stream().findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such police station."));
            state = (String) row.get("state_code");
            district = (UUID) row.get("district_id");
        } else {
            station = null;
            if (state == null || state.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the state.");
            if (s.level.equals("district")) {
                district = s.district == null ? null : db.sql("select id from district where state_code = ? and lower(name) = lower(btrim(?))")
                        .params(state, s.district).query(UUID.class).optional().orElse(null);
                if (district == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such district in this state.");
            }
            if (s.level.equals("state") && !db.sql("select exists (select 1 from state_pack where code = ?)").param(state)
                    .query(Boolean.class).single())
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such state.");
        }
        if (!mayManage(me, s.level, state, district, station))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot set policies for this unit.");
        int above = policies.above(s.level, state, district, s.key);
        if (s.value > above)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The unit above already asks for " + above
                    + " or less; a unit can only be stricter, never looser.");
        UUID id = db.sql("""
                insert into policy_setting (level, state_code, district_id, station_id, key, value, reason, set_by)
                values (?,?,?,?,?,?,?,?) returning id""")
                .params(s.level, state, s.level.equals("district") ? district : null, station, s.key, Integer.toString(s.value), s.reason.trim(), me)
                .query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** Whether this user may set or read policies of a unit (see the class comment). */
    boolean mayManage(UUID userId, String level, String stateCode, UUID districtId, UUID stationId) {
        var u = db.sql("""
                select u.role, s.id as station_id, s.state_code, s.district_id from app_user u
                left join police_station s on s.id = u.station_id where u.id = ? and u.active""")
                .param(userId).query().listOfRows().stream().findFirst().orElse(null);
        if (u == null) return false;
        String role = (String) u.get("role");
        String myState = (String) u.get("state_code");
        if (team.can(userId, "admin.manage")) return myState == null || myState.equals(stateCode);
        if (!roles.has(role, "policy.set") || myState == null || !myState.equals(stateCode)) return false;
        return switch (roles.caseScope(role)) {
            case "station" -> level.equals("station") && u.get("station_id").equals(stationId);
            case "district" -> !level.equals("state") && u.get("district_id").equals(districtId);
            default -> false;
        };
    }
}
