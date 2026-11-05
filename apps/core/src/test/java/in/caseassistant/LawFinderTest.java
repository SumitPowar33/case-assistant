package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The old law to new law table of the national pack and the start-up checks a table must pass. Fictional data only. */
class LawFinderTest {
    final ObjectMapper json = new ObjectMapper();

    void add(LawFinder f, String file) throws Exception {
        f.add(json.readTree(file));
    }

    static String row(String law, String old, String nu, String what) {
        return "{\"law\":\"" + law + "\",\"old\":\"" + old + "\",\"new\":" + nu + ",\"what\":\"" + what + "\"}";
    }

    @Test
    void theNationalTableIsLoadedForAllThreeLawsAndMarkedAsADraft() throws Exception {
        var a = new LawFinder(json).all();
        assertThat(a.status()).isEqualTo("draft");
        assertThat(a.note()).contains("Advisory only");
        assertThat(a.entries()).extracting(LawFinder.Entry::newLaw).contains("BNS", "BNSS", "BSA");
        var murder = a.entries().stream().filter(e -> e.law().equals("IPC") && e.from().equals("302")).findFirst().orElseThrow();
        assertThat(murder.to()).isEqualTo("103");
        assertThat(murder.newLaw()).isEqualTo("BNS");
        assertThat(a.entries().stream().filter(e -> e.law().equals("IPC") && e.from().equals("377")).findFirst().orElseThrow().to()).isNull();
        assertThat(a.entries().stream().filter(e -> e.law().equals("IEA") && e.from().equals("65B")).findFirst().orElseThrow().partial()).isTrue();
    }

    @Test
    void aTableMayOnlyHaveWellFormedSectionsListedOnce() throws Exception {
        var f = new LawFinder();
        add(f, "{\"status\":\"reviewed\",\"note\":\"Fictional note\",\"sections\":[" + row("CrPC", "154", "\"173\"", "FIR") + "]}");
        assertThat(f.all().status()).isEqualTo("reviewed");
        assertThat(f.all().entries().get(0).partial()).isFalse();
        assertThat(f.all().entries().get(0).newLaw()).isEqualTo("BNSS");
        add(f, "{\"status\":\"draft\",\"sections\":[" + row("IPC", "120B", "\"61\"", "Conspiracy") + "]}");
        assertThat(f.all().status()).isEqualTo("draft");   // one draft file makes the whole table a draft
        assertThat(f.all().note()).isEqualTo("Fictional note");   // a file without a note keeps the one given
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("CrPC", "154", "\"173\"", "FIR again") + "]}")).hasMessageContaining("listed twice");
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("XYZ", "1", "\"2\"", "x") + "]}")).hasMessageContaining("not one of");
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("IPC", "abc", "\"2\"", "x") + "]}")).hasMessageContaining("section number");
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("IPC", "5", "\"2\"", " ") + "]}")).hasMessageContaining("description");
        assertThatThrownBy(() -> add(f, "{\"sections\":[{\"law\":\"IPC\",\"old\":\"6\"}]}")).hasMessageContaining("description");
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("IPC", "7", "\"x\"", "x") + "]}")).hasMessageContaining("bad new section");
        assertThatThrownBy(() -> add(f, "{\"sections\":[" + row("IPC", "8", "\"\"", "x") + "]}")).hasMessageContaining("bad new section");
        add(f, "{\"sections\":[" + row("IPC", "9", "null", "No new section") + ",{\"law\":\"IEA\",\"old\":\"3\",\"new\":\"2\",\"what\":\"Terms\",\"partial\":true}]}");
        assertThat(f.all().entries()).hasSize(4);
        assertThat(f.all().entries().get(2).to()).isNull();
        assertThat(f.all().entries().get(3).partial()).isTrue();
    }
}
