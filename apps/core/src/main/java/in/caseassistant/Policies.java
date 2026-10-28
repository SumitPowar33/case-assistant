package in.caseassistant;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.stereotype.Component;

/**
 * Policies a pack declares (packs/{module}/policies.json) and that a state, district or police station may tighten
 * for itself. A policy is a number of days or hours where lower is stricter, with a default (the legal or national
 * value) and bounds. A unit can only go lower than the unit above it, never higher, and only with a written reason, so
 * a station can never loosen what its state asked for. The strictest value of state, district and station applies
 * (see effective_policy_days in V21). Who may set one: see {@link PolicyController}.
 */
@Component
class Policies {
    record Def(String label, int defaultValue, int min, int max) {}

    private final Map<String, Def> defs = new TreeMap<>();
    private final JdbcClient db;

    @org.springframework.beans.factory.annotation.Autowired
    Policies(ObjectMapper json, JdbcClient db) throws IOException {
        this.db = db;
        for (Resource res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/policies.json")) {
            try (InputStream in = res.getInputStream()) {
                var tree = json.readTree(in).get("policies");
                tree.fieldNames().forEachRemaining(key -> {
                    var d = tree.get(key);
                    add(key, new Def(d.get("label").asText(), d.get("default").asInt(), d.get("min").asInt(), d.get("max").asInt()));
                });
            }
        }
    }

    Policies(Map<String, Def> definitions, JdbcClient db) {
        this.db = db;
        definitions.forEach(this::add);
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
     * The value a unit one level up already asks for: for a state, the default; for a district, the state's; for a
     * station, the strictest of its district's and its state's.
     */
    int above(String level, String stateCode, String district, String key) {
        int v = defs.get(key).defaultValue();
        if (level.equals("state")) return v;
        v = Math.min(v, newest("state", stateCode, null, key, v));
        if (level.equals("station")) v = Math.min(v, newest("district", stateCode, district, key, v));
        return v;
    }

    private int newest(String level, String stateCode, String district, String key, int none) {
        return db.sql("""
                select value::int from policy_setting where key = ? and level = ? and state_code = ?
                  and (?::text is null or district = ?) order by set_at desc limit 1""")
                .params(key, level, stateCode, district, district).query(Integer.class).optional().orElse(none);
    }
}
