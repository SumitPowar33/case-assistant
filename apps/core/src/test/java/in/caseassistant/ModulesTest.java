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
}
