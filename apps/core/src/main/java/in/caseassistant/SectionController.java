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

    record Own(@NotBlank String act, @NotBlank String section, @NotBlank @Size(min = 10, max = 2000) String reason) {}

    private static final java.util.regex.Pattern SECTION = java.util.regex.Pattern.compile("[0-9][0-9A-Za-z()/.-]{0,29}");

    private final JdbcClient db;
    private final CaseTeam team;
    private final Playbooks playbooks;
    private final Modules modules;
    private final Punishments punishments;

    SectionController(JdbcClient db, CaseTeam team, Playbooks playbooks, Modules modules, Punishments punishments) {
        this.db = db;
        this.team = team;
        this.playbooks = playbooks;
        this.modules = modules;
        this.punishments = punishments;
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
        // each charge carries its punishment class (packs punishments.json): the screen marks a suggested charge heavier than
        // every section already on the FIR, so the officer does not register a lighter section than the facts describe
        String state = team.stateOfFir(firId);
        String firTop = null;
        for (String key : inFir) if (Punishments.heavier(punishments.classOf(state, key), firTop)) firTop = punishments.classOf(state, key);
        final String top = firTop;
        var charges = playbooks.forState(state).stream().flatMap(pb -> pb.charges().stream().map(c -> {
            var m = new LinkedHashMap<String, Object>();
            m.put("playbook_id", pb.id());
            m.put("charge_id", c.id());
            m.put("act", c.act());
            m.put("law", c.law());
            m.put("label", c.label());
            m.put("ingredients", c.ingredients().stream().map(i -> Map.of("id", i.id(), "text", i.text())).toList());
            m.put("in_fir", inFir.contains(c.act() + " " + c.section()));
            String cls = punishments.classOf(state, c.act() + " " + c.section());
            m.put("punishment", cls);
            m.put("graver", !inFir.contains(c.act() + " " + c.section()) && Punishments.heavier(cls, top));
            return m;
        })).toList();
        var out = new LinkedHashMap<String, Object>();
        out.put("law", law(firId));
        out.put("sections", sections);
        out.put("charges", charges);
        out.put("fir_punishment", top);
        out.put("acts", modules.acts(team.stateOfFir(firId)));
        return out;
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Choice c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (team.identityProtected(firId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The AI is not used on a case whose victim's identity is protected, so its result is not taken.");
        if (c.reason.trim().length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a reason of at least 10 characters.");
        var charge = playbooks.get(c.playbookId).filter(pb -> playbooks.holdsFor(pb, team.stateOfFir(firId))).flatMap(pb -> pb.charges().stream().filter(x -> x.id().equals(c.chargeId)).findFirst())
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

    /**
     * A section chosen by the officer alone, outside the playbooks (A2, V60): any law the FIR takes (the national acts or a
     * law of its state) and a section written like 103(1); a reason of 10+ characters; no AI request. Also allowed on a
     * case that protects the victim's identity, since the AI is not used. The same law rule as above: no BNS section for an
     * offence under the IPC, no IPC section for one under the BNS (BNS 358). It is not checked against the sections the
     * app knows (the table is a draft), so the officer's own reading of the Act decides; a wrong one is answered in the
     * case diary, since an added section is kept as written.
     */
    @PostMapping("/own")
    ResponseEntity<Map<String, Object>> addOwn(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Own o) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        if (!modules.acts(team.stateOfFir(firId)).contains(o.act)) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "This law is not one a section of this FIR can be under.");
        String section = o.section.trim();
        if (!SECTION.matcher(section).matches()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Write the section as a number, like 103(1) or 21(b).");
        if (o.reason.trim().length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a reason of at least 10 characters.");
        String law = law(firId);
        if (o.act.equals("BNS") && law.equals("old"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "The offence of this FIR is before 1 July 2024, so the IPC applies, not the BNS (BNS 358). Find the IPC section in the law finder.");
        if (o.act.equals("IPC") && law.equals("new"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "The offence of this FIR is from 1 July 2024, so the BNS applies, not the IPC (BNS 358).");
        try {
            db.sql("""
                    insert into fir_section (fir_id, act, section, chosen_by, added_at, reason)
                    values (?, ?, ?, ?, clock_timestamp(), ?)""")
                    .params(firId, o.act, section, me, o.reason.trim()).update();
        } catch (DuplicateKeyException twice) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This section is already in the FIR.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("act", o.act, "section", section));
    }
}
