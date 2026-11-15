package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Unit tests of the module manifests (packs/{id}/module.json); no database. Packs here are fictional. */
class ModulesTest {
    static Modules.Manifest m(String id, String... depends) {
        return new Modules.Manifest(id, "Fictional " + id, "1", List.of("en"), Arrays.asList(depends));
    }

    static Modules of(Map<String, Modules.Manifest> files) {
        return new Modules(files, null);
    }

    @Test
    void theNationalModuleAndAStateBuiltOnItAreAccepted() {
        assertThatCode(() -> of(Map.of("IN", m("IN"), "MH", m("MH", "IN")))).doesNotThrowAnyException();
        assertThatCode(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "1", List.of("en"), null)))).doesNotThrowAnyException();
    }

    @Test
    void theNationalModuleMustBeThere() {
        assertThatThrownBy(() -> of(Map.of())).hasMessageContaining("packs/IN/module.json is missing");
        assertThatThrownBy(() -> of(Map.of("MH", m("MH")))).hasMessageContaining("missing");
    }

    @Test
    void theIdMustBeTheFolderNameInCapitals() {
        assertThatThrownBy(() -> of(Map.of("IN", m("MH")))).hasMessageContaining("id must be the folder name");
        assertThatThrownBy(() -> of(Map.of("in", m("in")))).hasMessageContaining("id must be the folder name");
        assertThatThrownBy(() -> of(Map.of("IN", m(null)))).hasMessageContaining("id must be the folder name");
    }

    @Test
    void nameVersionAndLanguagesAreRequired() {
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", " ", "1", List.of("en"), List.of())))).hasMessageContaining("name and a version");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", null, "1", List.of("en"), List.of())))).hasMessageContaining("name and a version");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "", List.of("en"), List.of())))).hasMessageContaining("name and a version");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", null, List.of("en"), List.of())))).hasMessageContaining("name and a version");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "1", List.of(), List.of())))).hasMessageContaining("languages");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "1", null, List.of())))).hasMessageContaining("languages");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "1", List.of("English"), List.of())))).hasMessageContaining("languages");
        assertThatThrownBy(() -> of(Map.of("IN", new Modules.Manifest("IN", "N", "1", Arrays.asList((String) null), List.of())))).hasMessageContaining("languages");
    }

    @Test
    void everyOtherModuleBuildsOnTheNationalOneAndOnlyOnKnownModules() {
        assertThatThrownBy(() -> of(Map.of("IN", m("IN"), "MH", m("MH")))).hasMessageContaining("MH: every module must depend on IN");
        assertThatThrownBy(() -> of(Map.of("IN", m("IN"), "MH", m("MH", "IN", "KA")))).hasMessageContaining("unknown module KA");
        assertThatThrownBy(() -> of(Map.of("IN", m("IN", "IN")))).hasMessageContaining("unknown module IN");
    }

    static Modules.Manifest withActs(String id, String... acts) {
        return new Modules.Manifest(id, "Fictional " + id, "1", List.of("en"), id.equals("IN") ? List.of() : List.of("IN"), Arrays.asList(acts));
    }

    @Test
    void aStateModuleNamesLawsOfItsOwnStateOnly() {
        var mods = of(Map.of("IN", m("IN"), "MH", withActs("MH", "MPID Act"), "KA", m("KA", "IN")));
        org.assertj.core.api.Assertions.assertThat(mods.acts("MH")).contains("BNS", "IT Act", "MPID Act");
        org.assertj.core.api.Assertions.assertThat(mods.acts("KA")).doesNotContain("MPID Act").contains("POCSO Act");
        org.assertj.core.api.Assertions.assertThat(mods.acts(null)).isEqualTo(Playbooks.ACTS);
        org.assertj.core.api.Assertions.assertThat(mods.acts("ZZ")).isEqualTo(Playbooks.ACTS);
        org.assertj.core.api.Assertions.assertThat(mods.exists("MH")).isTrue();
        org.assertj.core.api.Assertions.assertThat(mods.exists("ZZ")).isFalse();
        org.assertj.core.api.Assertions.assertThat(mods.stateActs()).isEqualTo(Map.of("MPID Act", "MH"));
        org.assertj.core.api.Assertions.assertThat(of(Map.of("IN", m("IN"))).stateActs()).isEmpty();
    }

    @Test
    void aStateLawIsNeverANationalActNorTwoStatesLawsNorNamedByTheNationalModule() {
        assertThatThrownBy(() -> of(Map.of("IN", withActs("IN", "MPID Act")))).hasMessageContaining("national acts are fixed");
        for (String bad : new String[] {"BNS", "IT Act", "MPID", "mpid Act", "MPID  Act", "MPID Act 1999", "A".repeat(37) + " Act"})
            assertThatThrownBy(() -> of(Map.of("IN", m("IN"), "MH", withActs("MH", bad)))).as(bad).hasMessageContaining("is not a state law");
        assertThatThrownBy(() -> of(Map.of("IN", m("IN"), "MH", withActs("MH", (String) null)))).hasMessageContaining("is not a state law");
        assertThatThrownBy(() -> of(new java.util.LinkedHashMap<>(java.util.Map.of("IN", m("IN"))) {{
            put("MH", withActs("MH", "MPID Act"));
            put("KA", withActs("KA", "MPID Act"));
        }})).hasMessageContaining("KA: MPID Act is already a law of MH");
    }
}
