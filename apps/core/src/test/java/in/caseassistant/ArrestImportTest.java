package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Row checks of the arrests import. Fictional data only. */
class ArrestImportTest {
    static final Instant NOW = Instant.parse("2026-10-28T10:00:00Z");
    static final UUID OFFICER = UUID.randomUUID();
    static final ArrestImport.Accused A1 = new ArrestImport.Accused(UUID.randomUUID(), "A1", "Fictional Accused One");
    static final ArrestImport.Accused A2 = new ArrestImport.Accused(UUID.randomUUID(), "A2", "Fictional Accused Two");
    static final ArrestImport.Accused A3 = new ArrestImport.Accused(UUID.randomUUID(), "A3", "Fictional  accused two.");
    static final List<Map<String, Object>> THEFT = List.of(Map.of("act", "BNS", "section", "303(2)"));
    static final List<Map<String, Object>> ODD = List.of(Map.of("act", "BNS", "section", "999"));
    final ArrestImport rules;
    ArrestImport.Fir fir = fir(false, THEFT);

    ArrestImportTest() throws Exception {
        rules = new ArrestImport(new Punishments(new ObjectMapper().configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)));
    }

    static ArrestImport.Fir fir(boolean concluded, List<Map<String, Object>> sections) {
        return new ArrestImport.Fir(UUID.randomUUID(), Instant.parse("2026-03-05T09:00:00Z"), concluded, sections, List.of(A1, A2, A3));
    }

    FirImport.Result check(String... kv) {
        var m = new HashMap<String, String>(Map.of("fir_no", "12", "accused_name", "Fictional Accused One", "arrested_at", "06/03/2026 18:30"));
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return rules.check(m, (year, no) -> no == 12 && (year == null || year == 2026) ? List.of(fir) : no == 13 ? List.of(fir, fir) : List.of(),
                u -> u.equals("si.one") ? OFFICER : null, NOW);
    }

    @SuppressWarnings("unchecked")
    static List<String> grounds(FirImport.Result r) {
        return (List<String>) r.parsed().get("grounds");
    }

    boolean has(FirImport.Result r, String level, String field) {
        return r.messages().stream().anyMatch(m -> m.level().equals(level) && m.field().equals(field));
    }

    @Test
    void aCompleteRowIsOkAndTimesAreIndian() {
        var r = check("place", "Fictional Chowk", "grounds", "Theft; Likely to flee", "informed_name", "Fictional Relative", "arresting_officer", "SI.One",
                "first_remand_on", "07/03/2026", "released_on", "20/03/2026", "release_basis", "Statutory Bail", "max_punishment", "Less than 10 years");
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.parsed()).containsEntry("arrestedAt", "2026-03-06T13:00:00Z").containsEntry("personId", A1.id().toString())
                .containsEntry("officerId", OFFICER.toString()).containsEntry("firstRemandOn", "2026-03-07")
                .containsEntry("releaseBasis", "default_bail").containsEntry("maxPunishment", "less_than_10_years");
        assertThat(grounds(r)).containsExactly("Theft", "Likely to flee");
    }

    @Test
    void missingFactsAreMarkedNotInvented() {
        var r = check("first_remand_on", "07/03/2026", "max_punishment", "life imprisonment");
        assertThat(r.status()).isEqualTo("warning");
        assertThat(r.parsed()).containsEntry("place", ArrestImport.MISSING).containsEntry("informedName", ArrestImport.MISSING)
                .containsEntry("officerId", null).containsEntry("maxPunishment", "life");
        assertThat(grounds(r)).containsExactly(ArrestImport.MISSING);
        for (String f : new String[] {"place", "grounds", "informed_name", "arresting_officer"})
            assertThat(has(r, "warning", f)).as(f).isTrue();
        assertThat(check("arresting_officer", "nobody").messages()).anyMatch(m -> m.text().contains("No active officer"));
    }

    @Test
    void theFirAndTheAccusedMustAlreadyBeThere() {
        assertThat(has(check("fir_no", "99"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_no", "abc"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_no", "13"), "error", "fir_year")).isTrue();            // the number exists in two years
        assertThat(has(check("fir_year", "2025"), "error", "fir_no")).isTrue();         // not in that year
        assertThat(has(check("fir_year", "1999"), "error", "fir_year")).isTrue();
        assertThat(check("fir_year", "2026").parsed()).containsEntry("firId", fir.id().toString());
        assertThat(has(check("accused_name", "Fictional Stranger"), "error", "accused_name")).isTrue();
        assertThat(has(check("accused_name", ""), "error", "accused_name")).isTrue();
        // two accused share a name once spaces, dots and case are ignored: a label picks one, no label is an error and nothing is guessed
        assertThat(has(check("accused_name", "fictional accused two"), "error", "accused_label")).isTrue();
        assertThat(check("accused_name", "fictional accused two", "accused_label", "a3").parsed()).containsEntry("personId", A3.id().toString());
        assertThat(has(check("accused_name", "Fictional Accused One", "accused_label", "A2"), "error", "accused_name")).isTrue();
    }

    @Test
    void datesMustBeInOrderAndNotInTheFuture() {
        assertThat(has(check("arrested_at", ""), "error", "arrested_at")).isTrue();
        assertThat(has(check("arrested_at", "31/02/2026"), "error", "arrested_at")).isTrue();
        assertThat(has(check("arrested_at", "01/01/2027"), "error", "arrested_at")).isTrue();
        assertThat(has(check("arrested_at", "04/03/2026 10:00"), "error", "arrested_at")).as("before the FIR").isTrue();
        assertThat(check("arrested_at", "05/03/2026 02:00").status()).as("same day as the FIR is fine").isEqualTo("warning");
        assertThat(has(check("arrested_at", "06/03/2026"), "warning", "arrested_at")).as("date only").isTrue();
        assertThat(has(check("first_remand_on", "05/03/2026"), "error", "first_remand_on")).isTrue();
        assertThat(has(check("first_remand_on", "soon"), "error", "first_remand_on")).isTrue();
        assertThat(has(check("first_remand_on", "01/01/2027"), "error", "first_remand_on")).isTrue();
        assertThat(has(check("first_remand_on", "09/03/2026"), "warning", "first_remand_on")).as("more than a day later").isTrue();
        assertThat(has(check("released_on", "05/03/2026"), "error", "released_on")).isTrue();
    }

    @Test
    void custodyWarningsAppearOnlyWhereTheyMatter() {
        assertThat(has(check("first_remand_on", "07/03/2026"), "warning", "released_on")).as("running clock").isTrue();
        assertThat(has(check(), "warning", "first_remand_on")).as("clock cannot start").isTrue();
        assertThat(has(check("first_remand_on", "07/03/2026", "released_on", "10/03/2026"), "warning", "released_on")).isFalse();
        fir = fir(true, THEFT);
        assertThat(has(check("first_remand_on", "07/03/2026"), "warning", "released_on")).as("concluded cases have no live clock").isFalse();
        assertThat(has(check(), "warning", "first_remand_on")).isFalse();
    }

    @Test
    void theClassOfPunishmentIsNeverGuessedSilently() {
        var fromSections = check();
        assertThat(fromSections.parsed()).containsEntry("maxPunishment", "less_than_10_years");
        assertThat(has(fromSections, "warning", "max_punishment")).isTrue();
        assertThat(check("max_punishment", "death").parsed()).containsEntry("maxPunishment", "death");
        assertThat(has(check("max_punishment", "heavy"), "error", "max_punishment")).isTrue();
        fir = fir(false, ODD);
        assertThat(has(check(), "error", "max_punishment")).as("section not in the table").isTrue();
        assertThat(check("max_punishment", "10 years or more").parsed()).containsEntry("maxPunishment", "10_years_or_more");
    }

    @Test
    void anUnknownReleaseBasisBecomesOtherWithAWarning() {
        assertThat(check("released_on", "10/03/2026", "release_basis", "Bail").parsed()).containsEntry("releaseBasis", "bail");
        var r = check("released_on", "10/03/2026", "release_basis", "pardon");
        assertThat(r.parsed()).containsEntry("releaseBasis", "other");
        assertThat(has(r, "warning", "release_basis")).isTrue();
        assertThat(check("released_on", "10/03/2026").messages()).anyMatch(m -> m.text().contains("not given"));
        assertThat(check().parsed()).containsEntry("releaseBasis", null);
    }

    @Test
    void longTextIsCutAndTheDuplicateKeyIsTheAccusedAndIstDay() {
        var r = check("place", "x".repeat(900), "grounds", "g".repeat(900));
        assertThat((String) r.parsed().get("place")).hasSize(500);
        assertThat(grounds(r)).singleElement().asString().hasSize(500);
        assertThat(ArrestImport.arrestKey(A1.id(), "2026-03-06T20:00:00Z")).isEqualTo(A1.id() + "|2026-03-07");
    }
}
