package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * Reads one row of an old FIR list and checks it the way the audits of the old systems found they should be checked
 * (dates in order, no future dates, a real IO, sections that can be read, no repeats). It never invents a fact: what the
 * file does not say stays empty or is marked as missing. The IPC-to-BNS table is a hint only and nothing is converted.
 * It also holds the file layouts (profiles) of every kind of file; the arrests file is checked by {@link ArrestImport}.
 */
@Component
class FirImport {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final Instant BNS_STARTS = Instant.parse("2024-06-30T18:30:00Z");
    static final String NO_GD = "Not in the old record";
    static final String NO_TEXT = "The complaint text was not in the old record.";
    static final int MAX_NAMES = 30;

    record Message(String level, String field, String text) {}

    record Result(String status, List<Message> messages, Map<String, Object> parsed, String sourceKey) {}

    private static final DateTimeFormatter[] DATES = {
            fmt("dd/MM/uuuu[ HH:mm[:ss]]"), fmt("dd-MM-uuuu[ HH:mm[:ss]]"), fmt("uuuu-MM-dd[['T'][ ]HH:mm[:ss]]")};
    private static final Pattern SECTION = Pattern.compile("\\d{1,3}[A-Z]{0,2}(\\([0-9A-Za-z]+\\))*");
    private static final Pattern ACT = Pattern.compile("\\b(IPC|BNS|POCSO|NDPS|IT ACT|ARMS|SC/ST)\\b( ACT)?");
    private static final Map<String, String> ACT_NAMES = Map.of("IPC", "IPC", "BNS", "BNS", "POCSO", "POCSO Act", "NDPS", "NDPS Act",
            "IT ACT", "IT Act", "ARMS", "Arms Act", "SC/ST", "SC/ST Act");

    private final Map<String, JsonNode> profiles = new LinkedHashMap<>();
    private final Map<String, String> ipcToBns = new LinkedHashMap<>();

    FirImport(ObjectMapper json) throws IOException {
        var resolver = new PathMatchingResourcePatternResolver();
        for (var res : resolver.getResources("classpath*:packs/*/import-profiles/*.json"))
            try (InputStream in = res.getInputStream()) {
                String[] path = res.getURL().getPath().split("/");
                addProfile(path[path.length - 3], json.readTree(in));
            }
        for (var res : resolver.getResources("classpath*:packs/*/law-concordance.json"))
            try (InputStream in = res.getInputStream()) {
                json.readTree(in).path("IPC").fields().forEachRemaining(e -> ipcToBns.put(e.getKey(), e.getValue().asText()));
            }
    }

    /** A profile belongs to the module whose folder holds it; a state module's layout is only for that state's stations. */
    void addProfile(String module, JsonNode p) {
        String id = p.path("id").asText();
        if (profiles.containsKey(id)) throw new IllegalStateException("import profile " + id + " is declared twice");
        profiles.put(id, ((com.fasterxml.jackson.databind.node.ObjectNode) p.deepCopy()).put("module", module));
    }

    /** The module of a profile: "IN" (any station) or a state code. */
    String module(String profile) {
        return profiles.get(profile).path("module").asText();
    }

    private static DateTimeFormatter fmt(String p) {
        return DateTimeFormatter.ofPattern(p, Locale.ENGLISH).withResolverStyle(ResolverStyle.STRICT);
    }

    boolean hasProfile(String id) {
        return profiles.containsKey(id);
    }

    /** What a profile loads: "fir", "arrest", "chargesheet" or "evidence". */
    String entity(String profile) {
        return profiles.get(profile).path("entity").asText();
    }

    List<Map<String, Object>> profileList() {
        var out = new ArrayList<Map<String, Object>>();
        profiles.forEach((id, p) -> {
            var fields = new ArrayList<Map<String, Object>>();
            p.path("fields").fields().forEachRemaining(f -> fields.add(Map.of("name", f.getKey(),
                    "required", f.getValue().path("required").asBoolean(false))));
            out.add(Map.of("id", id, "label", p.path("label").asText(id), "entity", p.path("entity").asText(), "module", p.path("module").asText(),
                    "fields", fields));
        });
        return out;
    }

    /** For each field of the profile, the file column whose name matches one of its aliases (case, spaces and dashes ignored). */
    Map<String, String> suggest(String profile, List<String> headers) {
        var out = new LinkedHashMap<String, String>();
        profiles.get(profile).path("fields").fields().forEachRemaining(f -> {
            for (String h : headers)
                for (JsonNode a : f.getValue().path("aliases"))
                    if (norm(h).equals(norm(a.asText())) && !out.containsKey(f.getKey())) out.put(f.getKey(), h);
        });
        return out;
    }

