package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sections of an FIR and the charges of the playbooks they may be chosen from (AI feature A2, V51). The AI gateway
 * (feature section_suggest) reads the FIR text against these charges in the browser and suggests the ones whose
 * ingredients the text may describe; the officer chooses, with a reason, and only then is the section added. A section
 * is added only from a playbook charge and only of the law the offence falls under (BNS from 1 July 2024, IPC before;
 * the database checks it too). Case team only. Nothing here says whether an ingredient is proved or who did it.
 */
@RestController
@RequestMapping("/api/firs/{firId}/sections")
class SectionController {
    record Choice(@NotBlank String playbookId, @NotBlank String chargeId,
            @NotBlank @Size(min = 10, max = 2000) String reason, @NotNull UUID aiRequestId) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final Playbooks playbooks;

    SectionController(JdbcClient db, CaseTeam team, Playbooks playbooks) {
        this.db = db;
        this.team = team;
        this.playbooks = playbooks;
    }

    private String law(UUID firId) {
        return db.sql("select fir_offence_law(?)").param(firId).query(String.class).single();
    }

    @GetMapping
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var sections = db.sql("""
                select s.act, s.section, s.added_at, s.reason, u.full_name as chosen_by_name
                from fir_section s left join app_user u on u.id = s.chosen_by
                where s.fir_id = ? order by s.added_at nulls first, s.act, s.section""").param(firId).query().listOfRows();
        var inFir = sections.stream().map(s -> s.get("act") + " " + s.get("section")).toList();
        var charges = playbooks.all().stream().flatMap(pb -> pb.charges().stream().map(c -> {
            var m = new LinkedHashMap<String, Object>();
            m.put("playbook_id", pb.id());
            m.put("charge_id", c.id());
            m.put("act", c.act());
            m.put("law", c.law());
            m.put("label", c.label());
            m.put("ingredients", c.ingredients().stream().map(i -> Map.of("id", i.id(), "text", i.text())).toList());
            m.put("in_fir", inFir.contains(c.act() + " " + c.section()));
            return m;
        })).toList();
        return Map.of("law", law(firId), "sections", sections, "charges", charges);
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Choice c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (c.reason.trim().length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a reason of at least 10 characters.");
        var charge = playbooks.get(c.playbookId).flatMap(pb -> pb.charges().stream().filter(x -> x.id().equals(c.chargeId)).findFirst())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No such charge in the playbooks."));
        if (charge.act().equals("BNS") && law(firId).equals("old"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "The offence of this FIR is before 1 July 2024, so the IPC applies, not the BNS (BNS 358). Find the IPC section in the law finder.");
        try {
            db.sql("""
                    insert into fir_section (fir_id, act, section, chosen_by, added_at, reason, ai_request_id)
                    values (?, ?, ?, ?, clock_timestamp(), ?, ?)""")
                    .params(firId, charge.act(), charge.section(), me, c.reason.trim(), c.aiRequestId).update();
        } catch (DuplicateKeyException twice) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This section is already in the FIR.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("act", charge.act(), "section", charge.section()));
    }
}
