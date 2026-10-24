package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Readiness check: for each charge in the FIR that the case's playbook covers, which evidence the officer has
 * linked to each legal ingredient, and what is still missing. Electronic evidence relied on also needs a
 * complete BSA 63(4) certificate. The case team may accept a gap with a written reason; the gap stays listed
 * with that reason. Rules the app cannot check from the data are listed for a person to confirm.
 * There is no score: the report lists facts about the file, never about the people in it.
 */
@RestController
class ReadinessController {
    record Choice(@NotBlank String playbookId) {}

    record Link(@NotBlank String chargeId, @NotBlank String ingredientId, @NotNull UUID evidenceItemId, String note) {}

    record Acceptance(@NotBlank String gapKey, @NotBlank @Size(min = 10, max = 2000) String reason) {}

    static final String CERTIFICATE_RULE = "electronic_record_certificate";

    private final JdbcClient db;
    private final CaseTeam team;
    private final Playbooks playbooks;

    ReadinessController(JdbcClient db, CaseTeam team, Playbooks playbooks) {
        this.db = db;
        this.team = team;
        this.playbooks = playbooks;
    }

    @GetMapping("/api/playbooks")
    List<Map<String, String>> list() {
        return playbooks.all().stream().map(p -> Map.of("id", p.id(), "version", p.version(), "status", p.status(),
                "appliesTo", p.appliesTo())).toList();
    }

