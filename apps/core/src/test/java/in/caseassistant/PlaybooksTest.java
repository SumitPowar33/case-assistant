package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/** A playbook's charges name an act and a section fir_section takes, or the application does not start. */
class PlaybooksTest {
    static Playbooks.Playbook with(String law) {
        return new Playbooks.Playbook("p", "1", "draft", "note", "x", List.of(new Playbooks.Charge("c", law, "label", List.of())), List.of());
    }

    @Test
    void aChargesLawIsSplitIntoItsActAndSection() {
        assertThat(with("BNS 318(4)").charges().get(0).act()).isEqualTo("BNS");
        assertThat(with("BNS 318(4)").charges().get(0).section()).isEqualTo("318(4)");
        assertThat(with("IT Act 66D").charges().get(0).act()).isEqualTo("IT Act");
        assertThat(with("IT Act 66D").charges().get(0).section()).isEqualTo("66D");
        assertThat(with("POCSO Act 4").charges().get(0).act()).isEqualTo("POCSO Act");
        for (String good : List.of("BNS 61(2)", "IPC 420", "SC/ST Act 3(1)(r)", "Other 12"))
            Playbooks.check(with(good));
    }

    @Test
    void aLawThatIsNotAnActAndASectionIsRefused() {
        for (String bad : List.of("BNS", "BNS ", "BNSS 173", "IT 66D", "bns 318", "BNS  318", "BNS 318 (4)", "BNS (4)", "Cheating"))
            assertThatThrownBy(() -> Playbooks.check(with(bad))).as(bad).hasMessageContaining("names a law that is not an act and a section");
    }
}
