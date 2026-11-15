package in.caseassistant;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.stream.Collectors;
import java.util.Set;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The modules (packs) of this installation, from packs/{id}/module.json: id, name, version, languages and the modules it
 * builds on. The national module "IN" must be there and every other module must depend on it. At start-up each module
 * gets its row in state_pack, so an admin of a fresh installation can add stations at once (stations and policies point
 * at that row). The status of a row (draft, pilot, live) is not touched here.
 * A state module may also name laws of its own state ("acts", for example "MPID Act"): never a national act, never one
 * another module names; they are written to state_act (V57), and a section of such a law holds only for FIRs of that state.
 */
@Component
public class Modules {
    private static final Pattern ID = Pattern.compile("[A-Z]{2,3}");
    private static final Pattern LANG = Pattern.compile("[a-z]{2,3}");

    private static final Pattern ACT = Pattern.compile("[A-Z][A-Za-z/-]*( [A-Za-z/-]+)* Act");

    record Manifest(String id, String name, String version, List<String> languages, List<String> depends, List<String> acts) {
        Manifest(String id, String name, String version, List<String> languages, List<String> depends) {
            this(id, name, version, languages, depends, null);
        }

        List<String> ownActs() {
            return acts == null ? List.of() : acts;
        }
    }

    private final Map<String, Manifest> modules = new LinkedHashMap<>();
    private final JdbcClient db;

    @org.springframework.beans.factory.annotation.Autowired
    Modules(ObjectMapper json, JdbcClient db) throws IOException {
        this(readFiles(json), db);
    }

    /** folder name of each module.json, and its contents */
    private static Map<String, Manifest> readFiles(ObjectMapper json) throws IOException {
        var files = new LinkedHashMap<String, Manifest>();
        for (Resource res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/module.json")) {
            String[] path = res.getURL().getPath().split("/");
            try (InputStream in = res.getInputStream()) {
                files.put(path[path.length - 2], json.readValue(in, Manifest.class));
            }
        }
        return files;
    }

    Modules(Map<String, Manifest> byFolder, JdbcClient db) {
        this.db = db;
        byFolder.forEach((folder, m) -> {
            if (m.id() == null || !ID.matcher(m.id()).matches() || !m.id().equals(folder))
                throw new IllegalStateException("packs/" + folder + "/module.json: id must be the folder name (2 or 3 capital letters)");
            if (m.name() == null || m.name().isBlank() || m.version() == null || m.version().isBlank())
                throw new IllegalStateException(m.id() + ": module.json needs a name and a version");
            if (m.languages() == null || m.languages().isEmpty() || !m.languages().stream().allMatch(l -> l != null && LANG.matcher(l).matches()))
                throw new IllegalStateException(m.id() + ": module.json needs languages as codes like \"en\" or \"mr\"");
            modules.put(m.id(), m);
        });
        if (!modules.containsKey("IN")) throw new IllegalStateException("the national module packs/IN/module.json is missing");
        for (Manifest m : modules.values()) {
            List<String> deps = m.depends() == null ? List.of() : m.depends();
            for (String d : deps)
                if (!modules.containsKey(d) || d.equals(m.id())) throw new IllegalStateException(m.id() + ": depends on unknown module " + d);
            if (!m.id().equals("IN") && !deps.contains("IN")) throw new IllegalStateException(m.id() + ": every module must depend on IN");
        }
        var owner = new java.util.HashMap<String, String>();
        for (Manifest m : modules.values())
            for (String act : m.ownActs()) {
                if (m.id().equals("IN")) throw new IllegalStateException("IN: the national acts are fixed (V1); only a state module names laws of its own");
                if (act == null || act.length() > 40 || !ACT.matcher(act).matches() || Playbooks.ACTS.contains(act))
                    throw new IllegalStateException(m.id() + ": \"" + act + "\" is not a state law named like \"MPID Act\" (and not a national act)");
                String before = owner.putIfAbsent(act, m.id());
                if (before != null) throw new IllegalStateException(m.id() + ": " + act + " is already a law of " + before);
            }
    }

    boolean exists(String id) {
        return modules.containsKey(id);
    }

    /** The acts a section of an FIR of this state may name: the national ones and the state module's own laws. */
    List<String> acts(String state) {
        var m = state == null ? null : modules.get(state);
        var out = new java.util.ArrayList<>(Playbooks.ACTS);
        if (m != null) out.addAll(m.ownActs());
        return out;
    }

    /** Every language some module offers (screen language choices). */
    Set<String> languages() {
        return modules.values().stream().flatMap(m -> m.languages().stream()).collect(Collectors.toCollection(java.util.TreeSet::new));
    }

    /** Gives every module its state_pack row; name, version and languages follow the file. */
    @PostConstruct
    void sync() {
        modules.values().forEach(m -> db.sql("""
                insert into state_pack (code, name, version, languages) values (?, ?, ?, ?::text[])
                on conflict (code) do update set name = excluded.name, version = excluded.version, languages = excluded.languages""")
                .params(m.id(), m.name(), m.version(), "{" + String.join(",", m.languages()) + "}").update());
        // a state law once named stays (V57 keeps the rows); a row of another state for the same name stops the start
        modules.values().forEach(m -> m.ownActs().forEach(act -> {
            db.sql("insert into state_act (act, state_code) values (?, ?) on conflict (act) do nothing").params(act, m.id()).update();
            if (!m.id().equals(db.sql("select state_code from state_act where act = ?").param(act).query(String.class).single()))
                throw new IllegalStateException(m.id() + ": " + act + " is recorded in this database as a law of another state");
        }));
    }
}
