package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Search and seizure memo (design board 7, V48), written by the case team once the search is over and frozen when it is
 * saved: the place, the grounds (BNSS 185(1)), the witnesses of the locality (two, or the reason there are fewer, BNSS
 * 103(4)), the audio-video recording (BNSS 105: its SHA-256 and length; the file stays in e-Sakshya) and the items
 * sealed (they become evidence items of the case, BNSS 103(5)). Then the date the recording was sent to the Magistrate
 * (BNSS 105, "without delay"; the app shows the days since the search until it is recorded, it sets no limit of its own).
 * The memo is sent in one request; nothing is stored on the tablet (decision 1 of 2 Nov 2026: online only).
 */
@RestController
@RequestMapping("/api/firs/{firId}/searches")
class SearchController {
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String SHA = "[0-9a-fA-F]{64}";

    record Witness(@NotBlank @Size(min = 2, max = 160) String name, @NotBlank @Size(min = 5, max = 300) String address) {}

    record Recording(@NotBlank @Pattern(regexp = SHA) String sha256, @NotNull Integer seconds, @Size(max = 60) String esakshyaId) {}

    record Item(@NotBlank @Size(max = 40) String label, @NotBlank @Size(max = 500) String description,
                @NotBlank @Pattern(regexp = "physical|electronic|document") String kind, @Size(max = 60) String sealNo,
                @Pattern(regexp = SHA) String sha256) {}

    record NewSearch(@NotBlank @Size(min = 3, max = 300) String place, @NotBlank @Size(min = 10, max = 2000) String grounds,
                     @NotNull OffsetDateTime startedAt, @NotNull OffsetDateTime endedAt, @Size(max = 1000) String noWitnessReason,
                     @Size(max = 20) List<@NotNull @Valid Witness> witnesses, @Size(max = 20) List<@NotNull @Valid Recording> recordings,
                     @Size(max = 100) List<@NotNull @Valid Item> items) {}

    record Forward(@NotBlank String date, @NotBlank @Size(min = 3, max = 160) String to) {}

    private final JdbcClient db;
    private final CaseTeam team;

    SearchController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var out = new ArrayList<Map<String, Object>>();
        for (var s : db.sql("""
                select s.id, s.place, s.grounds, s.started_at, s.ended_at, s.no_witness_reason, s.frozen_at, u.full_name as recorded_by_name,
                       f.forwarded_on, f.forwarded_to, ist_date(now()) - ist_date(s.ended_at) as days_since
                from search_seizure s join app_user u on u.id = s.recorded_by left join search_forward f on f.search_id = s.id
                where s.fir_id = ? order by s.started_at desc, s.id""").param(firId).query().listOfRows()) {
            var row = new LinkedHashMap<String, Object>(s);
            Object id = s.get("id");
            row.put("witnesses", db.sql("select name, address from search_witness where search_id = ? order by name, id").param(id).query().listOfRows());
            row.put("recordings", db.sql("select sha256, seconds, esakshya_id from search_recording where search_id = ? order by id").param(id).query().listOfRows());
            row.put("items", db.sql("select id, label, description, kind, seal_no from evidence_item where search_id = ? order by label").param(id).query().listOfRows());
            out.add(row);
        }
        return out;
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewSearch s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        List<Witness> witnesses = s.witnesses == null ? List.of() : s.witnesses;
        List<Recording> recordings = s.recordings == null ? List.of() : s.recordings;
        List<Item> items = s.items == null ? List.of() : s.items;
        String reason = s.noWitnessReason == null || s.noWitnessReason.isBlank() ? null : s.noWitnessReason.trim();
        if (s.endedAt.isBefore(s.startedAt)) throw bad("The search cannot end before it started.");
        if (s.endedAt.isAfter(OffsetDateTime.now().plusMinutes(5))) throw bad("Write the memo once the search is over: the end cannot be in the future.");
        var received = db.sql("select information_received_at from fir where id = ?").param(firId).query(OffsetDateTime.class).single();
        if (s.startedAt.isBefore(received)) throw bad("A search of this case cannot start before its information was received.");
        if (recordings.isEmpty()) throw bad("Add the audio-video recording of the search (BNSS 105): its SHA-256 and length.");
        for (var r : recordings)
            if (r.seconds < 1 || r.seconds > 86400) throw bad("The length of a recording is 1 second to 24 hours.");
        if (new HashSet<>(recordings.stream().map(r -> r.sha256.toLowerCase()).toList()).size() < recordings.size())
            throw bad("The same recording is listed twice.");
        if (witnesses.size() < 2 && (reason == null || reason.length() < 10))
            throw bad("Name two witnesses of the locality, or write why there are fewer (BNSS 103(4), at least 10 characters).");
        for (var i : items)
            if (i.kind.equals("electronic") && i.sha256 == null) throw bad("An electronic item needs the SHA-256 taken at seizure.");
        UUID id = db.sql("""
                insert into search_seizure (fir_id, place, grounds, started_at, ended_at, no_witness_reason, recorded_by)
                values (?,?,?,?,?,?,?) returning id""")
                .params(firId, s.place.trim(), s.grounds.trim(), s.startedAt, s.endedAt, reason, me).query(UUID.class).single();
        for (var w : witnesses)
            db.sql("insert into search_witness (search_id, fir_id, name, address) values (?,?,?,?)").params(id, firId, w.name.trim(), w.address.trim()).update();
        for (var r : recordings)
            db.sql("insert into search_recording (search_id, fir_id, sha256, seconds, esakshya_id) values (?,?,?,?,?)")
                    .params(id, firId, r.sha256.toLowerCase(), r.seconds, blank(r.esakshyaId)).update();
        String memo = "Search memo " + s.startedAt.atZoneSameInstant(IST).toLocalDate();
        try {
            for (var i : items)
                db.sql("""
                        insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, seal_no, sha256, search_id)
                        values (?,?,?,?,?,?,?,?,?)""")
                        .params(firId, i.label.trim(), i.description.trim(), i.kind, s.endedAt, memo, blank(i.sealNo), i.sha256 == null ? null : i.sha256.toLowerCase(), id).update();
        } catch (DuplicateKeyException taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An evidence item of this case already has one of these labels (or one is listed twice).");
        }
        db.sql("set constraints search_memo_complete immediate").update();   // the database's own check, before the answer
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** BNSS 105: the day the recording was sent to the Magistrate. Once per memo. */
    @PostMapping("/{searchId}/forwarded")
    ResponseEntity<Map<String, Object>> forwarded(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID searchId, @Valid @RequestBody Forward f) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var started = db.sql("select ist_date(started_at) from search_seizure where id = ? and fir_id = ?").params(searchId, firId).query(LocalDate.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such search memo in this case."));
        LocalDate on;
        try {
            on = LocalDate.parse(f.date);
        } catch (DateTimeParseException e) {
            throw bad("The date must be written as YYYY-MM-DD.");
        }
        if (on.isBefore(started)) throw bad("The recording is sent after the search, not before.");
        if (on.isAfter(LocalDate.now(IST))) throw bad("The date it was sent cannot be in the future.");
        try {
            db.sql("insert into search_forward (search_id, fir_id, forwarded_on, forwarded_to, recorded_by) values (?,?,?,?,?)")
                    .params(searchId, firId, on, f.to.trim(), me).update();
        } catch (DuplicateKeyException again) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "It is already recorded when this recording was sent.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("forwarded_on", on));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static String blank(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }
}
