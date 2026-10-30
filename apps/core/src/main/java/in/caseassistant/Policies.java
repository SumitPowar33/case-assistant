package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

/**
 * Policies a pack declares (packs/{module}/policies.json) and that a state, district or police station may tighten
 * for itself. A policy is a number of days or hours where lower is stricter, with a default (the legal or national
 * value) and bounds. A unit can only go lower than the unit above it, never higher, and only with a written reason, so
 * a station can never loosen what its state asked for. The strictest value of state, district and station applies
 * (see effective_policy_days in V21). Who may set one: see {@link PolicyController}.
 */
@Component
@DependsOn("modules")   // pack_policy rows point at the state_pack rows that Modules writes
class Policies {
    record Def(String label, int defaultValue, int min, int max) {}

    /** A state module's own value of a policy for its whole state ("state_values" in its policies.json), with the reason. */
    record StateValue(int value, String reason) {}

    private final Map<String, Def> defs = new TreeMap<>();
    private final Map<String, Map<String, StateValue>> stateValues = new TreeMap<>();
    private final JdbcClient db;

    @org.springframework.beans.factory.annotation.Autowired
    Policies(ObjectMapper json, JdbcClient db) throws IOException {
        this.db = db;
        for (Resource res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/policies.json")) {
            try (InputStream in = res.getInputStream()) {
                var file = json.readTree(in);
                var tree = file.path("policies");
                tree.fieldNames().forEachRemaining(key -> {
                    var d = tree.get(key);
                    add(key, new Def(d.get("label").asText(), d.get("default").asInt(), d.get("min").asInt(), d.get("max").asInt()));
                });
                var values = file.path("state_values");
                var mine = new TreeMap<String, StateValue>();
                values.fieldNames().forEachRemaining(key -> mine.put(key, stateValue(file.path("module").asText(), key, values.get(key))));
                if (!mine.isEmpty()) stateValues.put(file.path("module").asText(), mine);
            }
        }
        checkStateValues();
    }

    static StateValue stateValue(String module, String key, JsonNode v) {
        if (!v.path("value").isInt()) throw new IllegalStateException(module + ": state value of " + key + " must be a whole number");
        return new StateValue(v.get("value").asInt(), v.path("reason").asText(null));
    }

    Policies(Map<String, Def> definitions, Map<String, Map<String, StateValue>> byState, JdbcClient db) {
        this.db = db;
        definitions.forEach(this::add);
        stateValues.putAll(byState);
        checkStateValues();
    }

    Policies(Map<String, Def> definitions, JdbcClient db) {
        this(definitions, Map.of(), db);
    }

    /** A state module may only make a national policy stricter for its own state, with a reason; the national module sets defaults instead. */
    private void checkStateValues() {
        stateValues.forEach((state, values) -> values.forEach((key, v) -> {
            if (state.equals("IN")) throw new IllegalStateException("IN: the national module sets defaults, not state values");
            Def d = defs.get(key);
            if (d == null) throw new IllegalStateException(state + ": state value for unknown policy " + key);
            if (v.value() < d.min() || v.value() > d.defaultValue())
                throw new IllegalStateException(state + ": " + key + " may only be made stricter, between " + d.min() + " and " + d.defaultValue());
            if (v.reason() == null || v.reason().strip().length() < 10) throw new IllegalStateException(state + ": " + key + " needs a reason of 10 or more characters");
        }));
    }

    /** Writes the state modules' values to pack_policy, so the database (deadlines) and this class agree. */
    @PostConstruct
    void sync() {
        db.sql("delete from pack_policy").update();
        stateValues.forEach((state, values) -> values.forEach((key, v) ->
                db.sql("insert into pack_policy (state_code, key, value, reason) values (?,?,?,?)").params(state, key, v.value(), v.reason().strip()).update()));
    }

    /** The value a state starts from: the national default, or its module's stricter value. */
    private int base(String stateCode, String key) {
        var v = stateValues.getOrDefault(stateCode, Map.of()).get(key);
        return v == null ? defs.get(key).defaultValue() : v.value();
    }

    private void add(String key, Def d) {
        if (!key.matches("[a-z][a-z_.]{1,59}")) throw new IllegalStateException("bad policy key " + key);
        if (d.min() > d.max() || d.defaultValue() < d.min() || d.defaultValue() > d.max())
            throw new IllegalStateException("policy " + key + ": default and bounds do not fit");
        if (defs.putIfAbsent(key, d) != null) throw new IllegalStateException("policy " + key + " declared twice");
    }

    Def def(String key) {
        return defs.get(key);
    }

    /** Definitions with the value in force for a police station (the default when the station is unknown). */
    List<Map<String, Object>> forStation(UUID stationId) {
        var out = new ArrayList<Map<String, Object>>();
        defs.forEach((key, d) -> out.add(Map.of("key", key, "label", d.label(), "default", d.defaultValue(), "min", d.min(),
                "max", d.max(), "effective", effective(stationId, key))));
        return out;
    }

    int effective(UUID stationId, String key) {
        Def d = defs.get(key);
        return stationId == null ? d.defaultValue()
                : db.sql("select effective_policy_days(?, ?, ?)").params(stationId, key, d.defaultValue()).query(Integer.class).single();
    }

    Duration sessionLife(UUID stationId) {
        return Duration.ofHours(effective(stationId, "session_hours"));
    }

    /**
     * The value a unit one level up already asks for: for a state, the default (or its module's stricter value); for a
     * district, also the state's; for a station, the strictest of its district's and its state's.
     */
    int above(String level, String stateCode, UUID districtId, String key) {
        int v = base(stateCode, key);
        if (level.equals("state")) return v;
        v = Math.min(v, newest("state", stateCode, null, key, v));
        if (level.equals("station")) v = Math.min(v, newest("district", stateCode, districtId, key, v));
        return v;
    }

    private int newest(String level, String stateCode, UUID districtId, String key, int none) {
        return db.sql("""
                select value::int from policy_setting where key = ? and level = ? and state_code = ?
                  and (?::uuid is null or district_id = ?) order by set_at desc limit 1""")
                .params(key, level, stateCode, districtId, districtId).query(Integer.class).optional().orElse(none);
    }
}
