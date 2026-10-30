package in.caseassistant;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Reads one row of an old notice register (notices to produce, to appear, to witnesses) and checks it against the FIR it
 * belongs to. An old notice keeps the law it was issued under (CrPC 91, 41A, 160 are never turned into BNSS 94, 35(3),
 * 179); a BNSS notice cannot be dated before 1 July 2024 and a CrPC one cannot belong to an FIR registered from that day.
 * The status decides whether a reply deadline shows, so it is never guessed: an unknown status is an error.
 */
@Component
class NoticeImport {
    static final LocalDate BNSS_FROM = LocalDate.of(2024, 7, 1);
    static final int MAX_ITEMS = 30;

    /** Accepted spellings of each kind, compared without case, spaces, dots, brackets or dashes. */
    private static final Map<String, String> KINDS = Map.ofEntries(
            Map.entry("bnss94", "BNSS_94"), Map.entry("94", "BNSS_94"),
            Map.entry("bnss353", "BNSS_35_3"), Map.entry("353", "BNSS_35_3"),
            Map.entry("bnss179", "BNSS_179"), Map.entry("179", "BNSS_179"),
            Map.entry("crpc91", "CrPC_91"), Map.entry("91", "CrPC_91"),
            Map.entry("crpc41a", "CrPC_41A"), Map.entry("41a", "CrPC_41A"),
            Map.entry("crpc160", "CrPC_160"), Map.entry("160", "CrPC_160"),
            Map.entry("followup", "follow_up"));

    private static final Map<String, String> STATUSES = Map.ofEntries(
            Map.entry("sent", "sent"), Map.entry("issued", "sent"), Map.entry("pending", "sent"), Map.entry("open", "sent"), Map.entry("awaitingreply", "sent"),
            Map.entry("partlyreplied", "reply_incomplete"), Map.entry("partreply", "reply_incomplete"), Map.entry("replyincomplete", "reply_incomplete"), Map.entry("incomplete", "reply_incomplete"),
            Map.entry("replied", "complete"), Map.entry("complete", "complete"), Map.entry("completed", "complete"), Map.entry("closed", "complete"), Map.entry("received", "complete"),
            Map.entry("cancelled", "cancelled"), Map.entry("canceled", "cancelled"), Map.entry("withdrawn", "cancelled"));

