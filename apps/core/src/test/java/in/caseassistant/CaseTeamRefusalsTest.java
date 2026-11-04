package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Who may do what on a case, asked about people and places that do not exist or are missing: every answer is "no", never an
 * error and never a yes (the guards of {@link CaseTeam}), plus the station-scope and district-scope rules of {@code canAt}.
 * Fictional data only.
 */
@SpringBootTest
class CaseTeamRefusalsTest {
    @Autowired CaseTeam team;
    @Autowired JdbcClient db;
    UUID station, sameDistrict, otherDistrict, fir, io, sho, sp, malkhana, inactive;

    UUID user(UUID st, String role, boolean active) {
        return db.sql("insert into app_user (station_id, full_name, rank, role, active) values (?,?,'SI',?,?) returning id")
                .params(st, "Fictional " + role, role, active).query(UUID.class).single();
    }

    UUID station(String district, String name) {
        return db.sql("insert into police_station (state_code, district_id, name) values ('IN',district_id_of('IN',?),?) returning id").params(district, name).query(UUID.class).single();
    }

    @BeforeEach
    void setUp() {
        db.sql("truncate fir, police_station, state_pack, app_user cascade").update();
        db.sql("insert into state_pack (code, name, version, languages) values ('IN','National','1',array['en'])").update();
        station = station("North", "Fictional North PS");
        sameDistrict = station("North", "Fictional North Two PS");
        otherDistrict = station("South", "Fictional South PS");
        io = user(station, "io", true);
        sho = user(station, "sho", true);
        sp = user(station, "sp", true);
        malkhana = user(station, "malkhana", true);
        inactive = user(station, "sho", false);
        fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, contents_original, contents_language, action_taken, io_id)
                values (?,2026,1,'GD-1','2026-10-01T10:00Z','2026-10-01T09:00Z','Fictional complaint','en','investigate',?) returning id""").params(station, io).query(UUID.class).single();
    }

    @Test
    void noUserOrNoPlaceIsAlwaysNo() {
        assertThat(team.includes(null, fir)).isFalse();
        assertThat(team.supervisesStation(null, station)).isFalse();
        assertThat(team.supervisesStation(sho, null)).isFalse();
        assertThat(team.isCustodian(null, fir)).isFalse();
        assertThat(team.canReadFir(null, fir)).isFalse();
        assertThat(team.canRegisterAt(null, station)).isFalse();
        assertThat(team.canRegisterAt(io, null)).isFalse();
        assertThat(team.can(null, "admin.manage")).isFalse();
        assertThat(team.canAt(null, "policy.set", station)).isFalse();
        assertThat(team.canAt(sho, "policy.set", null)).isFalse();
        assertThat(team.canAt(sho, "policy.set", UUID.randomUUID())).isFalse();
    }

    @Test
    void anInactiveOrOutsideAccountIsNotOnTheTeam() {
        assertThat(team.includes(io, fir)).isTrue();
        assertThat(team.includes(sho, fir)).isTrue();
        assertThat(team.includes(inactive, fir)).isFalse();
        assertThat(team.includes(user(sameDistrict, "io", true), fir)).isFalse();   // an IO of another station, not on this case
        assertThat(team.includes(user(otherDistrict, "sho", true), fir)).isFalse();
        assertThat(team.isCustodian(malkhana, fir)).isTrue();
        assertThat(team.isCustodian(user(otherDistrict, "malkhana", true), fir)).isFalse();
        assertThat(team.can(inactive, "chargesheet.approve")).isFalse();
        assertThat(team.can(sho, "chargesheet.approve")).isTrue();
    }

    @Test
    void aPermissionAtAStationFollowsTheRoleScopeNotTheRoleName() {
        // a station-scoped role (the SHO) holds it at its own station only; a district-scoped role (the SP) at every station of its district
        assertThat(team.canAt(sho, "policy.set", station)).isTrue();
        assertThat(team.canAt(sho, "policy.set", sameDistrict)).isFalse();
        assertThat(team.canAt(sp, "policy.set", sameDistrict)).isTrue();
        assertThat(team.canAt(sp, "policy.set", otherDistrict)).isFalse();
        // a role without the permission never holds it, and a role with no case scope (the IO) holds nothing station-wide
        assertThat(team.canAt(io, "policy.set", station)).isFalse();
        assertThat(team.canAt(malkhana, "chargesheet.approve", station)).isFalse();
        assertThat(team.supervisesStation(sp, sameDistrict)).isTrue();
        assertThat(team.supervisesStation(sho, sameDistrict)).isFalse();
        assertThat(team.supervisesStation(io, station)).isFalse();
    }
}
