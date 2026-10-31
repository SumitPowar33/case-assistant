package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The legal glossary of the language tool (packs/{module}/glossary.json): an English term, the law it comes from, a short
 * meaning, and the term in every Indian language of the national module, so screens, drafts and officers use one word.
 * Data, not code: a state module may add terms, never change a national one. Checked at start-up; a bad file stops the app.
 * Draft until a reviewer has checked it (the file says so and the screen shows it). Any signed-in officer may read it.
 */
@RestController
@RequestMapping("/api")
class Glossary {
    record Entry(String id, String term, String law, String meaning, Map<String, String> terms, String module) {}

    record Answer(String status, String reviewNote, List<Entry> entries) {}

    private final Set<String> languages;
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private String status = "reviewed";
    private final List<String> notes = new ArrayList<>();

    @org.springframework.beans.factory.annotation.Autowired
    Glossary(ObjectMapper json) throws IOException {
        this(nationalLanguages(json));
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/glossary.json"))
            try (InputStream in = res.getInputStream()) {
                add(json.readTree(in));
            }
        if (entries.values().stream().noneMatch(e -> e.module().equals("IN"))) throw new IllegalStateException("the national glossary packs/IN/glossary.json is missing");
    }

    Glossary(Set<String> languages) {
        this.languages = languages;
    }

    /** The Indian languages of the national module (every one but English). */
    private static Set<String> nationalLanguages(ObjectMapper json) throws IOException {
        try (InputStream in = new PathMatchingResourcePatternResolver().getResource("classpath:packs/IN/module.json").getInputStream()) {
            var langs = new TreeSet<String>();
            json.readTree(in).path("languages").forEach(l -> langs.add(l.asText()));
            langs.remove("en");
            return langs;
        }
    }

    void add(JsonNode file) {
        String module = file.path("module").asText("");
        if (!module.matches("[A-Z]{2,3}")) throw new IllegalStateException("glossary: module must be a module id");
        if (!file.path("status").asText().equals("reviewed")) status = "draft";
        if (!file.path("review_note").asText("").isBlank()) notes.add(file.get("review_note").asText());
        for (JsonNode e : file.path("entries")) {
            String id = e.path("id").asText("");
            if (!id.matches("[a-z][a-z0-9_]{1,59}")) throw new IllegalStateException("glossary term id " + id + " is not [a-z0-9_]");
            if (entries.containsKey(id)) throw new IllegalStateException("glossary term " + id + " is declared twice (a module may only add terms)");
            if (e.path("term").asText("").isBlank() || e.path("meaning").asText("").isBlank())
                throw new IllegalStateException("glossary term " + id + " needs a term and a meaning");
            var terms = new LinkedHashMap<String, String>();
            e.path("terms").fields().forEachRemaining(t -> terms.put(t.getKey(), t.getValue().asText("").strip()));
            if (!terms.keySet().equals(languages) || terms.containsValue(""))
                throw new IllegalStateException("glossary term " + id + " must give a term in each of " + languages);
            entries.put(id, new Entry(id, e.get("term").asText(), e.path("law").asText(null), e.get("meaning").asText(), java.util.Collections.unmodifiableMap(terms), module));
        }
    }

    @GetMapping("/glossary")
    Answer all() {
        return new Answer(status, String.join(" ", notes), List.copyOf(entries.values()));
    }
}
