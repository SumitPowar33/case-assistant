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

    static final Playbooks.Ingredient DECEIVED = new Playbooks.Ingredient("deception", "The victim was deceived", List.of("complainant_statement", "call_or_chat_record"));

    static Playbooks.Playbook book(String id, String law, Playbooks.Ingredient... ingredients) {
        return new Playbooks.Playbook(id, "1", "draft", "note", "x", List.of(new Playbooks.Charge("c", law, "label", List.of(ingredients))), List.of());
    }

    static Modules modules() {
        return new Modules(java.util.Map.of("IN", ModulesTest.m("IN"),
                "MH", new Modules.Manifest("MH", "Fictional MH", "1", List.of("mr"), List.of("IN"), List.of("MPID Act")),
                "KA", ModulesTest.m("KA", "IN")), null);
    }

    static Playbooks of(String module, Playbooks.Playbook pb) {
        return new Playbooks(List.of(java.util.Map.entry("IN", book("national", "BNS 318(4)", DECEIVED)), java.util.Map.entry(module, pb)), modules());
    }

    @Test
    void aStateLawIsSplitAndTakenOnlyInItsOwnStatesPlaybooks() {
        var pbs = of("MH", book("mh", "MPID Act 3"));
        assertThat(pbs.get("mh").orElseThrow().charges().get(0).act()).isEqualTo("MPID Act");
        assertThat(pbs.get("mh").orElseThrow().charges().get(0).section()).isEqualTo("3");
        assertThatThrownBy(() -> of("KA", book("ka", "MPID Act 3"))).hasMessageContaining("not an act and a section");
        assertThatThrownBy(() -> of("IN", book("in2", "MPID Act 3"))).hasMessageContaining("not an act and a section");
        assertThatThrownBy(() -> of("XX", book("xx", "BNS 61(2)"))).hasMessageContaining("packs/XX, which has no module.json");
        assertThatThrownBy(() -> of("MH", book("national", "BNS 61(2)"))).hasMessageContaining("two playbooks with id national");
    }

    @Test
    void aStatePlaybookHoldsOnlyInItsStateAndTheNationalOnesEverywhere() {
        var pbs = of("MH", book("mh", "MPID Act 3"));
        var mh = pbs.get("mh").orElseThrow();
        var nat = pbs.get("national").orElseThrow();
        assertThat(pbs.holdsFor(mh, "MH")).isTrue();
        assertThat(pbs.holdsFor(mh, "KA")).isFalse();
        assertThat(pbs.holdsFor(nat, "KA")).isTrue();
        assertThat(pbs.forState("KA")).containsExactly(nat);
        assertThat(pbs.forState("MH")).containsExactlyInAnyOrder(nat, mh);
        assertThat(pbs.forState(null)).containsExactlyInAnyOrder(nat, mh);   // the platform admin
        assertThat(pbs.module("mh")).isEqualTo("MH");
        assertThat(pbs.module("national")).isEqualTo("IN");
    }

    @Test
    void aStatePlaybookMayOnlyAddToANationalCharge() {
        var more = new Playbooks.Ingredient("deception", "The victim was deceived", List.of("complainant_statement", "call_or_chat_record", "bank_statement_certified"));
        var extra = new Playbooks.Ingredient("extra", "Something more to prove", List.of("x"));
        org.assertj.core.api.Assertions.assertThatCode(() -> of("MH", book("mh", "BNS 318(4)", more, extra))).doesNotThrowAnyException();
        org.assertj.core.api.Assertions.assertThatCode(() -> of("MH", book("mh", "BNS 61(2)"))).doesNotThrowAnyException();   // no national charge of that law
        for (var weaker : List.of(
                book("mh", "BNS 318(4)"),                                                                                      // left out
                book("mh", "BNS 318(4)", extra),
                book("mh", "BNS 318(4)", new Playbooks.Ingredient("deception", "The victim was misled", DECEIVED.proof())),       // text changed
                book("mh", "BNS 318(4)", new Playbooks.Ingredient("deceived", DECEIVED.text(), DECEIVED.proof())),              // id changed
                book("mh", "BNS 318(4)", new Playbooks.Ingredient("deception", DECEIVED.text(), List.of("complainant_statement"))))) // a proof dropped
            assertThatThrownBy(() -> of("MH", weaker)).hasMessageContaining("may only add to a national charge");
        // a national playbook is not held to another national playbook's charge
        org.assertj.core.api.Assertions.assertThatCode(() -> of("IN", book("in2", "BNS 318(4)"))).doesNotThrowAnyException();
    }

    static Playbooks.Texts texts(String id, String language, String status, java.util.Map<String, String> texts) {
        return new Playbooks.Texts(id, language, status, texts);
    }

    @Test
    void aTranslationGivesOnlyTextsItsPlaybookShowsAndOnlyForThePlaybooksOfTheState() {
        var pbs = of("MH", book("mh", "MPID Act 3", new Playbooks.Ingredient("i", "A state ingredient", List.of("x"))));
        pbs.addTexts("IN", texts("national", "mr", "reviewed", java.util.Map.of("The victim was deceived", "पीडिताची फसवणूक झाली",
                "x", "लागू", "label", " ", "A text the playbook no longer has", "जुना मजकूर")));
        assertThat(pbs.translations("MH", "mr").status()).isEqualTo("reviewed");
        pbs.addTexts("MH", texts("mh", "mr", "draft", java.util.Map.of("A state ingredient", "राज्य घटक")));
        var mh = pbs.translations("MH", "mr");
        assertThat(mh.status()).isEqualTo("draft");   // one unreviewed file makes the answer a draft
        assertThat(mh.texts()).containsOnly(java.util.Map.entry("The victim was deceived", "पीडिताची फसवणूक झाली"),
                java.util.Map.entry("x", "लागू"), java.util.Map.entry("A state ingredient", "राज्य घटक"));   // no blank, no stale text
        assertThat(pbs.translations("KA", "mr").texts()).containsOnlyKeys("The victim was deceived", "x");
        assertThat(pbs.translations(null, "mr").texts()).hasSize(3);
        assertThat(pbs.translations("MH", "ta").texts()).isEmpty();
    }

    @Test
    void aTranslationIsTakenOnlyFromThePlaybooksOwnModuleAndOncePerLanguage() {
        var pbs = of("MH", book("mh", "MPID Act 3"));
        for (var wrong : List.of(java.util.Map.entry("MH", "national"), java.util.Map.entry("IN", "mh"), java.util.Map.entry("IN", "gone")))
            assertThatThrownBy(() -> pbs.addTexts(wrong.getKey(), texts(wrong.getValue(), "mr", "draft", java.util.Map.of())))
                    .hasMessageContaining(wrong.getValue() + " is not a playbook of this module");
        pbs.addTexts("MH", texts("mh", "mr", "draft", java.util.Map.of()));
        pbs.addTexts("MH", texts("mh", "hi", "draft", java.util.Map.of()));
        assertThatThrownBy(() -> pbs.addTexts("MH", texts("mh", "mr", "draft", java.util.Map.of()))).hasMessageContaining("two translations of mh into mr");
    }
}
