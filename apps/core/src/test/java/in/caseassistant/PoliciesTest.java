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

    static final Map<String, Policies.Def> NATIONAL = Map.of("import_self_approval", new Policies.Def("Fictional", 1, 0, 1),
            "victim_update_days", new Policies.Def("Fictional", 90, 7, 90));

    static Policies withStateValue(String state, String key, int value, String reason) {
        return new Policies(NATIONAL, Map.of(state, Map.of(key, new Policies.StateValue(value, reason))), null);
    }

    @Test
    void aStateModuleMayOnlyMakeANationalPolicyStricterForItsOwnState() {
        var p = withStateValue("MH", "victim_update_days", 30, "Fictional state order");
        assertThat(p.above("state", "MH", null, "victim_update_days")).isEqualTo(30);   // the module is the unit above the state admin
        assertThat(p.above("state", "KA", null, "victim_update_days")).isEqualTo(90);   // other states keep the default
        assertThat(p.above("state", "MH", null, "import_self_approval")).isEqualTo(1);
        assertThat(withStateValue("MH", "victim_update_days", 90, "Fictional state order").above("state", "MH", null, "victim_update_days")).isEqualTo(90);
        assertThat(withStateValue("MH", "victim_update_days", 7, "Fictional state order").above("state", "MH", null, "victim_update_days")).isEqualTo(7);
        assertThatThrownBy(() -> withStateValue("MH", "victim_update_days", 91, "Fictional state order")).hasMessageContaining("only be made stricter");
        assertThatThrownBy(() -> withStateValue("MH", "victim_update_days", 6, "Fictional state order")).hasMessageContaining("only be made stricter");
        assertThatThrownBy(() -> withStateValue("MH", "no_such_policy", 1, "Fictional state order")).hasMessageContaining("unknown policy");
        assertThatThrownBy(() -> withStateValue("IN", "import_self_approval", 0, "Fictional state order")).hasMessageContaining("national module sets defaults");
        assertThatThrownBy(() -> withStateValue("MH", "import_self_approval", 0, " too short ")).hasMessageContaining("reason");
        assertThatThrownBy(() -> withStateValue("MH", "import_self_approval", 0, null)).hasMessageContaining("reason");
    }

    @Test
    void aStateValueInThePackFileMustBeAWholeNumber() throws Exception {
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        assertThat(Policies.stateValue("MH", "k", json.readTree("{\"value\":0,\"reason\":\"Fictional state order\"}")))
                .isEqualTo(new Policies.StateValue(0, "Fictional state order"));
        assertThat(Policies.stateValue("MH", "k", json.readTree("{\"value\":0}")).reason()).isNull();
        assertThatThrownBy(() -> Policies.stateValue("MH", "k", json.readTree("{\"value\":\"0\"}"))).hasMessageContaining("MH: state value of k must be a whole number");
        assertThatThrownBy(() -> Policies.stateValue("MH", "k", json.readTree("{}"))).hasMessageContaining("whole number");
    }
}
