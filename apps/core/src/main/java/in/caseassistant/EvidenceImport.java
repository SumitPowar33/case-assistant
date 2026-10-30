package in.caseassistant;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Reads one row of an old evidence (seizure) register and checks it against the FIR it belongs to. Like the other import
 * checks it never invents a fact: a missing description or seizure memo is marked as missing; a missing label, kind or
 * seizure date is an error, and so is an electronic item without its SHA-256 (the hash cannot be made up afterwards).
 */
@Component
class EvidenceImport {
    static final int MAX_LABEL = 60;

    FirImport.Result check(Map<String, String> v, BiFunction<Integer, Integer, List<ArrestImport.Fir>> firs, Instant now) {
        var msgs = new ArrayList<FirImport.Message>();
        var p = new LinkedHashMap<String, Object>();
        Function<String, String> get = k -> v.getOrDefault(k, "").trim();
        ArrestImport.Fir fir = ArrestImport.firOf(get, firs, msgs);

        String label = get.apply("label");
        if (label.isEmpty()) msgs.add(new FirImport.Message("error", "label", "The item label (for example 214/E-03) is missing."));
        else if (label.length() > MAX_LABEL) msgs.add(new FirImport.Message("error", "label", "The item label is longer than " + MAX_LABEL + " characters."));

        String kind = get.apply("kind").toLowerCase(Locale.ROOT);
        if (kind.isEmpty()) msgs.add(new FirImport.Message("error", "kind", "The kind of item is missing: physical, electronic or document."));
        else if (!kind.matches("physical|electronic|document")) {
            msgs.add(new FirImport.Message("error", "kind", "The kind must be physical, electronic or document."));
            kind = "";
        }

        String sha = get.apply("sha256").toLowerCase(Locale.ROOT);
        if (!sha.isEmpty() && !sha.matches("[0-9a-f]{64}")) {
            msgs.add(new FirImport.Message("error", "sha256", "The SHA-256 must be 64 hexadecimal characters."));
            sha = "";
        } else if (sha.isEmpty() && kind.equals("electronic"))
            msgs.add(new FirImport.Message("error", "sha256", "An electronic item needs the SHA-256 taken at seizure; it cannot be added later. Record it by hand with its 63(4) certificate."));

        Instant at = null;
        boolean[] dateOnly = new boolean[1];
        if (get.apply("seized_at").isEmpty()) msgs.add(new FirImport.Message("error", "seized_at", "The date of seizure is missing."));
        else {
            at = FirImport.when(get.apply("seized_at"), dateOnly);
            if (at == null) msgs.add(new FirImport.Message("error", "seized_at", "The date of seizure cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd, with a time if known."));
            else if (at.isAfter(now)) {
                msgs.add(new FirImport.Message("error", "seized_at", "The date of seizure is in the future."));
                at = null;
            } else {
                if (dateOnly[0]) msgs.add(new FirImport.Message("warning", "seized_at", "No time given; stored as 00:00 IST of that day."));
                LocalDate day = at.atZone(FirImport.IST).toLocalDate();
                if (fir != null && day.isBefore(fir.registeredAt().atZone(FirImport.IST).toLocalDate()))
                    msgs.add(new FirImport.Message("warning", "seized_at", "The seizure is dated before the FIR. A recovery can lead to an FIR, but old records often have wrong dates here; check it."));
            }
        }

        String description = missing(get.apply("description"), "description", "The description is missing", 2000, msgs);
        String memo = missing(get.apply("seizure_memo"), "seizure_memo", "The seizure memo (panchnama) reference is missing", 500, msgs);

        p.put("firId", fir == null ? null : fir.id().toString());
        p.put("label", label);
        p.put("kind", kind);
        p.put("description", description);
        p.put("seizedAt", at == null ? null : at.toString());
        p.put("seizureMemo", memo);
        p.put("sealNo", cut(get.apply("seal_no"), 100));
        p.put("esakshyaId", cut(get.apply("esakshya_id"), 100));
        p.put("sha256", sha.isEmpty() ? null : sha);
        String sk = get.apply("source_key").isEmpty() ? null : get.apply("source_key");
        p.put("sourceKey", sk);

        boolean error = msgs.stream().anyMatch(m -> m.level().equals("error"));
        boolean warning = msgs.stream().anyMatch(m -> m.level().equals("warning"));
        return new FirImport.Result(error ? "error" : warning ? "warning" : "ok", msgs, p, sk);
    }

    /** A text the register must have: when the old record has none, it is stored as missing with a warning. */
    private static String missing(String s, String field, String what, int max, List<FirImport.Message> msgs) {
        if (!s.isEmpty()) return cut(s, max);
        msgs.add(new FirImport.Message("warning", field, what + "; marked as not in the old record."));
        return ArrestImport.MISSING;
    }

    private static String cut(String s, int max) {
        return s.isEmpty() ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
