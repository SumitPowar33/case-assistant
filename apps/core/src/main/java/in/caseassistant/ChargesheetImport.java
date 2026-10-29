package in.caseassistant;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Reads one row of an old chargesheet list and checks it against the FIR it belongs to. The accused it names must already
 * be in the FIR; nobody is created. Like the other import checks it never invents a fact: a missing court is marked as
 * missing, and a missing report number, filing date or accused list is an error.
 */
@Component
class ChargesheetImport {
    static final int MAX_NAMES = 30;

    /** The key of a chargesheet for the repeat check: FIR id + "|" + report number without case or spaces. */
    static String key(Object firId, Object reportNo) {
        return firId + "|" + ((String) reportNo).toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    FirImport.Result check(Map<String, String> v, BiFunction<Integer, Integer, List<ArrestImport.Fir>> firs, Instant now) {
        var msgs = new ArrayList<FirImport.Message>();
        var p = new LinkedHashMap<String, Object>();
        Function<String, String> get = k -> v.getOrDefault(k, "").trim();

        Integer no = get.apply("fir_no").matches("\\d{1,9}") && Integer.parseInt(get.apply("fir_no")) > 0 ? Integer.parseInt(get.apply("fir_no")) : null;
        if (no == null) msgs.add(new FirImport.Message("error", "fir_no", "The FIR number must be a whole number above zero."));
        Integer year = null;
        String y = get.apply("fir_year");
        if (!y.isEmpty() && !y.matches("20\\d\\d|2100")) msgs.add(new FirImport.Message("error", "fir_year", "The FIR year must be between 2000 and 2100."));
        else if (!y.isEmpty()) year = Integer.parseInt(y);

        ArrestImport.Fir fir = null;
        if (no != null && (y.isEmpty() || year != null)) {
            var found = firs.apply(year, no);
            if (found.isEmpty()) msgs.add(new FirImport.Message("error", "fir_no", "No FIR with this number" + (year == null ? "" : " and year")
                    + " at this police station. Load the FIR file first."));
            else if (found.size() > 1) msgs.add(new FirImport.Message("error", "fir_year", "This FIR number exists in several years; add the FIR year."));
            else fir = found.get(0);
        }

        String report = get.apply("report_no");
        if (report.isEmpty()) msgs.add(new FirImport.Message("error", "report_no", "The chargesheet (report) number is missing."));
        else if (report.length() > 60) {
            msgs.add(new FirImport.Message("error", "report_no", "The chargesheet number is longer than 60 characters."));
            report = "";
        }

        LocalDate filed = null;
        if (get.apply("filed_on").isEmpty()) msgs.add(new FirImport.Message("error", "filed_on", "The filing date is missing."));
        else {
            Instant t = FirImport.when(get.apply("filed_on"), new boolean[1]);
            if (t == null) msgs.add(new FirImport.Message("error", "filed_on", "The filing date cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
            else {
                filed = t.atZone(FirImport.IST).toLocalDate();
                if (filed.isAfter(now.atZone(FirImport.IST).toLocalDate())) {
                    msgs.add(new FirImport.Message("error", "filed_on", "The filing date is in the future."));
                    filed = null;
                } else if (fir != null && filed.isBefore(fir.registeredAt().atZone(FirImport.IST).toLocalDate())) {
                    msgs.add(new FirImport.Message("error", "filed_on", "The chargesheet is dated before the FIR was registered."));
                    filed = null;
                }
            }
        }

        String court = get.apply("court");
        if (court.isEmpty()) {
            court = ArrestImport.MISSING;
            msgs.add(new FirImport.Message("warning", "court", "The court is missing; marked as not in the old record."));
        } else if (court.length() > 200) court = court.substring(0, 200);

        var named = new LinkedHashSet<UUID>();
        if (get.apply("accused_names").isEmpty()) msgs.add(new FirImport.Message("error", "accused_names", "The accused named in the chargesheet are missing."));
        else if (fir != null) {
            String[] names = get.apply("accused_names").split(";");
            if (names.length > MAX_NAMES) msgs.add(new FirImport.Message("error", "accused_names", "More than " + MAX_NAMES + " names; split the chargesheet."));
            else for (String raw : names) {
                if (raw.isBlank()) continue;
                String n = FirImport.sameName(raw);
                var hit = fir.accused().stream().filter(a -> FirImport.sameName(a.name()).equals(n)).toList();
                if (hit.isEmpty()) hit = fir.accused().stream().filter(a -> a.label().equalsIgnoreCase(raw.trim())).toList();   // "A2" names the accused by label
                if (hit.isEmpty()) msgs.add(new FirImport.Message("error", "accused_names", "'" + raw.trim()
                        + "' is not an accused of the FIR. Fix the spelling, or add the accused to the FIR first; nobody is added from this file."));
                else if (hit.size() > 1) msgs.add(new FirImport.Message("error", "accused_names", "Several accused of this FIR are called '" + raw.trim() + "'; use their labels (for example A2)."));
                else named.add(hit.get(0).id());
            }
            if (!named.isEmpty() && named.size() < fir.accused().size())
                msgs.add(new FirImport.Message("info", "accused_names", (fir.accused().size() - named.size())
                        + " accused of the FIR are not named; their custody limit is not ended by this chargesheet."));
        }

        p.put("firId", fir == null ? null : fir.id().toString());
        p.put("reportNo", report);
        p.put("filedOn", filed == null ? null : filed.toString());
        p.put("court", court);
        p.put("accusedIds", named.stream().map(UUID::toString).toList());
        String sk = get.apply("source_key").isEmpty() ? null : get.apply("source_key");
        p.put("sourceKey", sk);

        boolean error = msgs.stream().anyMatch(m -> m.level().equals("error"));
        boolean warning = msgs.stream().anyMatch(m -> m.level().equals("warning"));
        return new FirImport.Result(error ? "error" : warning ? "warning" : "ok", msgs, p, sk);
    }
}
