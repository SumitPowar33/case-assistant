package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** The legal glossary of the packs and the start-up checks a module file must pass. Fictional data only. */
class GlossaryTest {
    final ObjectMapper json = new ObjectMapper();

    @Test
    void theNationalGlossaryIsLoadedInEveryLanguageAndMarkedAsDraft() throws Exception {
        var g = new Glossary(json).all();
        assertThat(g.status()).isEqualTo("draft");
        assertThat(g.reviewNote()).contains("not reviewed");
        var fir = g.entries().stream().filter(e -> e.id().equals("default_bail")).findFirst().orElseThrow();
        assertThat(fir.law()).isEqualTo("BNSS 187(3)");
        assertThat(fir.module()).isEqualTo("IN");
        assertThat(fir.terms().keySet()).containsExactlyInAnyOrder("hi", "mr", "gu", "bn", "pa", "or", "ta", "te", "kn", "ml");
        assertThat(g.entries()).extracting(Glossary.Entry::id).contains("fir", "closure_report", "accused").doesNotHaveDuplicates();
    }

    Glossary small() {
        return new Glossary(new java.util.TreeSet<>(Set.of("hi", "mr")));
    }

    void add(Glossary g, String file) throws Exception {
        g.add(json.readTree(file));
    }

    static final String TERMS = "\"terms\":{\"hi\":\"शब्द\",\"mr\":\"शब्द\"}";

    @Test
    void aModuleMayOnlyAddWellFormedTerms() throws Exception {
        var g = small();
        add(g, "{\"module\":\"IN\",\"status\":\"reviewed\",\"entries\":[{\"id\":\"word\",\"term\":\"Word\",\"meaning\":\"A fictional word\"," + TERMS + "}]}");
        assertThat(g.all().status()).isEqualTo("reviewed");
        assertThat(g.all().reviewNote()).isEmpty();
        assertThat(g.all().entries().get(0).law()).isNull();
        add(g, "{\"module\":\"MH\",\"status\":\"draft\",\"review_note\":\"Fictional note\",\"entries\":[{\"id\":\"local_word\",\"term\":\"Local\",\"law\":\"MPA 1\",\"meaning\":\"m\"," + TERMS + "}]}");
        assertThat(g.all().status()).isEqualTo("draft");   // one draft file makes the whole glossary a draft
        assertThat(g.all().reviewNote()).isEqualTo("Fictional note");
        assertThat(g.all().entries()).extracting(Glossary.Entry::module).containsExactly("IN", "MH");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"word\",\"term\":\"Changed\",\"meaning\":\"m\"," + TERMS + "}]}")).hasMessageContaining("declared twice");
        assertThatThrownBy(() -> add(g, "{\"module\":\"mh\",\"entries\":[]}")).hasMessageContaining("module id");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"Bad-Id\",\"term\":\"x\",\"meaning\":\"m\"," + TERMS + "}]}")).hasMessageContaining("not [a-z0-9_]");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"no_term\",\"term\":\" \",\"meaning\":\"m\"," + TERMS + "}]}")).hasMessageContaining("a term and a meaning");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"no_meaning\",\"term\":\"x\"," + TERMS + "}]}")).hasMessageContaining("a term and a meaning");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"one_lang\",\"term\":\"x\",\"meaning\":\"m\",\"terms\":{\"hi\":\"शब्द\"}}]}")).hasMessageContaining("each of [hi, mr]");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"blank\",\"term\":\"x\",\"meaning\":\"m\",\"terms\":{\"hi\":\"शब्द\",\"mr\":\" \"}}]}")).hasMessageContaining("each of");
        assertThatThrownBy(() -> add(g, "{\"module\":\"MH\",\"entries\":[{\"id\":\"extra\",\"term\":\"x\",\"meaning\":\"m\",\"terms\":{\"hi\":\"a\",\"mr\":\"b\",\"xx\":\"c\"}}]}")).hasMessageContaining("each of");
    }
}
