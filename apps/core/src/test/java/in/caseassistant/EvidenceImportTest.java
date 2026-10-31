package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Row checks of the evidence register import. Fictional data only. */
class EvidenceImportTest {
    static final Instant NOW = Instant.parse("2026-10-28T10:00:00Z");
    static final ArrestImport.Fir FIR = new ArrestImport.Fir(UUID.randomUUID(), "XX", Instant.parse("2026-03-05T09:00:00Z"), false, List.of(), List.of());
    static final String SHA = "ab".repeat(32);
    final EvidenceImport rules = new EvidenceImport();

    FirImport.Result check(String... kv) {
        var m = new HashMap<String, String>(Map.of("fir_no", "12", "label", "12/E-01", "kind", "Physical", "description", "Fictional iron rod",
                "seized_at", "06/03/2026 14:30", "seizure_memo", "Fictional panchnama 1", "seal_no", "S-9"));
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return rules.check(m, (year, no) -> no == 12 && (year == null || year == 2026) ? List.of(FIR) : no == 13 ? List.of(FIR, FIR) : List.of(), NOW);
    }

    boolean has(FirImport.Result r, String level, String field) {
        return r.messages().stream().anyMatch(m -> m.level().equals(level) && m.field().equals(field));
    }

    @Test
    void aCompleteRowIsReadAsTheRegisterHasIt() {
        var r = check("source_key", "OLD-7", "esakshya_id", "ES-1");
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.messages()).isEmpty();
        assertThat(r.sourceKey()).isEqualTo("OLD-7");
        assertThat(r.parsed()).containsEntry("firId", FIR.id().toString()).containsEntry("kind", "physical").containsEntry("label", "12/E-01")
                .containsEntry("seizedAt", "2026-03-06T09:00:00Z").containsEntry("sealNo", "S-9").containsEntry("esakshyaId", "ES-1")
                .containsEntry("sha256", null).containsEntry("seizureMemo", "Fictional panchnama 1");
    }

    @Test
    void theFirMustBeOneFirOfTheStation() {
        assertThat(has(check("fir_no", "99"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_no", "13"), "error", "fir_year")).isTrue();
        assertThat(has(check("fir_no", "0"), "error", "fir_no")).isTrue();
        assertThat(has(check("fir_year", "1999"), "error", "fir_year")).isTrue();
        assertThat(check("fir_year", "2026").status()).isEqualTo("ok");
    }

    @Test
    void labelAndKindAreRequiredAndKindIsOneOfThree() {
        assertThat(has(check("label", ""), "error", "label")).isTrue();
        assertThat(has(check("label", "x".repeat(61)), "error", "label")).isTrue();
        assertThat(has(check("kind", ""), "error", "kind")).isTrue();
        var r = check("kind", "weapon");
        assertThat(has(r, "error", "kind")).isTrue();
        assertThat(r.parsed()).containsEntry("kind", "");
        assertThat(check("kind", "DOCUMENT").parsed()).containsEntry("kind", "document");
    }

    @Test
    void anElectronicItemNeedsItsHashAndAHashMustBeWellFormed() {
        assertThat(has(check("kind", "electronic"), "error", "sha256")).as("no hash is made up").isTrue();
        var r = check("kind", "electronic", "sha256", SHA.toUpperCase());
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.parsed()).containsEntry("sha256", SHA);
        assertThat(has(check("sha256", "abc"), "error", "sha256")).isTrue();
        assertThat(check("sha256", SHA).status()).as("a physical item may carry a hash").isEqualTo("ok");
        assertThat(check("kind", "electronic", "sha256", "zz").messages()).filteredOn(m -> m.field().equals("sha256")).hasSize(1);
    }

    @Test
    void theSeizureDateIsCheckedButNeverGuessed() {
        assertThat(has(check("seized_at", ""), "error", "seized_at")).isTrue();
        assertThat(has(check("seized_at", "soon"), "error", "seized_at")).isTrue();
        var future = check("seized_at", "29/10/2026");
        assertThat(has(future, "error", "seized_at")).isTrue();
        assertThat(future.parsed()).containsEntry("seizedAt", null);
        var dateOnly = check("seized_at", "2026-03-07");
        assertThat(dateOnly.status()).isEqualTo("warning");
        assertThat(dateOnly.parsed()).containsEntry("seizedAt", "2026-03-06T18:30:00Z");
        var before = check("seized_at", "04/03/2026 23:00");
        assertThat(has(before, "warning", "seized_at")).as("a recovery may come before the FIR; flagged, not refused").isTrue();
        assertThat(before.status()).isEqualTo("warning");
        assertThat(check("seized_at", "05/03/2026 08:00").status()).as("same day as the FIR").isEqualTo("ok");
        assertThat(check("fir_no", "99", "seized_at", "01/01/2026 10:00").messages()).noneMatch(m -> m.field().equals("seized_at"));
    }

    @Test
    void missingTextsAreMarkedAsMissingAndLongTextsAreCut() {
        var r = check("description", "", "seizure_memo", " ", "seal_no", "");
        assertThat(r.status()).isEqualTo("warning");
        assertThat(has(r, "warning", "description") && has(r, "warning", "seizure_memo")).isTrue();
        assertThat(r.parsed()).containsEntry("description", ArrestImport.MISSING).containsEntry("seizureMemo", ArrestImport.MISSING).containsEntry("sealNo", null);
        assertThat((String) check("description", "d".repeat(2100)).parsed().get("description")).hasSize(2000);
        assertThat((String) check("seal_no", "s".repeat(150)).parsed().get("sealNo")).hasSize(100);
        assertThat(check().sourceKey()).isNull();
    }
}
