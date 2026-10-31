package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Row checks of the notices import. Fictional data only. */
class NoticeImportTest {
    static final Instant NOW = Instant.parse("2026-10-28T10:00:00Z");
    static final ArrestImport.Fir OLD = new ArrestImport.Fir(UUID.randomUUID(), "XX", Instant.parse("2024-03-05T04:30:00Z"), false, List.of(), List.of());
    static final ArrestImport.Fir NEW = new ArrestImport.Fir(UUID.randomUUID(), "XX", Instant.parse("2024-06-30T18:30:00Z"), false, List.of(), List.of());  // 1 July 2024, 00:00 IST
    static final UUID SIGNER = UUID.randomUUID();
    final NoticeImport rules = new NoticeImport();

    /** FIR 12 is of March 2024 (CrPC), FIR 14 of 1 July 2024 (BNSS). */
    FirImport.Result check(String... kv) {
        var m = new HashMap<String, String>(Map.of("fir_no", "12", "kind", "CrPC 91", "addressee", "Fictional Bank Ltd", "issued_on", "10/03/2024 11:00",
                "items_requested", "Account statement; KYC form", "status", "Replied", "signed_by", "io.one", "body", "Fictional notice text"));
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return rules.check(m, (year, no) -> no == 12 ? List.of(OLD) : no == 14 ? List.of(NEW) : List.of(), u -> u.equals("io.one") ? SIGNER : null, NOW);
    }

    boolean has(FirImport.Result r, String level, String field) {
        return r.messages().stream().anyMatch(m -> m.level().equals(level) && m.field().equals(field));
    }

    @Test
    void aCompleteRowIsReadAsTheRegisterHasIt() {
        var r = check("reply_due_on", "20/03/2024", "source_key", "N-7");
        assertThat(r.status()).isEqualTo("ok");
        assertThat(r.messages()).isEmpty();
        assertThat(r.sourceKey()).isEqualTo("N-7");
        assertThat(r.parsed()).containsEntry("firId", OLD.id().toString()).containsEntry("kind", "CrPC_91").containsEntry("status", "complete")
                .containsEntry("itemsRequested", List.of("Account statement", "KYC form")).containsEntry("replyDueOn", "2024-03-20")
                .containsEntry("signedBy", SIGNER.toString()).containsEntry("issuedAt", "2024-03-10T05:30:00Z")
                .containsEntry("key", "CrPC_91|Fictional Bank Ltd|2024-03-10");
    }

    @Test
    void kindsAreReadInTheUsualSpellingsAndNeverConvertedBetweenCodes() {
        assertThat(check("kind", "Cr.P.C. 41-A", "items_requested", "").parsed()).containsEntry("kind", "CrPC_41A");
        assertThat(check("kind", "160").parsed()).containsEntry("kind", "CrPC_160");
        assertThat(check("fir_no", "14", "kind", "BNSS 35(3)", "issued_on", "02/07/2024").parsed()).containsEntry("kind", "BNSS_35_3");
        assertThat(check("fir_no", "14", "kind", "bnss_179", "issued_on", "02/07/2024").parsed()).containsEntry("kind", "BNSS_179");
        assertThat(check("fir_no", "14", "kind", "Follow-up", "issued_on", "02/07/2024").parsed()).containsEntry("kind", "follow_up");
        assertThat(has(check("kind", "Section 999"), "error", "kind")).isTrue();
        assertThat(has(check("kind", ""), "error", "kind")).isTrue();
    }

