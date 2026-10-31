package in.caseassistant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * Highest punishment of each section, from packs/{module}/punishments.json. It only suggests the 60 or 90 day
 * custody limit (BNSS 187(3)); the officer decides. A draft table must be checked by a prosecutor.
 * The national table (IN) holds for every state. A state module may only add sections the national table does not
 * name, and its additions hold only for FIRs of its own state: it can never give a national section another class
 * or take it out of the table (refused at start-up).
 */
@Component
class Punishments {
    static final List<String> BY_SEVERITY = List.of("less_than_10_years", "10_years_or_more", "life", "death");
    private static final Pattern MODULE = Pattern.compile(".*/packs/([^/]+)/punishments\\.json$");

    record Table(Map<String, String> sections, @JsonProperty("no_penalty_of_their_own") List<String> noPenaltyOfTheirOwn) {}

    private static final String NO_PENALTY = "";   // marks a section with no penalty of its own (e.g. BNS 3(5))
    private final Map<String, String> national = new HashMap<>();
    private final Map<String, Map<String, String>> byState = new HashMap<>();

    @Autowired
    Punishments(ObjectMapper json) throws IOException {
        this(read(json));
    }

    private static Map<String, Table> read(ObjectMapper json) throws IOException {
        var tables = new HashMap<String, Table>();
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/punishments.json")) {
            var m = MODULE.matcher(res.getURL().toString());
            if (!m.matches()) throw new IllegalStateException("punishment table outside a module folder: " + res);
            try (InputStream in = res.getInputStream()) {
                tables.put(m.group(1), json.readValue(in, Table.class));
            }
        }
        return tables;
    }

    Punishments(Map<String, Table> tables) {
        if (tables.containsKey("IN")) entries("IN", tables.get("IN")).forEach(national::put);
        tables.forEach((module, t) -> {
            if (module.equals("IN")) return;
            var own = byState.computeIfAbsent(module, k -> new HashMap<>());
            entries(module, t).forEach((key, c) -> {
                if (national.containsKey(key))
                    throw new IllegalStateException(module + ": " + key + " is in the national punishment table; a state module cannot change it");
                own.put(key, c);
            });
        });
    }

    private static Map<String, String> entries(String module, Table t) {
        var out = new HashMap<String, String>();
        if (t.sections() != null) t.sections().forEach((key, c) -> {
            if (!BY_SEVERITY.contains(c)) throw new IllegalStateException(module + ": unknown punishment class " + c + " for " + key);
            out.put(key, c);
        });
        if (t.noPenaltyOfTheirOwn() != null) for (String key : t.noPenaltyOfTheirOwn())
            if (out.putIfAbsent(key, NO_PENALTY) != null)
                throw new IllegalStateException(module + ": " + key + " has a class and is also listed without a penalty of its own");
        return out;
    }

    /** {suggested: the heaviest class, or null if any section is not in the table, sections: [...], unknown: [...]}, by the tables of this state. */
    Map<String, Object> hint(String state, List<Map<String, Object>> firSections) {
        var own = byState.getOrDefault(state, Map.of());
        var known = new java.util.ArrayList<Map<String, String>>();
        var unknown = new java.util.ArrayList<String>();
        String top = null;
        for (var s : firSections) {
            String key = s.get("act") + " " + s.get("section");
            String c = national.containsKey(key) ? national.get(key) : own.get(key);
            if (NO_PENALTY.equals(c)) continue;
            if (c == null) {
                unknown.add(key);
                continue;
            }
            known.add(Map.of("section", key, "class", c));
            if (top == null || BY_SEVERITY.indexOf(c) > BY_SEVERITY.indexOf(top)) top = c;
        }
        var out = new java.util.LinkedHashMap<String, Object>();
        out.put("suggested", unknown.isEmpty() ? top : null);
        out.put("sections", known);
        out.put("unknown", unknown);
        return out;
    }
}
