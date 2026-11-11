package in.caseassistant;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may do what on a case. The case team is the FIR's investigating officer (only while posted at the FIR's station:
 * a transferred IO loses the old station's cases at once, decision 2(d) of 2 Nov 2026) plus everyone whose role sees all cases
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
    private final String wholeStations;

    CaseTeam(JdbcClient db, Roles roles) {
        this.db = db;
        this.roles = roles;
        var stationRoles = roles.scoped("station");
        var districtRoles = roles.scoped("district");
        // "f" is the FIR, "u" the user, "fs" the FIR's station, "us" the user's station
        this.stationOrDistrict = "(" + holds("u", stationRoles) + " and u.station_id = f.station_id) or (" + holds("u", districtRoles)
                + " and us.district_id = fs.district_id)";
        this.stationOrDistrictOnFir = stationOrDistrict.replace("f.station_id", "fir.station_id");
        // the stations whose every FIR the user may open: their own (station scope or "fir.read_station"), or every
        // station of their district (district scope); "us" is the user's station, "s" a station they read
        this.wholeStations = "select s.id from app_user u join police_station us on us.id = u.station_id join police_station s on"
                + " ((" + holds("u", stationRoles) + " or " + holds("u", roles.with("fir.read_station")) + ") and s.id = us.id)"
                + " or (" + holds("u", districtRoles) + " and s.district_id = us.district_id) where u.id = ? and u.active";
    }

    /**
     * SQL test that user alias {@code u} holds one of the role codes: as their own role, or as an acting charge at their own
     * station that is running now (not ended early, not past its end). The codes come from the packs, so they are safe in SQL.
     */
    static String holds(String u, Set<String> codes) {
        String in = Roles.in(codes);
        return "(" + u + ".role in " + in + " or exists (select 1 from acting_charge ac where ac.user_id = " + u + ".id and ac.station_id = "
                + u + ".station_id and ac.role in " + in + " and ac.starts_at <= clock_timestamp() and ac.ends_at > clock_timestamp()"
                + " and not exists (select 1 from acting_charge_end ae where ae.charge_id = ac.id)))";
    }

    /** The roles the user holds now: their own and the acting charges running at their station (null user: none). */
    List<String> activeRoles(UUID userId) {
        return userId == null ? List.of() : db.sql("""
                select u.role from app_user u where u.id = :u and u.active
                union
                select ac.role from acting_charge ac join app_user u on u.id = ac.user_id and u.station_id = ac.station_id
                where ac.user_id = :u and u.active and ac.starts_at <= clock_timestamp() and ac.ends_at > clock_timestamp()
                  and not exists (select 1 from acting_charge_end ae where ae.charge_id = ac.id)
                order by 1""").param("u", userId).query(String.class).list();
    }

    static UUID user(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    boolean includes(UUID userId, UUID firId) {
        return userId != null && db.sql("select " + includesSql("?")).params(firId, userId).query(Boolean.class).single();
    }

    /** SQL test (one ? = user id) that the user is on the case team of the FIR whose id is the SQL expression {@code firId}. */
    String includesSql(String firId) {
        return """
                exists (select 1 from app_user u
                  join fir f on f.id = %s
                  join police_station fs on fs.id = f.station_id
                  left join police_station us on us.id = u.station_id
                  where u.id = ? and u.active and ((f.io_id = u.id and u.station_id = f.station_id) or %s))""".formatted(firId, stationOrDistrict);
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

    /** Whether the user's role sees every case of this station (station scope) or of its district (district scope). */
    boolean supervisesStation(UUID userId, UUID stationId) {
        return userId != null && stationId != null && db.sql("""
                select exists (select 1 from app_user u join police_station fs on fs.id = ?
                  left join police_station us on us.id = u.station_id
                  where u.id = ? and u.active and (%s))""".formatted(stationOrDistrict.replace("f.station_id", "fs.id")))
                .params(stationId, userId).query(Boolean.class).single();
    }

    /** Who can be the IO of an FIR: an active user posted at the FIR's police station who holds, as own role or acting charge, a role with "case.lead". */
    boolean canBeIo(UUID userId, UUID stationId) {
        return db.sql("select exists (select 1 from app_user u where u.id = ? and u.active and " + caseLead("u") + " and u.station_id = ?)")
                .params(userId, stationId).query(Boolean.class).single();
    }

    /** SQL test on user alias {@code u}: holds a role with "case.lead" now (own role or running acting charge). */
    String caseLead(String u) {
        return holds(u, roles.with("case.lead"));
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

    /** SQL test on table "fir" (two ? = user id, user id): {@link #canReadFirSql}, or the "evidence.custody" users of the FIR's station. */
    String canSeePropertySql() {
        return "(" + canReadFirSql() + " or " + custodianSql() + ")";
    }

    /** SQL test on table "fir" (one ? = user id): the user holds "evidence.custody" at the FIR's station (malkhana). */
    String custodianSql() {
        return "exists (select 1 from app_user cu where cu.id = ? and cu.active and cu.role in " + Roles.in(roles.with("evidence.custody"))
                + " and cu.station_id = fir.station_id)";
    }

    /** SQL test on table "fir" (one ? = user id): the case team, or "fir.read_station" users of the FIR's station. */
    String canReadFirSql() {
        return "exists (select 1 from app_user u join police_station fs on fs.id = fir.station_id"
                + " left join police_station us on us.id = u.station_id where u.id = ? and u.active and ((fir.io_id = u.id and u.station_id = fir.station_id)"
                + " or (u.role in " + Roles.in(roles.with("fir.read_station")) + " and u.station_id = fir.station_id)"
                + " or " + stationOrDistrictOnFir + "))";
    }

    /**
     * SQL test on table "fir" for lists (two ? = user id): the same FIRs as {@link #canReadFirSql}, but found from the
     * user's own reach (the cases naming them as IO, the stations they read whole), so the indexes answer it instead of a
     * check on every FIR of the installation (load test 1 Nov 2026: 210,000 FIRs took an SP's first page 8 s, now ms).
     */
    String readableFirsSql() {
        return "((fir.io_id = (select u.id from app_user u where u.id = ? and u.active) and fir.station_id = (select io.station_id from app_user io where io.id = fir.io_id))"
                + " or fir.station_id = any(array(" + wholeStations + ")))";
    }

    /** Reading the FIR itself: the case team, or the front desk of its station (who register it). */
    boolean canReadFir(UUID userId, UUID firId) {
        return userId != null && db.sql("select exists (select 1 from fir where id = ? and " + canReadFirSql() + ")")
                .params(firId, userId).query(Boolean.class).single();
    }

    /** Registering an FIR or taking a complaint: users with "fir.register" posted at that station. */
    boolean canRegisterAt(UUID userId, UUID stationId) {
        return userId != null && stationId != null && db.sql("select exists (select 1 from app_user u where u.id = ? and u.active and u.station_id = ? and "
                + holds("u", roles.with("fir.register")) + ")").params(userId, stationId).query(Boolean.class).single();
    }

    void requireStationStaff(UUID userId, UUID stationId) {
        if (!canRegisterAt(userId, stationId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only staff of this police station can register its FIRs.");
    }

    /** Whether the user is active and holds a permission (account management: "admin.manage"). */
    boolean can(UUID userId, String permission) {
        return activeRoles(userId).stream().anyMatch(r -> roles.has(r, permission));
    }

    /**
     * Whether the user holds a permission at a police station: the station's own staff (a role scoped to the station),
     * the district's staff (scoped to the district), or the state admin for any station of their own state (the
     * platform admin, who has no station, for any state).
     */
    boolean canAt(UUID userId, String permission, UUID stationId) {
        var u = db.sql("""
                select u.station_id, m.state_code as my_state, m.district_id as my_district, t.state_code, t.district_id
                from app_user u left join police_station m on m.id = u.station_id, police_station t
                where u.id = ? and u.active and t.id = ?""").params(userId, stationId).query().listOfRows().stream().findFirst().orElse(null);
        return u != null && activeRoles(userId).stream().anyMatch(role -> canAtAs(role, permission, stationId, u));
    }

    private boolean canAtAs(String role, String permission, UUID stationId, java.util.Map<String, Object> u) {
        if (!roles.has(role, permission)) return false;
        if (u.get("my_state") == null) return true;
        if (!u.get("my_state").equals(u.get("state_code"))) return false;
        if (roles.has(role, "admin.manage")) return true;
        return switch (roles.caseScope(role)) {
            case "station" -> stationId.equals(u.get("station_id"));
            case "district" -> u.get("district_id").equals(u.get("my_district"));
            default -> false;
        };
    }

    boolean identityProtected(UUID firId) {
        return db.sql("select identity_protected_case(?)").param(firId).query(Boolean.class).single();
    }
}
