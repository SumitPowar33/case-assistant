package in.caseassistant;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.HashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * The playbooks in packs/{module}/playbooks/*.json (copied onto the classpath by the build), keyed by id. A national
 * playbook (IN) holds for every FIR; a state module's playbook only for FIRs of its own state, and it may name that
 * state's own laws (module.json "acts"). A state playbook may only tighten a national charge: a charge of the same law as
 * a national playbook's charge keeps every national ingredient (same id, same text, every proof) and may add more.
 * A module may also give its playbooks' texts in another language (packs/{module}/playbook-texts), shown beside the
 * English text, which is the one that holds.
 */
@Component
class Playbooks {
    record Ingredient(String id, String text, List<String> proof) {}

    /** One module's translation of one playbook's shown texts, keyed by the English text itself, so a changed text loses it. */
    record Texts(String playbook, String language, String status, Map<String, String> texts) {}

    /** What the screens look translations up in; "draft" while any file in it has not been reviewed. */
    record Translations(String status, Map<String, String> texts) {}

    /** The acts fir_section takes (V1), longest first so "IT Act" is not read as an act "IT". */
    static final List<String> ACTS = List.of("POCSO Act", "SC/ST Act", "NDPS Act", "Arms Act", "IT Act", "Other", "BNS", "IPC");

    record Charge(String id, String law, String label, List<Ingredient> ingredients) {
        /** The act of the law ("BNS" of "BNS 318(4)", "IT Act" of "IT Act 66D"); the playbook is refused at start-up if it is not an act its FIRs take. */
        String act() {
            int i = law.lastIndexOf(" Act ");
            return i >= 0 ? law.substring(0, i + 4) : law.substring(0, Math.max(law.indexOf(' '), 0));
        }

        String section() {
            return law.substring(act().length() + 1);
        }
    }

    record Rule(String id, String severity, String text, String source, @JsonAlias("requires_any") List<String> requiresAny) {}

    record Playbook(String id, String version, String status, @JsonProperty("review_note") String reviewNote,
                    @JsonProperty("applies_to") String appliesTo, List<Charge> charges, List<Rule> rules) {
        Optional<Ingredient> ingredient(String chargeId, String ingredientId) {
            return charges.stream().filter(c -> c.id.equals(chargeId)).flatMap(c -> c.ingredients.stream())
                    .filter(i -> i.id.equals(ingredientId)).findFirst();
        }

        boolean hasRule(String ruleId) {
            return rule(ruleId).isPresent();
        }

        Optional<Rule> rule(String ruleId) {
            return rules.stream().filter(r -> r.id.equals(ruleId)).findFirst();
        }
    }

    private final Map<String, Playbook> byId = new TreeMap<>();
    private final Map<String, String> moduleOf = new TreeMap<>();
    private final Map<String, Texts> textsById = new TreeMap<>();   // "playbook/language"

    @Autowired
    Playbooks(ObjectMapper json, Modules modules) throws IOException {
        this(read(json, "playbooks", Playbook.class), modules);
        read(json, "playbook-texts", Texts.class).forEach(file -> addTexts(file.getKey(), file.getValue()));
    }

