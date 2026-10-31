package in.caseassistant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Roles and what they may do, read from packs/{module}/roles.json (a module = a pack, like an Odoo module). A pack can
 * add a role or give an existing role more permissions; it can never take one away, and every permission it names must
 * be declared by some pack. Case access follows the role's scope: the named IO always, plus everyone of the role's
 * station ("station") or district ("district"). The same file decides who may do what, so a state adds a role by adding
 * data, not code. The codes are checked at start-up, so they are safe to put into SQL.
 */
@Component
public class Roles {
    private static final Pattern CODE = Pattern.compile("[a-z][a-z_]{1,29}");
    private static final Set<String> SCOPES = Set.of("none", "station", "district");

    record Role(String label, @JsonProperty("station_required") boolean stationRequired,
                @JsonProperty("case_scope") String caseScope, List<String> permissions) {}

    record File(String module, Map<String, String> permissions, Map<String, Role> roles) {}

    private final Map<String, Role> roles = new LinkedHashMap<>();
    private final Set<String> permissions = new LinkedHashSet<>();
    private final JdbcClient db;

    @org.springframework.beans.factory.annotation.Autowired
    Roles(ObjectMapper json, JdbcClient db) throws IOException {
        this(readFiles(json), db);
    }

    private static List<File> readFiles(ObjectMapper json) throws IOException {
        var files = new ArrayList<File>();
        for (Resource res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/roles.json")) {
            try (InputStream in = res.getInputStream()) {
                files.add(json.readValue(in, File.class));
            }
        }
        return files;
    }

    Roles(List<File> files, JdbcClient db) {
        this.db = db;
        files = new ArrayList<>(files);
        // the national pack first, then the others by code, so a state pack extends it
        files.sort(Comparator.comparing((File f) -> !"IN".equals(f.module())).thenComparing(File::module));
        files.forEach(f -> permissions.addAll(f.permissions().keySet()));
        for (File f : files) {
            f.roles().forEach((code, r) -> add(f.module(), code, r));
        }
    }

    private void add(String module, String code, Role r) {
        if (!CODE.matcher(code).matches()) throw new IllegalStateException(module + ": bad role code " + code);
        if (!SCOPES.contains(r.caseScope())) throw new IllegalStateException(module + ": bad case_scope for " + code);
        for (String p : r.permissions())
            if (!permissions.contains(p)) throw new IllegalStateException(module + ": role " + code + " uses undeclared permission " + p);
        Role old = roles.get(code);
        if (old == null) {
            roles.put(code, r);
            return;
        }
        if (!old.caseScope().equals(r.caseScope()) || old.stationRequired() != r.stationRequired())
            throw new IllegalStateException(module + ": role " + code + " cannot change scope or station rule of the national role");
        var merged = new LinkedHashSet<>(old.permissions());
        merged.addAll(r.permissions());
        roles.put(code, new Role(old.label(), old.stationRequired(), old.caseScope(), List.copyOf(merged)));
    }

    /** Makes sure every role has a row, because accounts point at it. */
    @PostConstruct
    void sync() {
        roles.forEach((code, r) -> db.sql("insert into role (code, label) values (?,?) on conflict (code) do update set label = excluded.label")
                .params(code, r.label()).update());
    }

    boolean exists(String code) {
        return roles.containsKey(code);
    }

    boolean has(String code, String permission) {
        Role r = roles.get(code);
        return r != null && r.permissions().contains(permission);
    }

    /** The permissions a role holds (merged from every pack). */
    List<String> permissions(String code) {
        return roles.get(code).permissions();
    }

    /** "none", "station" or "district". */
    String caseScope(String code) {
        return roles.get(code).caseScope();
    }

    boolean stationRequired(String code) {
        return roles.get(code).stationRequired();
    }

    /** Role codes that hold a permission. */
    Set<String> with(String permission) {
        return roles.entrySet().stream().filter(e -> e.getValue().permissions().contains(permission)).map(Map.Entry::getKey)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Role codes whose members see every case of their station ("station") or district ("district"). */
    Set<String> scoped(String scope) {
        return roles.entrySet().stream().filter(e -> e.getValue().caseScope().equals(scope)).map(Map.Entry::getKey)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** For SQL: ('a', 'b'). An empty set gives a list that matches nothing. */
    static String in(Set<String> codes) {
        return codes.isEmpty() ? "(null)" : codes.stream().map(c -> "'" + c + "'").collect(Collectors.joining(", ", "(", ")"));
    }

    /** Roles for the admin screen: code, label, whether a station is needed. */
    List<Map<String, Object>> list() {
        return roles.entrySet().stream().map(e -> Map.<String, Object>of("code", e.getKey(), "label", e.getValue().label(),
                "station_required", e.getValue().stationRequired(), "permissions", e.getValue().permissions())).toList();
    }
}
