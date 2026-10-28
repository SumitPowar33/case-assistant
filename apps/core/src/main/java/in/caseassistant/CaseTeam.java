package in.caseassistant;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may do what on a case. The case team is the FIR's investigating officer, the SHO of the FIR's station
 * and the SP of its district. Only they see protected victim details (BNS 72, POCSO 23) and only they add
 * records to the case. The signed-in user comes from the login token (see {@link SecurityConfig}).
 */
@Component
class CaseTeam {
    private final JdbcClient db;

    CaseTeam(JdbcClient db) {
        this.db = db;
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
                  where u.id = ? and u.active and (f.io_id = u.id
                    or (u.role = 'sho' and u.station_id = f.station_id)
                    or (u.role = 'sp' and us.state_code = fs.state_code and us.district = fs.district)))""")
                .params(firId, userId).query(Boolean.class).single();
    }

    /** 403 unless the user is on the case team. An unknown FIR also gives 403, so it reveals nothing. */
    void requireTeam(UUID userId, UUID firId) {
        if (!includes(userId, firId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the case team can do this.");
    }

    /** Assigning the IO: the SHO of the FIR's station or the SP of its district (not the IO). */
    void requireSupervisor(UUID userId, UUID firId) {
        boolean ok = db.sql("""
                select exists (select 1 from app_user u
                  join fir f on f.id = ?
                  join police_station fs on fs.id = f.station_id
                  left join police_station us on us.id = u.station_id
                  where u.id = ? and u.active and ((u.role = 'sho' and u.station_id = f.station_id)
                    or (u.role = 'sp' and us.state_code = fs.state_code and us.district = fs.district)))""")
                .params(firId, userId).query(Boolean.class).single();
        if (!ok) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the SHO of the station or the SP of the district can assign the IO.");
    }

    /** Who can be the IO of an FIR: an active IO or SHO posted at the FIR's police station. */
    boolean canBeIo(UUID userId, UUID stationId) {
        return db.sql("select exists (select 1 from app_user where id = ? and active and role in ('io', 'sho') and station_id = ?)")
                .params(userId, stationId).query(Boolean.class).single();
    }

    /** Evidence custody: the case team, or the malkhana (evidence store) staff of the FIR's station. */
    boolean isCustodian(UUID userId, UUID firId) {
        return includes(userId, firId) || userId != null && db.sql("""
                select exists (select 1 from app_user u join fir f on f.id = ?
                  where u.id = ? and u.active and u.role = 'malkhana' and u.station_id = f.station_id)""")
                .params(firId, userId).query(Boolean.class).single();
    }

    void requireCustodian(UUID userId, UUID firId) {
        if (!isCustodian(userId, firId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the case team can do this.");
    }

    /** SQL test on table "fir" (one ? = user id): the case team, or the front desk of the FIR's station. */
    static final String CAN_READ_FIR = """
            exists (select 1 from app_user u join police_station fs on fs.id = fir.station_id
              left join police_station us on us.id = u.station_id
              where u.id = ? and u.active and (fir.io_id = u.id
                or (u.role in ('sho', 'front_desk') and u.station_id = fir.station_id)
                or (u.role = 'sp' and us.state_code = fs.state_code and us.district = fs.district)))""";

    /** Reading the FIR itself: the case team, or the front desk of its station (who register it). */
    boolean canReadFir(UUID userId, UUID firId) {
        return userId != null && db.sql("select exists (select 1 from fir where id = ? and " + CAN_READ_FIR + ")")
                .params(firId, userId).query(Boolean.class).single();
    }

    /** Registering an FIR: front desk, IO or SHO posted at that station. */
    void requireStationStaff(UUID userId, UUID stationId) {
        boolean ok = db.sql("""
                select exists (select 1 from app_user where id = ? and active and station_id = ?
                  and role in ('front_desk', 'io', 'sho'))""").params(userId, stationId).query(Boolean.class).single();
        if (!ok) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only staff of this police station can register its FIRs.");
    }

    boolean hasRole(UUID userId, String role) {
        return db.sql("select exists (select 1 from app_user where id = ? and active and role = ?)")
                .params(userId, role).query(Boolean.class).single();
    }

    boolean identityProtected(UUID firId) {
        return db.sql("select identity_protected_case(?)").param(firId).query(Boolean.class).single();
    }
}