    @Test
    void theCodeMustFitTheDates() {
        var bnssTooEarly = check("kind", "BNSS 94", "issued_on", "30/06/2024 23:00");
        assertThat(has(bnssTooEarly, "error", "kind")).as("the BNSS was not in force").isTrue();
        assertThat(bnssTooEarly.parsed()).containsEntry("kind", null);
        assertThat(check("kind", "BNSS 94", "issued_on", "01/07/2024 09:00").status()).as("an old FIR may get a BNSS notice from 1 July 2024").isEqualTo("ok");
        assertThat(check("kind", "CrPC 91", "issued_on", "15/08/2024 09:00").status()).as("or keep CrPC notices (BNSS 531)").isEqualTo("ok");
        assertThat(has(check("fir_no", "14", "kind", "CrPC 160", "issued_on", "02/07/2024"), "error", "kind")).as("a new FIR has no CrPC notices").isTrue();
        assertThat(has(check("fir_no", "99", "kind", "CrPC 160"), "error", "fir_no")).isTrue();
    }

    @Test
    void datesAreCheckedButNeverGuessed() {
        assertThat(has(check("issued_on", ""), "error", "issued_on")).isTrue();
        assertThat(has(check("issued_on", "someday"), "error", "issued_on")).isTrue();
        assertThat(has(check("issued_on", "29/10/2026"), "error", "issued_on")).isTrue();
        var dateOnly = check("issued_on", "10/03/2024");
        assertThat(has(dateOnly, "warning", "issued_on")).isTrue();
        assertThat(dateOnly.parsed()).containsEntry("issuedAt", "2024-03-09T18:30:00Z");
        assertThat(has(check("issued_on", "01/03/2024 10:00"), "warning", "issued_on")).as("before the FIR: flagged").isTrue();
        assertThat(has(check("reply_due_on", "01/03/2024"), "error", "reply_due_on")).isTrue();
        assertThat(has(check("reply_due_on", "never"), "error", "reply_due_on")).isTrue();
        assertThat(check("reply_due_on", "10/03/2024").status()).as("due the same day").isEqualTo("ok");
        assertThat(check("issued_on", "", "reply_due_on", "01/01/2024").messages()).noneMatch(m -> m.field().equals("reply_due_on"));
    }

    @Test
    void theStatusDecidesTheDeadlineSoItIsNeverGuessed() {
        assertThat(check("status", "pending").parsed()).containsEntry("status", "sent");
        assertThat(check("status", "Partly replied").parsed()).containsEntry("status", "reply_incomplete");
        assertThat(check("status", "WITHDRAWN").parsed()).containsEntry("status", "cancelled");
        assertThat(has(check("status", "lost"), "error", "status")).isTrue();
        var none = check("status", "", "reply_due_on", "20/03/2024");
        assertThat(none.parsed()).containsEntry("status", "sent");
        assertThat(none.messages()).anyMatch(m -> m.field().equals("status") && m.text().contains("deadline list"));
        assertThat(check("status", "").messages()).anyMatch(m -> m.field().equals("status") && m.text().endsWith("reply."));
    }

    @Test
    void itemsAddresseeSignerAndTextFollowTheOldRecord() {
        assertThat(has(check("items_requested", " ; "), "error", "items_requested")).as("a notice to produce lists its items").isTrue();
        assertThat(check("kind", "CrPC 41A", "items_requested", "").status()).isEqualTo("ok");
        assertThat(has(check("items_requested", String.join(";", java.util.Collections.nCopies(31, "x"))), "error", "items_requested")).isTrue();
        assertThat(check("items_requested", "i".repeat(400)).parsed().get("itemsRequested")).isEqualTo(List.of("i".repeat(300)));
        assertThat(has(check("addressee", ""), "error", "addressee")).isTrue();
        assertThat(has(check("addressee", "a".repeat(301)), "error", "addressee")).isTrue();
        var stranger = check("signed_by", "someone.else");
        assertThat(has(stranger, "warning", "signed_by")).isTrue();
        assertThat(stranger.parsed()).containsEntry("signedBy", null);
        assertThat(has(check("signed_by", ""), "warning", "signed_by")).isTrue();
        var noText = check("body", "");
        assertThat(noText.parsed()).containsEntry("body", ArrestImport.MISSING);
        assertThat(has(noText, "warning", "body")).isTrue();
        assertThat((String) check("body", "b".repeat(20100)).parsed().get("body")).hasSize(20000);
    }
}
