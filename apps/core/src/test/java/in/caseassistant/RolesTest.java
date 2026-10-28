package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Unit tests of the role registry; no database. Role names and packs here are fictional. */
class RolesTest {
    static Roles.Role role(String scope, boolean station, String... permissions) {
        return new Roles.Role("Label", station, scope, List.of(permissions));
    }

    static Roles.File national() {
        return new Roles.File("IN", Map.of("a.read", "read a", "a.write", "write a"),
                Map.of("clerk", role("none", true, "a.read"), "boss", role("station", true, "a.read", "a.write")));
    }

    @Test
    void permissionsAndScopesAreAnsweredFromTheData() {
        var roles = new Roles(List.of(national()), null);
        assertThat(roles.exists("clerk")).isTrue();
        assertThat(roles.exists("wizard")).isFalse();
        assertThat(roles.with("a.write")).containsExactly("boss");
        assertThat(roles.with("a.read")).containsExactlyInAnyOrder("clerk", "boss");
        assertThat(roles.scoped("station")).containsExactly("boss");
        assertThat(roles.scoped("district")).isEmpty();
        assertThat(roles.stationRequired("clerk")).isTrue();
    }

    @Test
    void aStatePackAddsRolesAndPermissionsButTakesNothingAway() {
        var state = new Roles.File("MH", Map.of("b.run", "run b"),
                Map.of("clerk", role("none", true, "b.run"), "inspector", role("district", true, "a.read", "b.run")));
        var roles = new Roles(List.of(state, national()), null);   // order does not matter: the national pack goes first
        assertThat(roles.with("b.run")).containsExactlyInAnyOrder("clerk", "inspector");
        assertThat(roles.with("a.read")).containsExactlyInAnyOrder("clerk", "boss", "inspector");   // clerk kept a.read
        assertThat(roles.scoped("district")).containsExactly("inspector");
    }

    @Test
    void badPacksAreRefusedAtStartUp() {
        assertThatThrownBy(() -> new Roles(List.of(new Roles.File("X", Map.of(), Map.of("Bad-Code", role("none", false)))), null))
                .hasMessageContaining("bad role code");
        assertThatThrownBy(() -> new Roles(List.of(new Roles.File("X", Map.of(), Map.of("ok", role("planet", false)))), null))
                .hasMessageContaining("bad case_scope");
        assertThatThrownBy(() -> new Roles(List.of(new Roles.File("X", Map.of(), Map.of("ok", role("none", false, "ghost.do")))), null))
                .hasMessageContaining("undeclared permission");
        var widen = new Roles.File("MH", Map.of(), Map.of("clerk", role("district", true)));
        assertThatThrownBy(() -> new Roles(List.of(national(), widen), null)).hasMessageContaining("cannot change scope");
        var drop = new Roles.File("MH", Map.of(), Map.of("clerk", role("none", false)));
        assertThatThrownBy(() -> new Roles(List.of(national(), drop), null)).hasMessageContaining("cannot change scope");
    }

    @Test
    void sqlListsAreQuotedAndAnEmptyListMatchesNothing() {
        assertThat(Roles.in(new java.util.LinkedHashSet<>(List.of("io", "sho")))).isEqualTo("('io', 'sho')");
        assertThat(Roles.in(Set.of())).isEqualTo("(null)");
    }
}
