package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Row checks of the FIR import. Fictional data only. */
class FirImportTest {
    static final Instant NOW = Instant.parse("2026-10-28T10:00:00Z");
    static final UUID IO = UUID.randomUUID();
    FirImport rules;

    FirImportTest() throws Exception {
        rules = new FirImport(new ObjectMapper());
    }

    FirImport.Result check(String... kv) {
        var m = new HashMap<String, String>(Map.of("fir_no", "12", "registered_at", "05/03/2024 14:30"));
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return rules.check(m, u -> u.equals("io.one") ? IO : null, NOW);
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, String>> secs(FirImport.Result r) {
        return (List<Map<String, String>>) r.parsed().get("sections");
    }

    boolean has(FirImport.Result r, String level, String field) {
        return r.messages().stream().anyMatch(m -> m.level().equals(level) && m.field().equals(field));
    }

    @Test
    void aCompleteRowIsOkAndTimesAreIndian() {
        var r = check("gd_entry_no", "GD-4", "complaint_text", "Fictional theft", "sections", "IPC 379", "io_username", "io.one",
                "information_received_at", "05/03/2024 13:00", "complainant_name", "Fictional Complainant", "accused_names", "A One; A Two");
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.parsed()).containsEntry("registeredAt", "2024-03-05T09:00:00Z").containsEntry("firYear", 2024).containsEntry("ioId", IO.toString());
        assertThat((List<?>) r.parsed().get("accused")).hasSize(2);
        assertThat(has(r, "info", "sections")).as("IPC 379 gets a BNS hint").isTrue();
    }

    @Test
    void missingFactsAreMarkedNotInvented() {
        var r = check();
        assertThat(r.status()).isEqualTo("warning");
        assertThat(r.parsed()).containsEntry("gdEntryNo", FirImport.NO_GD).containsEntry("complaintText", FirImport.NO_TEXT);
    }

    @Test
    void errorsStopTheRow() {
        assertThat(check("fir_no", "0").status()).isEqualTo("error");
        assertThat(check("fir_no", "abc").status()).isEqualTo("error");
        assertThat(check("registered_at", "").status()).isEqualTo("error");
        assertThat(check("registered_at", "31/02/2024").status()).isEqualTo("error");
        assertThat(check("registered_at", "2027-01-01").status()).as("future").isEqualTo("error");
        assertThat(check("fir_year", "1999").status()).isEqualTo("error");
        assertThat(check("information_received_at", "06/03/2024").status()).as("information after registration").isEqualTo("error");
        assertThat(check("information_received_at", "zzz").status()).isEqualTo("error");
        assertThat(check("zero_fir", "yes").status()).isEqualTo("error");
        assertThat(check("zero_fir", "yes", "outside_limits_place", "Fictional PS").parsed()).containsEntry("zeroFir", true);
    }

    @Test
    void datesInAllFormatsAndDateOnlyWarning() {
        for (String d : List.of("2024-03-05T14:30", "2024-03-05 14:30:00", "05-03-2024 14:30")) {
            var out = new boolean[1];
            assertThat(FirImport.when(d, out)).as(d).isEqualTo(Instant.parse("2024-03-05T09:00:00Z"));
            assertThat(out[0]).isFalse();
        }
        var r = check("registered_at", "05/03/2024");
        assertThat(has(r, "warning", "registered_at")).isTrue();
        assertThat(r.parsed()).containsEntry("registeredAt", "2024-03-04T18:30:00Z");
        assertThat(has(check("registered_at", "05/03/2024", "fir_year", "2023"), "warning", "fir_year")).isTrue();
    }

