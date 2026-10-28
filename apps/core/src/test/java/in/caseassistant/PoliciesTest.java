package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Unit tests of the policy definitions; no database. */
class PoliciesTest {
    @Test
    void definitionsAreReadAndTheDefaultIsUsedWithoutAStation() {
        var p = new Policies(Map.of("victim_update_days", new Policies.Def("Fictional", 90, 7, 90),
                "session_hours", new Policies.Def("Fictional", 8, 1, 8)), null);
        assertThat(p.def("victim_update_days").max()).isEqualTo(90);
        assertThat(p.def("nothing")).isNull();
        assertThat(p.effective(null, "session_hours")).isEqualTo(8);
        assertThat(p.sessionLife(null)).isEqualTo(Duration.ofHours(8));
        assertThat(p.forStation(null)).hasSize(2).allSatisfy(m -> assertThat(m).containsKeys("key", "label", "default", "min", "max", "effective"));
    }

    @Test
    void badDefinitionsAreRefusedAtStartUp() {
        assertThatThrownBy(() -> new Policies(Map.of("Bad Key", new Policies.Def("x", 5, 1, 9)), null)).hasMessageContaining("bad policy key");
        assertThatThrownBy(() -> new Policies(Map.of("ok_key", new Policies.Def("x", 20, 1, 9)), null)).hasMessageContaining("do not fit");
        assertThatThrownBy(() -> new Policies(Map.of("ok_key", new Policies.Def("x", 0, 1, 9)), null)).hasMessageContaining("do not fit");
        assertThatThrownBy(() -> new Policies(Map.of("ok_key", new Policies.Def("x", 5, 9, 1)), null)).hasMessageContaining("do not fit");
    }
}
