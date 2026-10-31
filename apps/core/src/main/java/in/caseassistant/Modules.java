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
 */
@Component
public class Modules {
    private static final Pattern ID = Pattern.compile("[A-Z]{2,3}");
    private static final Pattern LANG = Pattern.compile("[a-z]{2,3}");

    record Manifest(String id, String name, String version, List<String> languages, List<String> depends) {}

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
    }
}
