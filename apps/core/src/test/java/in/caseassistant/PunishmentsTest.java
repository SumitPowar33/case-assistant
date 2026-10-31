package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PunishmentsTest {
    static final Punishments.Table IN = new Punishments.Table(
            Map.of("BNS 103(1)", "death", "BNS 309(4)", "less_than_10_years", "BNS 64(1)", "10_years_or_more"), List.of("BNS 3(5)"));

    static List<Map<String, Object>> secs(String... sections) {
        return java.util.Arrays.stream(sections).map(s -> Map.<String, Object>of("act", s.split(" ", 2)[0], "section", s.split(" ", 2)[1])).toList();
    }

    @Test
    void aStateAddsOnlySectionsTheNationalTableDoesNotNameAndOnlyForItsOwnFirs() {
        var p = new Punishments(Map.of("IN", IN, "MH", new Punishments.Table(Map.of("MCOCA 3(1)", "life"), null)));
        assertThat(p.hint("MH", secs("BNS 309(4)", "MCOCA 3(1)")).get("suggested")).isEqualTo("life");
        var ka = p.hint("KA", secs("BNS 309(4)", "MCOCA 3(1)"));   // another state does not get MH's law
        assertThat(ka.get("suggested")).isNull();
        assertThat(ka.get("unknown")).isEqualTo(List.of("MCOCA 3(1)"));
        assertThat(p.hint("KA", secs("BNS 3(5)", "BNS 64(1)")).get("suggested")).isEqualTo("10_years_or_more");   // no penalty of its own: skipped
    }

    @Test
    void aStateCannotReclassifyOrExemptANationalSection() {
        // lighter, heavier or the same: the national class stands, the pack is refused at start-up
        for (String c : List.of("less_than_10_years", "life", "death"))
            assertThatThrownBy(() -> new Punishments(Map.of("IN", IN, "MH", new Punishments.Table(Map.of("BNS 103(1)", c), null))))
                    .hasMessageContaining("MH: BNS 103(1) is in the national punishment table");
        assertThatThrownBy(() -> new Punishments(Map.of("IN", IN, "MH", new Punishments.Table(Map.of(), List.of("BNS 64(1)")))))
                .hasMessageContaining("MH: BNS 64(1) is in the national");
        assertThatThrownBy(() -> new Punishments(Map.of("IN", IN, "MH", new Punishments.Table(Map.of("BNS 3(5)", "life"), null))))
                .hasMessageContaining("MH: BNS 3(5) is in the national");
    }

    @Test
    void badTablesAreRefused() {
        assertThatThrownBy(() -> new Punishments(Map.of("IN", new Punishments.Table(Map.of("BNS 1", "flogging"), null))))
                .hasMessageContaining("IN: unknown punishment class flogging for BNS 1");
        assertThatThrownBy(() -> new Punishments(Map.of("IN", new Punishments.Table(Map.of("BNS 1", "life"), List.of("BNS 1")))))
                .hasMessageContaining("IN: BNS 1 has a class and is also listed without a penalty");
        var none = new Punishments(Map.of("MH", new Punishments.Table(null, null)));   // no national table: nothing is known
        assertThat(none.hint("MH", secs("BNS 1")).get("unknown")).isEqualTo(List.of("BNS 1"));
    }

    @Test
    void theShippedPacksLoad() throws Exception {
        var p = new Punishments(new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false));
        assertThat(p.hint("MH", secs("BNS 103(1)")).get("suggested")).isEqualTo("death");
    }
}
