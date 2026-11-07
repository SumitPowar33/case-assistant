package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The complaint kinds of the packs and the start-up checks a module file must pass. Fictional data only. */
class ComplaintKindsTest {
    final ObjectMapper json = new ObjectMapper();

    ComplaintKinds kinds() throws Exception {
        return new ComplaintKinds(json);
    }

    void add(String file) throws Exception {
        kinds().add(json.readTree(file));
    }

    @Test
    void theNationalKindsAreLoadedWithTheirGoldenHourSteps() throws Exception {
        var k = kinds();
        assertThat(k.get("cyber_financial_fraud").steps()).extracting(ComplaintKinds.Step::id).contains("report_1930");
        assertThat(k.get("sexual_offence").steps()).filteredOn(s -> s.id().equals("medical_exam")).first()
                .satisfies(s -> assertThat(s.withinMinutes()).isEqualTo(1440)).satisfies(s -> assertThat(s.basis()).isEqualTo("BNSS 184"));
        assertThat(k.get("other").steps()).isEmpty();
        assertThat(k.get("other").module()).isEqualTo("IN");
        assertThat(k.get("no_such")).isNull();
        assertThat(k.all()).hasSizeGreaterThan(3);
        // the kinds that name a protected victim, and only those
        assertThat(k.protectedIds()).containsExactlyInAnyOrder("sexual_offence", "acid_attack");
        assertThat(k.protectsIdentity("acid_attack")).isTrue();
        assertThat(k.protectsIdentity("hurt")).isFalse();
        assertThat(k.protectsIdentity("no_such")).isFalse();
        assertThat(k.protectsIdentity(null)).isFalse();
    }

    @Test
    void aModuleMayOnlyAddWellFormedKinds() throws Exception {
        add("{\"module\":\"MH\",\"kinds\":{\"chain_snatching\":{\"label\":\"Fictional\",\"steps\":[{\"id\":\"alert\",\"text\":\"Alert\",\"within_minutes\":30}]}}}");
        assertThatThrownBy(() -> add("{\"module\":\"MH\",\"kinds\":{\"other\":{\"label\":\"Changed\",\"steps\":[]}}}")).hasMessageContaining("declared twice");
        assertThatThrownBy(() -> add("{\"kinds\":{\"Bad-Id\":{\"label\":\"x\"}}}")).hasMessageContaining("not [a-z_]");
        assertThatThrownBy(() -> add("{\"kinds\":{\"no_label\":{\"steps\":[]}}}")).hasMessageContaining("no label");
        assertThatThrownBy(() -> add("{\"kinds\":{\"k_one\":{\"label\":\"x\",\"steps\":[{\"id\":\"a1\",\"text\":\"t\"},{\"id\":\"a1\",\"text\":\"t\"}]}}}")).hasMessageContaining("repeated");
        assertThatThrownBy(() -> add("{\"kinds\":{\"k_two\":{\"label\":\"x\",\"steps\":[{\"id\":\"a1\",\"text\":\" \"}]}}}")).hasMessageContaining("no text");
        assertThatThrownBy(() -> add("{\"kinds\":{\"k_three\":{\"label\":\"x\",\"steps\":[{\"id\":\"a1\",\"text\":\"t\",\"within_minutes\":-5}]}}}")).hasMessageContaining("0 or more");
        assertThatThrownBy(() -> add("{\"kinds\":{\"k_five\":{\"label\":\"x\",\"protects_identity\":\"yes\",\"steps\":[]}}}")).hasMessageContaining("true or false");
        var k = kinds();
        k.add(json.readTree("{\"module\":\"MH\",\"kinds\":{\"fictional_protected\":{\"label\":\"Fictional\",\"protects_identity\":true,\"steps\":[]}}}"));
        assertThat(k.protectsIdentity("fictional_protected")).isTrue();   // a state module may add a protected kind
        assertThatThrownBy(() -> add("{\"kinds\":{\"k_four\":{\"label\":\"x\",\"steps\":[{\"id\":\"a1\",\"text\":\"t\",\"within_minutes\":\"soon\"}]}}}")).hasMessageContaining("0 or more");
    }
}