    @PutMapping("/api/firs/{firId}/playbook")
    ResponseEntity<Void> choose(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Choice c) {
        UUID user = CaseTeam.user(jwt);
        team.requireTeam(user, firId);
        var pb = playbooks.get(c.playbookId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No such playbook."));
        db.sql("""
                insert into case_playbook (fir_id, playbook_id, playbook_version, chosen_by) values (?,?,?,?)
                on conflict (fir_id) do update set playbook_id = excluded.playbook_id, playbook_version = excluded.playbook_version,
                  chosen_by = excluded.chosen_by, chosen_at = now()""")
                .params(firId, pb.id(), pb.version(), user).update();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/firs/{firId}/readiness/links")
    ResponseEntity<Map<String, UUID>> link(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Link l) {
        UUID user = CaseTeam.user(jwt);
        team.requireTeam(user, firId);
        var pb = playbookOf(firId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Choose a playbook first."));
        var charge = pb.charges().stream().filter(c -> c.id().equals(l.chargeId)).findFirst();
        if (charge.isEmpty() || pb.ingredient(l.chargeId, l.ingredientId).isEmpty() || !sections(firId).contains(charge.get().law()))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That ingredient is not part of a charge in this FIR.");
        UUID id = db.sql("""
                insert into ingredient_evidence (fir_id, charge_id, ingredient_id, evidence_item_id, note, linked_by)
                values (?,?,?,?,?,?) returning id""")
                .params(firId, l.chargeId, l.ingredientId, l.evidenceItemId, l.note, user).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/firs/{firId}/readiness/overrides")
    @Transactional
    ResponseEntity<Map<String, UUID>> override(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Acceptance o) {
        UUID user = CaseTeam.user(jwt);
        team.requireTeam(user, firId);
        @SuppressWarnings("unchecked")
        var gaps = (List<Map<String, Object>>) report(firId).get("gaps");
        if (gaps.stream().noneMatch(g -> g.get("key").equals(o.gapKey) && g.get("override") == null))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That is not an open gap in this case.");
        UUID id = db.sql("insert into readiness_override (fir_id, gap_key, reason, decided_by) values (?,?,?,?) returning id")
                .params(firId, o.gapKey, o.reason.trim(), user).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @GetMapping("/api/firs/{firId}/readiness")
    Map<String, Object> readiness(@PathVariable UUID firId) {
        if (!db.sql("select exists (select 1 from fir where id = ?)").param(firId).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return report(firId);
    }

    private Optional<Playbooks.Playbook> playbookOf(UUID firId) {
        return db.sql("select playbook_id from case_playbook where fir_id = ?").param(firId).query(String.class)
                .optional().flatMap(playbooks::get);
    }

    private List<String> sections(UUID firId) {
        return db.sql("select act || ' ' || section from fir_section where fir_id = ? order by 1").param(firId).query(String.class).list();
    }

    private Map<String, Object> report(UUID firId) {
        var out = new LinkedHashMap<String, Object>();
        var pbOpt = playbookOf(firId);
        if (pbOpt.isEmpty()) {
            out.put("playbook", null);
            out.put("charges", List.of());
            out.put("gaps", List.of());
            out.put("openGaps", 0);
            return out;
        }
        var pb = pbOpt.get();
        List<String> sections = sections(firId);
        var links = db.sql("""
                select l.charge_id, l.ingredient_id, e.id, e.label, e.kind, l.note, r.court_ready
                from ingredient_evidence l join evidence_item e on e.id = l.evidence_item_id
                left join electronic_item_readiness r on r.id = e.id
                where l.fir_id = ? order by e.label""").param(firId).query().listOfRows();
        var overrides = new HashMap<String, Map<String, Object>>();
        db.sql("""
                select o.gap_key, o.reason, o.decided_at, u.full_name as decided_by
                from readiness_override o join app_user u on u.id = o.decided_by where o.fir_id = ?""")
                .param(firId).query().listOfRows().forEach(r -> overrides.put((String) r.get("gap_key"), r));

        var charges = new ArrayList<Map<String, Object>>();
        var gaps = new ArrayList<Map<String, Object>>();
        var notReady = new TreeMap<String, String>(); // item id -> label, electronic items relied on without a full certificate
        for (var ch : pb.charges()) {
            if (!sections.contains(ch.law())) continue;
            var ingredients = new ArrayList<Map<String, Object>>();
            for (var ing : ch.ingredients()) {
                var evidence = links.stream()
                        .filter(l -> ch.id().equals(l.get("charge_id")) && ing.id().equals(l.get("ingredient_id")))
                        .map(l -> {
                            var e = new LinkedHashMap<String, Object>();
                            e.put("id", l.get("id"));
                            e.put("label", l.get("label"));
                            e.put("kind", l.get("kind"));
                            e.put("note", l.get("note"));
                            if ("electronic".equals(l.get("kind"))) {
                                e.put("courtReady", l.get("court_ready"));
                                if (!Boolean.TRUE.equals(l.get("court_ready"))) notReady.put(l.get("id").toString(), (String) l.get("label"));
                            }
                            return e;
                        }).toList();
                String key = "ingredient:" + ch.id() + "/" + ing.id();
                ingredients.add(Map.of("id", ing.id(), "text", ing.text(), "suggestedProof", ing.proof(), "evidence", evidence));
                if (evidence.isEmpty()) gaps.add(gap(key, "critical", "No evidence linked for: " + ing.text() + " (" + ch.law() + ")", overrides));
            }
            charges.add(Map.of("id", ch.id(), "law", ch.law(), "label", ch.label(), "ingredients", ingredients));
        }
        if (pb.hasRule(CERTIFICATE_RULE)) {
            notReady.forEach((id, label) -> gaps.add(gap("certificate:" + id, "critical",
                    label + " is electronic evidence without a complete BSA 63(4) certificate (Part A and Part B with a matching SHA-256).",
                    overrides)));
        }
        var covered = charges.stream().map(c -> (String) c.get("law")).toList();
        out.put("playbook", Map.of("id", pb.id(), "version", pb.version(), "status", pb.status(),
                "reviewNote", Objects.requireNonNullElse(pb.reviewNote(), "")));
        out.put("charges", charges);
        out.put("sectionsNotInPlaybook", sections.stream().filter(s -> !covered.contains(s)).toList());
        out.put("gaps", gaps);
        out.put("openGaps", gaps.stream().filter(g -> g.get("override") == null).count());
        out.put("checksToConfirm", pb.rules().stream().filter(r -> !r.id().equals(CERTIFICATE_RULE)).toList());
        return out;
    }

    private static Map<String, Object> gap(String key, String severity, String text, Map<String, Map<String, Object>> overrides) {
        var g = new LinkedHashMap<String, Object>();
        g.put("key", key);
        g.put("severity", severity);
        g.put("text", text);
        var o = overrides.get(key);
        g.put("override", o == null ? null : Map.of("reason", o.get("reason"), "decidedBy", o.get("decided_by"), "decidedAt", o.get("decided_at")));
        return g;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this (evidence from another case, or already linked)."));
    }
}