    List<String> requiredFields(String profile) {
        var out = new ArrayList<String>();
        profiles.get(profile).path("fields").fields().forEachRemaining(f -> {
            if (f.getValue().path("required").asBoolean(false)) out.add(f.getKey());
        });
        return out;
    }

    /** A name reduced to what two spellings of it share: case, spaces, dots and commas ignored. Used to warn, never to merge. */
    static String sameName(String name) {
        return name.toLowerCase(Locale.ROOT).replaceAll("[\\s.,]+", " ").trim();
    }

    private static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[\\s_\\-]+", "");
    }

    /** A date or date-time in the Indian calendar: null when it cannot be read. */
    static Instant when(String s, boolean[] dateOnly) {
        for (var f : DATES) {
            try {
                var t = f.parseBest(s.trim(), LocalDateTime::from, LocalDate::from);
                dateOnly[0] = t instanceof LocalDate;
                return (t instanceof LocalDate d ? d.atStartOfDay() : (LocalDateTime) t).atZone(IST).toInstant();
            } catch (DateTimeException ignored) { /* try the next format */ }
        }
        return null;
    }

    Result check(Map<String, String> v, Function<String, UUID> ioByUsername, Instant now) {
        var msgs = new ArrayList<Message>();
        var p = new LinkedHashMap<String, Object>();
        Function<String, String> get = k -> v.getOrDefault(k, "").trim();
        boolean[] dateOnly = new boolean[1];

        Integer no = null;
        if (!get.apply("fir_no").matches("\\d{1,9}") || Integer.parseInt(get.apply("fir_no")) < 1)
            msgs.add(new Message("error", "fir_no", "The FIR number must be a whole number above zero."));
        else no = Integer.parseInt(get.apply("fir_no"));

        Instant reg = null;
        if (get.apply("registered_at").isEmpty()) msgs.add(new Message("error", "registered_at", "The registration date is missing."));
        else if ((reg = when(get.apply("registered_at"), dateOnly)) == null)
            msgs.add(new Message("error", "registered_at", "The registration date cannot be read; use dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd."));
        else if (reg.isAfter(now)) {
            msgs.add(new Message("error", "registered_at", "The registration date is in the future."));
            reg = null;
        } else if (dateOnly[0]) msgs.add(new Message("warning", "registered_at", "Only a date was given; the time is taken as 00:00."));

        Integer year = null;
        String y = get.apply("fir_year");
        if (!y.isEmpty() && !y.matches("20\\d\\d|2100")) msgs.add(new Message("error", "fir_year", "The FIR year must be between 2000 and 2100."));
        else if (!y.isEmpty()) year = Integer.parseInt(y);
        else if (reg != null) year = reg.atZone(IST).getYear();
        if (year != null && (year < 2000 || year > 2100)) {
            msgs.add(new Message("error", "fir_year", "The FIR year must be between 2000 and 2100."));
            year = null;
        } else if (year != null && reg != null && year != reg.atZone(IST).getYear())
            msgs.add(new Message("warning", "fir_year", "The FIR year differs from the year of registration."));

        Instant info = reg;
        if (!get.apply("information_received_at").isEmpty()) {
            info = when(get.apply("information_received_at"), dateOnly);
            if (info == null) msgs.add(new Message("error", "information_received_at", "The date information was received cannot be read."));
            else if (reg != null && info.isAfter(reg))
                msgs.add(new Message("error", "information_received_at", "Information is dated after the FIR was registered."));
        } else if (reg != null) msgs.add(new Message("info", "information_received_at", "Not given; taken as the registration time."));

        String gd = get.apply("gd_entry_no");
        if (gd.isEmpty()) {
            gd = NO_GD;
            msgs.add(new Message("warning", "gd_entry_no", "The General Diary entry is missing; marked as not in the old record."));
        }
        String text = get.apply("complaint_text");
        if (text.isEmpty()) {
            text = NO_TEXT;
            msgs.add(new Message("warning", "complaint_text", "The complaint text is missing; marked as not in the old record."));
        }

        UUID io = null;
        if (!get.apply("io_username").isEmpty()) {
            io = ioByUsername.apply(get.apply("io_username").toLowerCase(Locale.ROOT));
            if (io == null) msgs.add(new Message("warning", "io_username",
                    "No active IO of this station has this username; the FIR is left without an IO."));
        }

        var sections = sections(get.apply("sections"), reg, msgs);
        boolean zero = get.apply("zero_fir").toLowerCase(Locale.ROOT).matches("y|yes|true|1");
        if (zero && get.apply("outside_limits_place").isEmpty())
            msgs.add(new Message("error", "outside_limits_place", "A Zero FIR needs the place outside the station's limits."));

        String st = get.apply("status").toLowerCase(Locale.ROOT);
        boolean concluded = st.matches("concluded|closed|disposed|chargesheeted|charge sheeted|final report|convicted|acquitted|decided");
        if (!st.isEmpty() && !concluded && !st.matches("open|pending|under investigation|ui|registered"))
            msgs.add(new Message("warning", "status", "The status is not recognised; the case is treated as open."));

        p.put("firNo", no);
        p.put("firYear", year);
        p.put("registeredAt", reg == null ? null : reg.toString());
        p.put("informationReceivedAt", info == null ? null : info.toString());
        p.put("gdEntryNo", gd);
        p.put("complaintText", text);
        p.put("sections", sections);
        p.put("ioId", io == null ? null : io.toString());
        p.put("zeroFir", zero);
        p.put("outsideLimitsPlace", get.apply("outside_limits_place").isEmpty() ? null : get.apply("outside_limits_place"));
        p.put("concluded", concluded);
        p.put("complainant", get.apply("complainant_name").isEmpty() ? null : trim(get.apply("complainant_name"), "complainant_name", msgs));
        for (String[] f : new String[][] {{"victims", "victim_names"}, {"accused", "accused_names"}, {"witnesses", "witness_names"}})
            p.put(f[0], names(get.apply(f[1]), f[1], msgs));
        String key = get.apply("source_key").isEmpty() ? null : get.apply("source_key");
        p.put("sourceKey", key);

        boolean error = msgs.stream().anyMatch(m -> m.level.equals("error"));
        boolean warning = msgs.stream().anyMatch(m -> m.level.equals("warning"));
        return new Result(error ? "error" : warning ? "warning" : "ok", msgs, p, key);
    }

    private static String trim(String s, String field, List<Message> msgs) {
        if (s.length() <= 200) return s;
        msgs.add(new Message("warning", field, "A name longer than 200 characters was cut short."));
        return s.substring(0, 200);
    }

    private static List<String> names(String s, String field, List<Message> msgs) {
        var out = new ArrayList<String>();
        for (String n : s.split(";")) if (!n.isBlank()) out.add(trim(n.trim(), field, msgs));
        if (out.size() > MAX_NAMES) {
            msgs.add(new Message("warning", field, "More than " + MAX_NAMES + " names; only the first " + MAX_NAMES + " are kept."));
            return new ArrayList<>(out.subList(0, MAX_NAMES));
        }
        return out;
    }

    /** Ordered, so the same section always serialises (and fingerprints) the same way. */
    private static Map<String, String> section(String act, String section) {
        var m = new LinkedHashMap<String, String>();
        m.put("act", act);
        m.put("section", section);
        return m;
    }

    /** "IPC 420/34; 376(2)(n)" -> [{IPC,420},{IPC,34},{IPC,376(2)(n)}]. A missing act is guessed from the date, with a warning. */
    private List<Map<String, String>> sections(String text, Instant reg, List<Message> msgs) {
        var out = new ArrayList<Map<String, String>>();
        for (String raw : text.split("[;,|]")) {
            String token = raw.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (token.isEmpty()) continue;
            var m = ACT.matcher(token);
            String act = null;
            String rest = token;
            if (m.find()) {
                act = ACT_NAMES.get(m.group(1));
                rest = (token.substring(0, m.start()) + " " + token.substring(m.end())).trim();
            }
            var numbers = new ArrayList<String>();
            for (String n : rest.split("\\s*(/|&|R/W|AND)\\s*")) numbers.add(n.trim());
            boolean readable = numbers.stream().allMatch(n -> SECTION.matcher(n).matches());
            if (!readable) {
                out.add(section("Other", raw.trim().substring(0, Math.min(raw.trim().length(), 60))));
                msgs.add(new Message("warning", "sections", "'" + raw.trim() + "' could not be read as act and section; kept as Other."));
                continue;
            }
            if (act == null) {
                act = reg != null && reg.isBefore(BNS_STARTS) ? "IPC" : "BNS";
                msgs.add(new Message("warning", "sections", "No act named for '" + raw.trim() + "'; taken as " + act
                        + (reg == null ? " (date unknown)." : " from the registration date.")));
            }
            for (String n : numbers) {
                out.add(section(act, n));
                String bns = act.equals("IPC") ? ipcToBns.get(n.replaceAll("\\(.*", "")) : null;
                if (bns != null) msgs.add(new Message("info", "sections", "IPC " + n + " is BNS " + bns
                        + " for offences from 1 July 2024 (draft table, hint only; nothing is converted)."));
            }
        }
        return out;
    }
}
