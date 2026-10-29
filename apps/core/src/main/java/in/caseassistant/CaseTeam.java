package in.caseassistant;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may do what on a case. The case team is the FIR's investigating officer plus everyone whose role sees all cases
 * of their station or district (by default the SHO of the FIR's station and the SP of its district; see
 * {@link Roles} and packs/{module}/roles.json). Only they see protected victim details (BNS 72, POCSO 23) and only they
 * add records to the case. The signed-in user comes from the login token (see {@link SecurityConfig}).
 */
@Component
class CaseTeam {
    private final JdbcClient db;
    private final Roles roles;
    private final String stationOrDistrict;
    private final String stationOrDistrictOnFir;

    CaseTeam(JdbcClient db, Roles roles) {
        this.db = db;
        this.roles = roles;
        String station = Roles.in(roles.scoped("station"));
        String district = Roles.in(roles.scoped("district"));
        // "f" is the FIR, "u" the user, "fs" the FIR's station, "us" the user's station
        this.stationOrDistrict = "(u.role in " + station + " and u.station_id = f.station_id) or (u.role in " + district
                + " and us.district_id = fs.district_id)";
        this.stationOrDistrictOnFir = stationOrDistrict.replace("f.station_id", "fir.station_id");
    }

    static UUID user(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    boolean includes(UUID userId, UUID firId) {
        return userId != null && db.sql("""
                select exists (select 1 from app_user u
                  join fir f on f.id = ?
                  join police_station fs on fs.id = f.station_id
                  left join police_station us on us.id = u.station_id
                  where u.id = ? and u.active and (f.io_id = u.id or %s))""".formatted(stationOrDistrict))
                .params(firId, userId).query(Boolean.class).single();
    }

    /** 403 unless the user is on the case team. An unknown FIR also gives 403, so it reveals nothing. */
    void requireTeam(UUID userId, UUID firId) {
        if (!includes(userId, firId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the case team can do this.");
    }

    /** Assigning the IO: a role that sees all cases of the station or district (not just the IO). */
    void requireSupervisor(UUID userId, UUID firId) {
        boolean ok = db.sql("""
                select exists (select 1 from app_user u
                  join fir f on f.id = ?
                  join police_station fs on fs.id = f.station_id
                  left join police_station us on us.id = u.station_id
                  where u.id = ? and u.active and (%s))""".formatted(stationOrDistrict))
                .params(firId, userId).query(Boolean.class).single();
        if (!ok) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the SHO of the station or the SP of the district can assign the IO.");
    }

    /** Who can be the IO of an FIR: an active user of a role with "case.lead" posted at the FIR's police station. */
    boolean canBeIo(UUID userId, UUID stationId) {
        return db.sql("select exists (select 1 from app_user where id = ? and active and role in " + Roles.in(roles.with("case.lead"))
                        + " and station_id = ?)")
                .params(userId, stationId).query(Boolean.class).single();
    }

    /** SQL for the IO candidates of an FIR ("u" is the user): the roles with "case.lead". */
    String caseLeadRoles() {
        return Roles.in(roles.with("case.lead"));
    }

    /** Evidence custody: the case team, or users with "evidence.custody" (malkhana) at the FIR's station. */
    boolean isCustodian(UUID userId, UUID firId) {
        return includes(userId, firId) || userId != null && db.sql("""
                select exists (select 1 from app_user u join fir f on f.id = ?
                  where u.id = ? and u.active and u.role in %s and u.station_id = f.station_id)""".formatted(Roles.in(roles.with("evidence.custody"))))
                .params(firId, userId).query(Boolean.class).single();
    }

    void requireCustodian(UUID userId, UUID firId) {
        if (!isCustodian(userId, firId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the case team can do this.");
    }

    /** SQL test on table "fir" (one ? = user id): the case team, or "fir.read_station" users of the FIR's station. */
    String canReadFirSql() {
        return "exists (select 1 from app_user u join police_station fs on fs.id = fir.station_id"
                + " left join police_station us on us.id = u.station_id where u.id = ? and u.active and (fir.io_id = u.id"
                + " or (u.role in " + Roles.in(roles.with("fir.read_station")) + " and u.station_id = fir.station_id)"
                + " or " + stationOrDistrictOnFir + "))";
    }

    /** Reading the FIR itself: the case team, or the front desk of its station (who register it). */
    boolean canReadFir(UUID userId, UUID firId) {
        return userId != null && db.sql("select exists (select 1 from fir where id = ? and " + canReadFirSql() + ")")
                .params(firId, userId).query(Boolean.class).single();
    }

    /** Registering an FIR: users with "fir.register" posted at that station. */
    void requireStationStaff(UUID userId, UUID stationId) {
        boolean ok = db.sql("select exists (select 1 from app_user where id = ? and active and station_id = ? and role in "
                + Roles.in(roles.with("fir.register")) + ")").params(userId, stationId).query(Boolean.class).single();
        if (!ok) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only staff of this police station can register its FIRs.");
    }

    /** Whether the user is active and holds a permission (account management: "admin.manage"). */
    boolean can(UUID userId, String permission) {
        return userId != null && db.sql("select exists (select 1 from app_user where id = ? and active and role in "
                + Roles.in(roles.with(permission)) + ")").param(userId).query(Boolean.class).single();
    }

    /**
     * Whether the user holds a permission at a police station: the station's own staff (a role scoped to the station),
     * the district's staff (scoped to the district), or the state admin for any station of their own state (the
     * platform admin, who has no station, for any state).
     */
    boolean canAt(UUID userId, String permission, UUID stationId) {
        var u = db.sql("""
                select u.role, u.station_id, m.state_code as my_state, m.district_id as my_district, t.state_code, t.district_id
                from app_user u left join police_station m on m.id = u.station_id, police_station t
                where u.id = ? and u.active and t.id = ?""").params(userId, stationId).query().listOfRows().stream().findFirst().orElse(null);
        if (u == null || !roles.has((String) u.get("role"), permission)) return false;
        if (u.get("my_state") == null) return true;
        if (!u.get("my_state").equals(u.get("state_code"))) return false;
        if (roles.has((String) u.get("role"), "admin.manage")) return true;
        return switch (roles.caseScope((String) u.get("role"))) {
            case "station" -> stationId.equals(u.get("station_id"));
            case "district" -> u.get("district_id").equals(u.get("my_district"));
            default -> false;
        };
    }

    boolean identityProtected(UUID firId) {
        return db.sql("select identity_protected_case(?)").param(firId).query(Boolean.class).single();
    }
}