    /** Every file of one folder of the modules, with the module it is in. */
    private static <T> List<Map.Entry<String, T>> read(ObjectMapper json, String folder, Class<T> type) throws IOException {
        var out = new java.util.ArrayList<Map.Entry<String, T>>();
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/" + folder + "/*.json")) {
            String[] path = res.getURL().getPath().split("/");   // .../packs/{module}/{folder}/{file}.json
            try (InputStream in = res.getInputStream()) {
                out.add(Map.entry(path[path.length - 3], json.readValue(in, type)));
            }
        }
        return out;
    }

    Playbooks(List<Map.Entry<String, Playbook>> files, Modules modules) {
        files.forEach(file -> {
            String module = file.getKey();
            Playbook pb = file.getValue();
            if (!modules.exists(module)) throw new IllegalStateException("playbook " + pb.id + " is in packs/" + module + ", which has no module.json");
            check(pb, modules.acts(module));
            if (byId.putIfAbsent(pb.id, pb) != null)
                throw new IllegalStateException("two playbooks with id " + pb.id + "; keep one version active");
            moduleOf.put(pb.id, module);
        });
        var national = new HashMap<String, Charge>();
        byId.values().stream().filter(pb -> moduleOf.get(pb.id).equals("IN")).flatMap(pb -> pb.charges.stream()).forEach(c -> national.putIfAbsent(c.law, c));
        for (Playbook pb : byId.values()) {
            if (moduleOf.get(pb.id).equals("IN")) continue;
            for (Charge c : pb.charges) {
                Charge n = national.get(c.law);
                if (n == null) continue;
                for (Ingredient i : n.ingredients)
                    if (c.ingredients.stream().noneMatch(x -> x.id.equals(i.id) && x.text.equals(i.text) && x.proof.containsAll(i.proof)))
                        throw new IllegalStateException("playbook " + pb.id + ": charge " + c.id + " (" + c.law + ") leaves out or changes the national ingredient "
                                + i.id + "; a state playbook may only add to a national charge");
            }
        }
    }

    /** Takes a module's translation of one of its own playbooks; a text the playbook no longer shows is left out. */
    void addTexts(String module, Texts t) {
        Playbook pb = byId.get(t.playbook);
        if (pb == null || !module.equals(moduleOf.get(t.playbook)))
            throw new IllegalStateException("packs/" + module + "/playbook-texts: " + t.playbook + " is not a playbook of this module");
        var shown = Stream.of(Stream.of(pb.appliesTo), pb.charges.stream().map(Charge::label),
                        pb.charges.stream().flatMap(c -> c.ingredients.stream()).map(Ingredient::text), pb.rules.stream().map(Rule::text))
                .flatMap(s -> s).collect(Collectors.toSet());
        var texts = new TreeMap<>(t.texts);
        texts.keySet().retainAll(shown);
        texts.values().removeIf(String::isBlank);
        if (textsById.putIfAbsent(t.playbook + "/" + t.language, new Texts(t.playbook, t.language, t.status, texts)) != null)
            throw new IllegalStateException("two translations of " + t.playbook + " into " + t.language);
    }

    /** The translations into one language of the playbooks that hold for a state (all of them for no state). */
    Translations translations(String state, String language) {
        var files = forState(state).stream().map(pb -> textsById.get(pb.id + "/" + language)).filter(Objects::nonNull).toList();
        var texts = new TreeMap<String, String>();
        files.forEach(f -> texts.putAll(f.texts));
        return new Translations(files.stream().allMatch(f -> "reviewed".equals(f.status)) ? "reviewed" : "draft", texts);
    }

    /** Every charge names a national act and a section ("BNS 318(4)", "IT Act 66D"), so the officer can add it to an FIR. */
    static void check(Playbook pb) {
        check(pb, ACTS);
    }

    /** Every charge names one of these acts and a section. */
    static void check(Playbook pb, List<String> acts) {
        for (Charge c : pb.charges)
            if (acts.stream().noneMatch(a -> c.law.startsWith(a + " ") && c.law.substring(a.length() + 1).matches("[0-9][0-9A-Za-z()/.-]*")))
                throw new IllegalStateException("playbook " + pb.id + ": charge " + c.id + " names a law that is not an act and a section: " + c.law);
    }

    Optional<Playbook> get(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    /** "Ingredient text (law)" for "charge/ingredient", from the named playbook if it has it, else from any playbook. */
    Optional<String> ingredientText(String preferred, String chargeAndIngredient) {
        return Stream.concat(Stream.ofNullable(preferred == null ? null : byId.get(preferred)), byId.values().stream())
                .flatMap(p -> p.charges().stream())
                .flatMap(c -> c.ingredients().stream().filter(i -> (c.id() + "/" + i.id()).equals(chargeAndIngredient))
                        .map(i -> i.text() + " (" + c.law() + ")"))
                .findFirst();
    }

    /** The module a playbook comes from ("IN" or a state code). */
    String module(String id) {
        return moduleOf.get(id);
    }

    /** Whether the playbook holds for an FIR of this state: a national one always, a state module's only in its state. */
    boolean holdsFor(Playbook pb, String state) {
        String m = moduleOf.get(pb.id);
        return m.equals("IN") || m.equals(state);
    }

    /** The playbooks of an FIR of this state; for no state (the platform admin, no station) all of them. */
    List<Playbook> forState(String state) {
        return byId.values().stream().filter(pb -> state == null || holdsFor(pb, state)).toList();
    }
}
