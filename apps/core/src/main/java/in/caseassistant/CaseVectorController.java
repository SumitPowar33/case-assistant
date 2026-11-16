package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Vectors of the pieces of a case file (item 17, V58). The browser has the AI gateway's embedding model (on the state's own
 * server) make a vector for each piece of the case file that has none, and keeps it here, looked up by the hash of the piece's
 * text, so the next question needs only its own vector. Only the case team reads or writes; a vector is derived data and is
 * not the text. One call carries at most 64 vectors (the body limit is 1 MiB) and the hashes of every piece the case file has
 * now: vectors of pieces that are gone (a changed diary line) are removed in the same call.
 */
@RestController
@RequestMapping("/api/firs/{firId}/case-file/vectors")
class CaseVectorController {
    record Item(@NotNull @Pattern(regexp = "[0-9a-f]{8,64}") String hash, @NotNull @Size(min = 1, max = 1024) List<Double> vec) {}
    record Put(@NotNull @Pattern(regexp = "[A-Za-z0-9._/-]{1,80}") String model, @NotNull @Size(max = 5000) List<@Pattern(regexp = "[0-9a-f]{8,64}") String> keep,
            @NotNull @Size(max = 64) List<@Valid Item> items) {}

    private final JdbcClient db;
    private final CaseTeam team;

    CaseVectorController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping
    Map<String, Object> read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @RequestParam @Pattern(regexp = "[A-Za-z0-9._/-]{1,80}") String model) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var items = new ArrayList<Map<String, Object>>();
        for (var r : db.sql("select text_hash, array_to_string(vec, ',') as v from case_passage_vector where fir_id = ? and model = ? order by text_hash")
                .params(firId, model).query().listOfRows()) {
            var m = new LinkedHashMap<String, Object>();
            m.put("hash", r.get("text_hash"));
            m.put("vec", java.util.Arrays.stream(((String) r.get("v")).split(",")).map(Double::parseDouble).toList());
            items.add(m);
        }
        return Map.of("model", model, "items", items);
    }

    @PutMapping
    Map<String, Object> save(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Put body) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        int dim = body.items.isEmpty() ? 0 : body.items.get(0).vec.size();
        for (Item i : body.items) {
            if (i.vec.size() != dim || i.vec.stream().anyMatch(x -> x == null || x.isNaN() || x.isInfinite()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every vector must have the same length and hold only numbers.");
        }
        for (Item i : body.items) {
            db.sql("""
                    insert into case_passage_vector (fir_id, model, text_hash, vec) values (?, ?, ?, ?::real[])
                    on conflict (fir_id, model, text_hash) do update set vec = excluded.vec, created_at = now()""")
                    .params(firId, body.model, i.hash, "{" + i.vec.stream().map(String::valueOf).collect(Collectors.joining(",")) + "}").update();
        }
        int gone = db.sql("delete from case_passage_vector where fir_id = ? and model = ? and not (text_hash = any (?::text[]))")
                .params(firId, body.model, "{" + String.join(",", body.keep) + "}").update();
        return Map.of("saved", body.items.size(), "removed", gone);
    }
}
