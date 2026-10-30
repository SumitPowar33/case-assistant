package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * Kinds of information taken at the front desk, each with its golden-hour steps (packs/{module}/complaint-kinds.json).
 * Data, not code: a state module may add kinds, never change a national one. Checked at start-up; a bad file stops the app.
 */
@Component
class ComplaintKinds {
    record Step(String id, String text, Integer withinMinutes, String basis) {}

    record Kind(String id, String label, String module, List<Step> steps) {}

    private final Map<String, Kind> kinds = new LinkedHashMap<>();

    ComplaintKinds(ObjectMapper json) throws IOException {
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/complaint-kinds.json"))
            try (InputStream in = res.getInputStream()) {
                add(json.readTree(in));
            }
        if (!kinds.containsKey("other")) throw new IllegalStateException("complaint kinds: the kind 'other' is missing");
    }

    void add(JsonNode file) {
        String module = file.path("module").asText();
        file.path("kinds").fields().forEachRemaining(e -> {
            String id = e.getKey();
            if (!id.matches("[a-z][a-z_]{1,59}")) throw new IllegalStateException("complaint kind id " + id + " is not [a-z_]");
            if (kinds.containsKey(id)) throw new IllegalStateException("complaint kind " + id + " is declared twice (a module may only add kinds)");
            String label = e.getValue().path("label").asText("");
            if (label.isBlank()) throw new IllegalStateException("complaint kind " + id + " has no label");
            var steps = new ArrayList<Step>();
            var seen = new HashSet<String>();
            for (JsonNode s : e.getValue().path("steps")) {
                String sid = s.path("id").asText("");
                if (!sid.matches("[a-z][a-z0-9_]{1,59}") || !seen.add(sid)) throw new IllegalStateException("complaint kind " + id + ": bad or repeated step id " + sid);
                if (s.path("text").asText("").isBlank()) throw new IllegalStateException("complaint kind " + id + ": step " + sid + " has no text");
                JsonNode w = s.path("within_minutes");
                if (!w.isMissingNode() && !(w.isInt() && w.asInt() >= 0)) throw new IllegalStateException("complaint kind " + id + ": step " + sid + " within_minutes must be 0 or more");
                steps.add(new Step(sid, s.get("text").asText(), w.isMissingNode() ? null : w.asInt(), s.path("basis").asText(null)));
            }
            kinds.put(id, new Kind(id, label, module, List.copyOf(steps)));
        });
    }

    Kind get(String id) {
        return kinds.get(id);
    }

    List<Kind> all() {
        return List.copyOf(kinds.values());
    }
}
