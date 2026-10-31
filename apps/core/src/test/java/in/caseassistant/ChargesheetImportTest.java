package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Row checks of the chargesheets import. Fictional data only. */
class ChargesheetImportTest {
    static final Instant NOW = Instant.parse("2026-10-28T10:00:00Z");
    static final ArrestImport.Accused A1 = new ArrestImport.Accused(UUID.randomUUID(), "A1", "Fictional Accused One");
    static final ArrestImport.Accused A2 = new ArrestImport.Accused(UUID.randomUUID(), "A2", "Fictional Accused Two");
    static final ArrestImport.Accused A3 = new ArrestImport.Accused(UUID.randomUUID(), "A3", "Fictional  accused two.");
    static final ArrestImport.Fir FIR = new ArrestImport.Fir(UUID.randomUUID(), "XX", Instant.parse("2026-03-05T09:00:00Z"), false, List.of(), List.of(A1, A2, A3));
    final ChargesheetImport rules = new ChargesheetImport();

    FirImport.Result check(String... kv) {
        var m = new HashMap<String, String>(Map.of("fir_no", "12", "report_no", "CS-1/2026", "filed_on", "20/05/2026", "court", "Fictional JMFC Court",
                "accused_names", "Fictional Accused One"));
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return rules.check(m, (year, no) -> no == 12 && (year == null || year == 2026) ? List.of(FIR) : no == 13 ? List.of(FIR, FIR) : List.of(), NOW);
    }

    boolean has(FirImport.Result r, String level, String field) {
        return r.messages().stream().anyMatch(m -> m.level().equals(level) && m.field().equals(field));
    }

    @Test
    void aCompleteRowNamesTheAccusedItCovers() {
        var r = check("accused_names", "Fictional Accused One; a2 ; Fictional Accused One", "accused_label", "ignored");
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.parsed()).containsEntry("filedOn", "2026-05-20").containsEntry("court", "Fictional JMFC Court").containsEntry("firId", FIR.id().toString())
                .containsEntry("accusedIds", List.of(A1.id().toString(), A2.id().toString()));
        assertThat(has(r, "info", "accused_names")).as("A3 is not named").isTrue();
    }

    @Test
    void namesAreMatchedToAccusedAlreadyInTheFirAndNobodyIsGuessed() {
        assertThat(has(check("accused_names", "Fictional Stranger"), "error", "accused_names")).isTrue();
        assertThat(has(check("accused_names", ""), "error", "accused_names")).isTrue();
        assertThat(has(check("accused_names", "fictional accused two"), "error", "accused_names")).as("two accused share this name").isTrue();
        assertThat(check("accused_names", "A3").parsed()).containsEntry("accusedIds", List.of(A3.id().toString()));
        assertThat(has(check("accused_names", String.join(";", java.util.Collections.nCopies(31, "A1"))), "error", "accused_names")).isTrue();
        assertThat(check("accused_names", "A1;A2;A3").messages()).noneMatch(m -> m.level().equals("info"));
    }

    @Test
    void theFirMustAlreadyBeThere() {
        assertThat(has(check("fir_no", "99"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_no", "x"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_no", "13"), "error", "fir_year")).isTrue();
        assertThat(has(check("fir_year", "2025"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_year", "1999"), "error", "fir_year")).isTrue();
        assertThat(check("fir_year", "2026").parsed()).containsEntry("firId", FIR.id().toString());
    }

    @Test
    void numberDateAndCourtAreChecked() {
        assertThat(has(check("report_no", ""), "error", "report_no")).isTrue();
        assertThat(has(check("report_no", "x".repeat(61)), "error", "report_no")).isTrue();
        assertThat(has(check("filed_on", ""), "error", "filed_on")).isTrue();
        assertThat(has(check("filed_on", "31/02/2026"), "error", "filed_on")).isTrue();
        assertThat(has(check("filed_on", "01/01/2027"), "error", "filed_on")).isTrue();
        assertThat(has(check("filed_on", "04/03/2026"), "error", "filed_on")).as("before the FIR").isTrue();
        assertThat(check("filed_on", "05/03/2026").status()).as("the day of the FIR is allowed").isEqualTo("ok");
        var noCourt = check("court", "");
        assertThat(noCourt.status()).isEqualTo("warning");
        assertThat(noCourt.parsed()).containsEntry("court", ArrestImport.MISSING);
        assertThat((String) check("court", "c".repeat(400)).parsed().get("court")).hasSize(200);
    }

    @Test
    void theRepeatKeyIgnoresCaseAndSpaces() {
        assertThat(ChargesheetImport.key(FIR.id(), "CS 1/2026")).isEqualTo(ChargesheetImport.key(FIR.id(), " cs1/2026"));
        assertThat(ChargesheetImport.key(FIR.id(), "CS-1")).isNotEqualTo(ChargesheetImport.key(UUID.randomUUID(), "CS-1"));
    }
}
