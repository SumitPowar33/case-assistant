package in.caseassistant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/** The playbooks in packs/{state}/playbooks/*.json (copied onto the classpath by the build), keyed by id. */
@Component
class Playbooks {
    record Ingredient(String id, String text, List<String> proof) {}

    record Charge(String id, String law, String label, List<Ingredient> ingredients) {}

    record Rule(String id, String severity, String text, String source) {}

    record Playbook(String id, String version, String status, @JsonProperty("review_note") String reviewNote,
                    @JsonProperty("applies_to") String appliesTo, List<Charge> charges, List<Rule> rules) {
        Optional<Ingredient> ingredient(String chargeId, String ingredientId) {
            return charges.stream().filter(c -> c.id.equals(chargeId)).flatMap(c -> c.ingredients.stream())
                    .filter(i -> i.id.equals(ingredientId)).findFirst();
        }

        boolean hasRule(String ruleId) {
            return rules.stream().anyMatch(r -> r.id.equals(ruleId));
        }
    }

    private final Map<String, Playbook> byId = new TreeMap<>();

    Playbooks(ObjectMapper json) throws IOException {
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/playbooks/*.json")) {
            try (InputStream in = res.getInputStream()) {
                Playbook pb = json.readValue(in, Playbook.class);
                if (byId.putIfAbsent(pb.id, pb) != null)
                    throw new IllegalStateException("two playbooks with id " + pb.id + "; keep one version active");
            }
        }
    }

    Optional<Playbook> get(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    List<Playbook> all() {
        return List.copyOf(byId.values());
    }
}