    @Test
    void sectionsAreReadWithTheActOrGuessedFromTheDate() {
        var r = check("sections", "IPC 420/34; 376(2)(n); POCSO 4; SC/ST 3; Excise Act 34", "registered_at", "05/03/2024 10:00");
        assertThat(secs(r)).containsExactly(
                Map.of("act", "IPC", "section", "420"), Map.of("act", "IPC", "section", "34"),
                Map.of("act", "IPC", "section", "376(2)(N)"), Map.of("act", "POCSO Act", "section", "4"),
                Map.of("act", "SC/ST Act", "section", "3"), Map.of("act", "Other", "section", "Excise Act 34"));
        assertThat(r.status()).isEqualTo("warning");
        var newer = check("sections", "318(4)", "registered_at", "05/08/2024 10:00");
        assertThat(secs(newer)).containsExactly(Map.of("act", "BNS", "section", "318(4)"));
        assertThat(secs(check("sections", "420", "registered_at", ""))).containsExactly(Map.of("act", "BNS", "section", "420"));
    }

    @Test
    void ioStatusAndNames() {
        assertThat(has(check("io_username", "nobody"), "warning", "io_username")).isTrue();
        assertThat(check("status", "Closed").parsed()).containsEntry("concluded", true);
        assertThat(check("status", "pending").parsed()).containsEntry("concluded", false);
        assertThat(has(check("status", "weird"), "warning", "status")).isTrue();
        var many = String.join(";", java.util.Collections.nCopies(40, "Fictional Witness"));
        assertThat((List<?>) check("witness_names", many).parsed().get("witnesses")).hasSize(FirImport.MAX_NAMES);
        assertThat(has(check("complainant_name", "x".repeat(300)), "warning", "complainant_name")).isTrue();
    }

    @Test
    void profilesAndColumnSuggestions() {
        assertThat(rules.hasProfile("fir-generic")).isTrue();
        assertThat(rules.profileList()).extracting(p -> p.get("id")).containsExactlyInAnyOrder("fir-generic", "arrest-generic", "chargesheet-generic", "fir-mh-cctns-fictional");
        assertThat(rules.entity("fir-generic")).isEqualTo("fir");
        assertThat(rules.entity("arrest-generic")).isEqualTo("arrest");
        assertThat(rules.requiredFields("arrest-generic")).containsExactlyInAnyOrder("fir_no", "accused_name", "arrested_at");
        assertThat(rules.requiredFields("fir-generic")).containsExactlyInAnyOrder("fir_no", "registered_at");
        var s = rules.suggest("fir-generic", List.of("FIR No", "Registration Date", "Brief Facts", "Unknown"));
        assertThat(s).containsEntry("fir_no", "FIR No").containsEntry("registered_at", "Registration Date").containsEntry("complaint_text", "Brief Facts");
    }

    @Test
    void profilesBelongToTheirModuleAndAnIdIsDeclaredOnce() throws Exception {
        assertThat(rules.module("fir-generic")).isEqualTo("IN");
        assertThat(rules.module("fir-mh-cctns-fictional")).isEqualTo("MH");
        assertThat(rules.profileList()).anySatisfy(p -> assertThat(p).containsEntry("id", "fir-mh-cctns-fictional").containsEntry("module", "MH"));
        var again = new ObjectMapper().readTree("{\"id\":\"fir-generic\",\"entity\":\"fir\",\"fields\":{}}");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> rules.addProfile("MH", again)).hasMessageContaining("declared twice");
    }

    @Test
    void theMadeUpMaharashtraLayoutMatchesCapitalAndMarathiHeadings() {
        assertThat(rules.suggest("fir-mh-cctns-fictional", List.of("FIR_NUM", "FIR_REG_DT", "ACT_SEC", "आरोपी", "थोडक्यात हकीकत", "fir no")))
                .containsEntry("fir_no", "FIR_NUM").containsEntry("registered_at", "FIR_REG_DT").containsEntry("sections", "ACT_SEC")
                .containsEntry("accused_names", "आरोपी").containsEntry("complaint_text", "थोडक्यात हकीकत").hasSize(5);
        assertThat(rules.suggest("fir-mh-cctns-fictional", List.of("गुन्हा क्रमांक", "दाखल दिनांक")))
                .containsEntry("fir_no", "गुन्हा क्रमांक").containsEntry("registered_at", "दाखल दिनांक");
    }
}
