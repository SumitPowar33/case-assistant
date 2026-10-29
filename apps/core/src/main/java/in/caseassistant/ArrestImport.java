package in.caseassistant;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Reads one row of an old arrests list and checks it against the FIR it belongs to. An arrest is attached to an accused who
 * is already in the FIR (load the FIRs first); nothing else is created. Like {@link FirImport} it never invents a fact:
 * what the old record does not say is marked as missing or left empty, and a class of punishment that is not given is
 * taken from the FIR's sections only with a warning, because it decides the 60 or 90 days of BNSS 187(3).
 */
@Component
class ArrestImport {
    static final String MISSING = "Not in the old record";
    private static final List<String> CLASSES = Punishments.BY_SEVERITY;

    /** An accused already in a FIR (label A1, A2 ...). */
    record Accused(UUID id, String label, String name) {}

    record Fir(UUID id, Instant registeredAt, boolean concluded, List<Map<String, Object>> sections, List<Accused> accused) {}

    private final Punishments punishments;

    ArrestImport(Punishments punishments) {
        this.punishments = punishments;
    }

    /**
     * @param firs the FIRs of the station with this number: for a given year the one of that year (or none), otherwise every year
     * @param officer the id of an active officer of the station by username, or null
     */
    FirImport.Result check(Map<String, String> v, BiFunction<Integer, Integer, List<Fir>> firs, Function<String, UUID> officer, Instant now) {
        var msgs = new ArrayList<FirImport.Message>();
        var p = new LinkedHashMap<String, Object>();
        Function<String, String> get = k -> v.getOrDefault(k, "").trim();
        boolean[] dateOnly = new boolean[1];

        Integer no = get.apply("fir_no").matches("\\d{1,9}") && Integer.parseInt(get.apply("fir_no")) > 0 ? Integer.parseInt(get.apply("fir_no")) : null;
        if (no == null) msgs.add(new FirImport.Message("error", "fir_no", "The FIR number must be a whole number above zero."));
        Integer year = null;
        String y = get.apply("fir_year");
        if (!y.isEmpty() && !y.matches("20\\d\\d|2100")) msgs.add(new FirImport.Message("error", "fir_year", "The FIR year must be between 2000 and 2100."));
        else if (!y.isEmpty()) year = Integer.parseInt(y);

        Fir fir = null;
        if (no != null && (y.isEmpty() || year != null)) {
            var found = firs.apply(year, no);
            if (found.isEmpty()) msgs.add(new FirImport.Message("error", "fir_no", "No FIR with this number" + (year == null ? "" : " and year")
                    + " at this police station. Load the FIR file first."));
            else if (found.size() > 1) msgs.add(new FirImport.Message("error", "fir_year", "This FIR number exists in several years; add the FIR year."));
            else fir = found.get(0);
        }

        Accused who = null;
        if (get.apply("accused_name").isEmpty()) msgs.add(new FirImport.Message("error", "accused_name", "The name of the accused is missing."));
        else if (fir != null) {
            var named = new ArrayList<>(fir.accused().stream().filter(a -> FirImport.sameName(a.name()).equals(FirImport.sameName(get.apply("accused_name")))).toList());
            if (!get.apply("accused_label").isEmpty()) named.removeIf(a -> !a.label().equalsIgnoreCase(get.apply("accused_label")));
            if (named.isEmpty()) msgs.add(new FirImport.Message("error", "accused_name",
                    "No accused of this name in the FIR. Fix the spelling, or add the accused to the FIR first; nobody is added from this file."));
            else if (named.size() > 1) msgs.add(new FirImport.Message("error", "accused_label", "Several accused of this FIR have this name; add the accused label (for example A2)."));
            else who = named.get(0);
        }

        Instant at = null;
        if (get.apply("arrested_at").isEmpty()) msgs.add(new FirImport.Message("error", "arrested_at", "The date of arrest is missing."));
        else if ((at = FirImport.when(get.apply("arrested_at"), dateOnly)) == null)
            msgs.add(new FirImport.Message("error", "arrested_at", "The date of arrest cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
        else if (at.isAfter(now)) {
            msgs.add(new FirImport.Message("error", "arrested_at", "The date of arrest is in the future."));
            at = null;
        } else if (fir != null && at.atZone(FirImport.IST).toLocalDate().isBefore(fir.registeredAt().atZone(FirImport.IST).toLocalDate())) {
            msgs.add(new FirImport.Message("error", "arrested_at", "The arrest is dated before the FIR was registered."));
            at = null;
        } else if (dateOnly[0]) msgs.add(new FirImport.Message("warning", "arrested_at", "Only a date was given; the time is taken as 00:00."));
        LocalDate arrestDay = at == null ? null : at.atZone(FirImport.IST).toLocalDate();

        LocalDate remand = day(get.apply("first_remand_on"), "first_remand_on", "first remand", arrestDay, now, msgs);
        if (remand != null && arrestDay != null && remand.isAfter(arrestDay.plusDays(1)))
            msgs.add(new FirImport.Message("warning", "first_remand_on", "The first remand is more than a day after the arrest; check both dates."));
        LocalDate released = day(get.apply("released_on"), "released_on", "release", arrestDay, now, msgs);
        String basis = null;
        if (released != null) {
            basis = get.apply("release_basis").toLowerCase(Locale.ROOT).replaceAll("[\\s\\-]+", "_");
            if (basis.matches("default_bail|statutory_bail|default")) basis = "default_bail";
            else if (!basis.equals("bail") && !basis.equals("other")) {
                msgs.add(new FirImport.Message("warning", "release_basis", basis.isEmpty()
                        ? "The basis of the release is not given; recorded as 'other'." : "The basis of the release is not recognised; recorded as 'other'."));
                basis = "other";
            }
        }
        boolean concluded = fir != null && fir.concluded();
        if (!concluded && released == null && remand != null)
            msgs.add(new FirImport.Message("warning", "released_on", "No release date: the accused is shown as still in custody and the 60/90 days are running. Add the release if it was missed."));
        if (!concluded && remand == null && released == null)
            msgs.add(new FirImport.Message("warning", "first_remand_on", "No first remand date: the 60/90-day clock cannot start until it is recorded in the case."));

        String cls = get.apply("max_punishment").toLowerCase(Locale.ROOT).replaceAll("[\\s\\-]+", "_");
        if (cls.equals("life_imprisonment")) cls = "life";
        if (cls.isEmpty() && fir != null) {
            cls = punishments.hint(fir.sections()).get("suggested") instanceof String s ? s : "";
            if (!cls.isEmpty()) msgs.add(new FirImport.Message("warning", "max_punishment", "Not in the file; taken as '" + cls
                    + "' from the sections of the FIR (draft table). It sets 60 or 90 days, so check it."));
            else msgs.add(new FirImport.Message("error", "max_punishment", "The class of the highest punishment is not in the file and cannot be worked out from the sections of the FIR; add the column."));
        } else if (!cls.isEmpty() && !CLASSES.contains(cls)) {
            msgs.add(new FirImport.Message("error", "max_punishment", "The class of punishment must be death, life, 10_years_or_more or less_than_10_years."));
            cls = "";
        }

        String place = text(get.apply("place"), "place", "The place of arrest", msgs);
        var grounds = new ArrayList<String>();
        for (String g : get.apply("grounds").split(";")) if (!g.isBlank()) grounds.add(g.trim().length() > 500 ? g.trim().substring(0, 500) : g.trim());
        if (grounds.isEmpty()) {
            grounds.add(MISSING);
            msgs.add(new FirImport.Message("warning", "grounds", "The grounds of arrest are missing; marked as not in the old record."));
        }
        String informed = text(get.apply("informed_name"), "informed_name", "The person informed of the arrest", msgs);

        UUID officerId = null;
        if (get.apply("arresting_officer").isEmpty()) msgs.add(new FirImport.Message("warning", "arresting_officer", "The arresting officer is not in the file; left empty."));
        else if ((officerId = officer.apply(get.apply("arresting_officer").toLowerCase(Locale.ROOT))) == null)
            msgs.add(new FirImport.Message("warning", "arresting_officer", "No active officer of this station has this username; the arresting officer is left empty."));

        p.put("firId", fir == null ? null : fir.id().toString());
        p.put("personId", who == null ? null : who.id().toString());
        p.put("arrestedAt", at == null ? null : at.toString());
        p.put("place", place);
        p.put("grounds", grounds);
        p.put("informedName", informed);
        p.put("informedContact", get.apply("informed_contact").isEmpty() ? null : get.apply("informed_contact"));
        p.put("officerId", officerId == null ? null : officerId.toString());
        p.put("firstRemandOn", remand == null ? null : remand.toString());
        p.put("maxPunishment", cls);
        p.put("releasedOn", released == null ? null : released.toString());
        p.put("releaseBasis", basis);
        String key = get.apply("source_key").isEmpty() ? null : get.apply("source_key");
        p.put("sourceKey", key);

        boolean error = msgs.stream().anyMatch(m -> m.level().equals("error"));
        boolean warning = msgs.stream().anyMatch(m -> m.level().equals("warning"));
        return new FirImport.Result(error ? "error" : warning ? "warning" : "ok", msgs, p, key);
    }

    /** The day an accused was already arrested on, for the duplicate check: accused id + "|" + IST day. */
    static String arrestKey(Object personId, Object arrestedAt) {
        return personId + "|" + Instant.parse((String) arrestedAt).atZone(FirImport.IST).toLocalDate();
    }

    private static String text(String s, String field, String what, List<FirImport.Message> msgs) {
        if (s.isEmpty()) {
            msgs.add(new FirImport.Message("warning", field, what + " is missing; marked as not in the old record."));
            return MISSING;
        }
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    /** A day that may not be before the arrest or in the future; null when empty or unreadable (with an error then). */
    private static LocalDate day(String s, String field, String what, LocalDate arrestDay, Instant now, List<FirImport.Message> msgs) {
        if (s.isEmpty()) return null;
        Instant t = FirImport.when(s, new boolean[1]);
        if (t == null) {
            msgs.add(new FirImport.Message("error", field, "The date of the " + what + " cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
            return null;
        }
        LocalDate d = t.atZone(FirImport.IST).toLocalDate();
        if (d.isAfter(now.atZone(FirImport.IST).toLocalDate())) msgs.add(new FirImport.Message("error", field, "The date of the " + what + " is in the future."));
        else if (arrestDay != null && d.isBefore(arrestDay)) msgs.add(new FirImport.Message("error", field, "The " + what + " is dated before the day of arrest."));
        else return d;
        return null;
    }
}