    static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[\\s.()_\\-]+", "");
    }

    /**
     * @param firs the FIRs of the station with this number (see {@link ArrestImport#firOf})
     * @param signer the id of an active officer of the station by username, or null
     */
    FirImport.Result check(Map<String, String> v, BiFunction<Integer, Integer, List<ArrestImport.Fir>> firs, Function<String, UUID> signer, Instant now) {
        var msgs = new ArrayList<FirImport.Message>();
        var p = new LinkedHashMap<String, Object>();
        Function<String, String> get = k -> v.getOrDefault(k, "").trim();
        ArrestImport.Fir fir = ArrestImport.firOf(get, firs, msgs);

        String kind = KINDS.get(norm(get.apply("kind")));
        if (get.apply("kind").isEmpty()) msgs.add(new FirImport.Message("error", "kind", "The kind of notice is missing (for example BNSS 94 or CrPC 41A)."));
        else if (kind == null) msgs.add(new FirImport.Message("error", "kind",
                "Unknown kind of notice; use BNSS 94, BNSS 35(3), BNSS 179, CrPC 91, CrPC 41A, CrPC 160 or follow-up."));

        String addressee = get.apply("addressee");
        if (addressee.isEmpty()) msgs.add(new FirImport.Message("error", "addressee", "The addressee is missing."));
        else if (addressee.length() > 300) {
            msgs.add(new FirImport.Message("error", "addressee", "The addressee is longer than 300 characters."));
            addressee = "";
        }

        Instant at = null;
        boolean[] dateOnly = new boolean[1];
        if (get.apply("issued_on").isEmpty()) msgs.add(new FirImport.Message("error", "issued_on", "The date of issue is missing."));
        else {
            at = FirImport.when(get.apply("issued_on"), dateOnly);
            if (at == null) msgs.add(new FirImport.Message("error", "issued_on", "The date of issue cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
            else if (at.isAfter(now)) {
                msgs.add(new FirImport.Message("error", "issued_on", "The date of issue is in the future."));
                at = null;
            } else if (dateOnly[0]) msgs.add(new FirImport.Message("warning", "issued_on", "No time given; stored as 00:00 IST of that day."));
        }
        LocalDate day = at == null ? null : at.atZone(FirImport.IST).toLocalDate();
        if (day != null && fir != null && day.isBefore(fir.registeredAt().atZone(FirImport.IST).toLocalDate()))
            msgs.add(new FirImport.Message("warning", "issued_on", "The notice is dated before the FIR; check the date."));
        if (kind != null && kind.startsWith("BNSS") && day != null && day.isBefore(BNSS_FROM)) {
            msgs.add(new FirImport.Message("error", "kind", "A BNSS notice cannot be dated before 1 July 2024, when the BNSS came into force; was it a CrPC notice?"));
            kind = null;
        }
        if (kind != null && kind.startsWith("CrPC") && fir != null && !fir.registeredAt().atZone(FirImport.IST).toLocalDate().isBefore(BNSS_FROM)) {
            msgs.add(new FirImport.Message("error", "kind", "This FIR was registered from 1 July 2024, so its notices are under the BNSS, not the CrPC."));
            kind = null;
        }

        var items = Arrays.stream(get.apply("items_requested").split(";")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (items.size() > MAX_ITEMS) {
            msgs.add(new FirImport.Message("error", "items_requested", "More than " + MAX_ITEMS + " items; split the notice."));
            items = List.of();
        } else if (items.isEmpty() && ("BNSS_94".equals(kind) || "CrPC_91".equals(kind)))
            msgs.add(new FirImport.Message("error", "items_requested", "A notice to produce must list what it asked for, separated by ';'."));
        items = items.stream().map(i -> i.length() > 300 ? i.substring(0, 300) : i).toList();

        LocalDate due = null;
        if (!get.apply("reply_due_on").isEmpty()) {
            Instant d = FirImport.when(get.apply("reply_due_on"), new boolean[1]);
            if (d == null) msgs.add(new FirImport.Message("error", "reply_due_on", "The reply date cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
            else if (day != null && d.atZone(FirImport.IST).toLocalDate().isBefore(day))
                msgs.add(new FirImport.Message("error", "reply_due_on", "The reply is due before the notice was issued."));
            else due = d.atZone(FirImport.IST).toLocalDate();
        }

        String status = STATUSES.get(norm(get.apply("status")));
        if (get.apply("status").isEmpty()) {
            status = "sent";
            msgs.add(new FirImport.Message("warning", "status", "No status; stored as sent and waiting for a reply"
                    + (due == null ? "." : ", so the reply date shows on the deadline list until a reply is recorded.")));
        } else if (status == null) msgs.add(new FirImport.Message("error", "status",
                "Unknown status; use sent, partly replied, replied or cancelled. It decides whether a reply is still awaited, so it is not guessed."));

        UUID by = null;
        String u = get.apply("signed_by");
        if (!u.isEmpty()) {
            by = signer.apply(u);
            if (by == null) msgs.add(new FirImport.Message("warning", "signed_by", "No active officer '" + u + "' at this police station; the signer is left empty."));
        } else msgs.add(new FirImport.Message("warning", "signed_by", "The signing officer is missing; left empty."));

        String body = get.apply("body");
        if (body.isEmpty()) {
            body = ArrestImport.MISSING;
            msgs.add(new FirImport.Message("warning", "body", "The text of the notice is missing; marked as not in the old record."));
        } else if (body.length() > 20000) body = body.substring(0, 20000);

        p.put("firId", fir == null ? null : fir.id().toString());
        p.put("kind", kind);
        p.put("addressee", addressee);
        p.put("issuedAt", at == null ? null : at.toString());
        p.put("itemsRequested", items);
        p.put("replyDueOn", due == null ? null : due.toString());
        p.put("status", status);
        p.put("signedBy", by == null ? null : by.toString());
        p.put("body", body);
        p.put("key", kind + "|" + addressee + "|" + day);
        String sk = get.apply("source_key").isEmpty() ? null : get.apply("source_key");
        p.put("sourceKey", sk);

        boolean error = msgs.stream().anyMatch(m -> m.level().equals("error"));
        boolean warning = msgs.stream().anyMatch(m -> m.level().equals("warning"));
        return new FirImport.Result(error ? "error" : warning ? "warning" : "ok", msgs, p, sk);
    }
}
