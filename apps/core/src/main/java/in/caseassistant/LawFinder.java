package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The old law to new law finder (packs/{module}/law-concordance.json): IPC, CrPC and Evidence Act sections beside the BNS,
 * BNSS and BSA sections that took their place. Data, not AI. A table to look things up in, never a converter: nothing in the
 * app changes a section by it, and the file says it is a draft until a prosecutor has checked it. Any signed-in officer may read it.
 */
@RestController
@RequestMapping("/api")
class LawFinder {
    record Entry(String law, String newLaw, String from, String to, String what, boolean partial) {}

    record Answer(String status, String note, List<Entry> entries) {}

    private static final Map<String, String> NEW_LAW = Map.of("IPC", "BNS", "CrPC", "BNSS", "IEA", "BSA");

    private final List<Entry> entries = new ArrayList<>();
    private String status = "reviewed";
    private String note = "";

    @org.springframework.beans.factory.annotation.Autowired
    LawFinder(ObjectMapper json) throws IOException {
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/law-concordance.json"))
            try (InputStream in = res.getInputStream()) {
                add(json.readTree(in));
            }
    }

    LawFinder() {}

    void add(JsonNode file) {
        if (!file.path("status").asText().equals("reviewed")) status = "draft";
        note = file.path("note").asText(note);
        for (JsonNode e : file.path("sections")) {
            String law = e.path("law").asText(), from = e.path("old").asText("");
            if (!NEW_LAW.containsKey(law)) throw new IllegalStateException("law table: " + law + " is not one of " + NEW_LAW.keySet());
            if (!from.matches("\\d+[A-Z]?(\\(\\d+\\))?") || e.path("what").asText("").isBlank())
                throw new IllegalStateException("law table: " + law + " " + from + " needs a section number and a description");
            String to = e.path("new").isNull() ? null : e.path("new").asText("");
            if (to != null && !to.matches("\\d+[A-Z]?(\\(\\d+\\))?")) throw new IllegalStateException("law table: " + law + " " + from + " has a bad new section");
            if (entries.stream().anyMatch(x -> x.law().equals(law) && x.from().equals(from)))
                throw new IllegalStateException("law table: " + law + " " + from + " is listed twice");
            entries.add(new Entry(law, NEW_LAW.get(law), from, to, e.get("what").asText(), e.path("partial").asBoolean(false)));
        }
    }

    @GetMapping("/law-finder")
    Answer all() {
        return new Answer(status, note, List.copyOf(entries));
    }
}
