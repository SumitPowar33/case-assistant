package in.caseassistant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * Highest punishment of each section, from packs/{state}/punishments.json. It only suggests the 60 or 90 day
 * custody limit (BNSS 187(3)); the officer decides. A draft table must be checked by a prosecutor.
 */
@Component
class Punishments {
    static final List<String> BY_SEVERITY = List.of("less_than_10_years", "10_years_or_more", "life", "death");

    record Table(Map<String, String> sections, @JsonProperty("no_penalty_of_their_own") List<String> noPenaltyOfTheirOwn) {}

    private final Map<String, String> classes = new HashMap<>();
    private final Set<String> noPenalty = new HashSet<>();

    Punishments(ObjectMapper json) throws IOException {
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/punishments.json")) {
            try (InputStream in = res.getInputStream()) {
                var t = json.readValue(in, Table.class);
                classes.putAll(t.sections());
                if (t.noPenaltyOfTheirOwn() != null) noPenalty.addAll(t.noPenaltyOfTheirOwn());
            }
        }
    }

    /** {suggested: the heaviest class, or null if any section is not in the table, sections: [...], unknown: [...]}. */
    Map<String, Object> hint(List<Map<String, Object>> firSections) {
        var known = new java.util.ArrayList<Map<String, String>>();
        var unknown = new java.util.ArrayList<String>();
        String top = null;
        for (var s : firSections) {
            String key = s.get("act") + " " + s.get("section");
            if (noPenalty.contains(key)) continue;
            String c = classes.get(key);
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
