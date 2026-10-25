package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Creates people, arrests, evidence items, notices, notice replies and BSA 63(4) certificates.
 * The database CHECK constraints hold the rules (e.g. a sent notice needs a signer, an electronic
 * item needs a SHA-256); a violation comes back as 400. Only the case team adds records. A sent notice is
 * signed by the signed-in officer; the AI only drafts (ai_request_id records the audit-log request).
 */
@RestController
@RequestMapping("/api/firs/{firId}")
class RecordsController {
    record NewPerson(@NotBlank String role, String label, boolean identityKnown, String fullName, String alias,
                     String parentage, Integer ageYears, String gender, String phone, String addressPresent,
                     String addressPermanent, String nationality, boolean identityMasked) {}

    record NewArrest(@NotNull UUID personId, @NotNull OffsetDateTime arrestedAt, @NotBlank String place,
                     @NotEmpty List<@NotBlank String> grounds, @NotBlank String informedName, String informedContact,
                     LocalDate firstRemandOn, @NotBlank String maxPunishment) {}

    record FirstRemand(@NotNull LocalDate firstRemandOn) {}

    record NewEvidence(@NotBlank String label, @NotBlank String description, @NotBlank String kind,
                       @NotNull OffsetDateTime seizedAt, @NotBlank String seizureMemo, String esakshyaId,
                       String sealNo, String sha256) {}

    record NewNotice(@NotBlank String kind, @NotBlank String addressee, List<String> itemsRequested,
                     @NotBlank String body, UUID aiRequestId, OffsetDateTime issuedAt,
                     LocalDate replyDueOn, @Pattern(regexp = "draft|sent") String status) {}

    record Reply(@NotNull OffsetDateTime receivedAt, @NotBlank String channel, String checksJson) {}

    record Certificate(@NotBlank String part, @NotBlank String signerName, @NotBlank String deviceType,
                       String deviceIds, @NotBlank String hashAlgo, @NotBlank String hashValue,
                       @NotNull OffsetDateTime signedAt, @NotBlank String place, UUID supersedes,
                       String correctionReason) {}

    private final JdbcClient db;
    private final CaseTeam team;

    RecordsController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    private void requireFir(UUID firId) {
        if (!db.sql("select exists (select 1 from fir where id = ?)").param(firId).query(Boolean.class).single())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private void requireRow(String table, UUID id, UUID firId) {
        String sql = switch (table) {
            case "person" -> "select exists (select 1 from person where id = ? and fir_id = ?)";
            case "notice" -> "select exists (select 1 from notice where id = ? and fir_id = ?)";
            default -> "select exists (select 1 from evidence_item where id = ? and fir_id = ?)";
        };
        if (!db.sql(sql).params(id, firId).query(Boolean.class).single())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private static ResponseEntity<Map<String, UUID>> created(UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/people")
    ResponseEntity<Map<String, UUID>> person(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewPerson p) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireFir(firId);
        return created(db.sql("""
                insert into person (fir_id, role, label, identity_known, full_name, alias, parentage, age_years, gender,
                  phone, address_present, address_permanent, nationality, identity_masked)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(firId, p.role, p.label, p.identityKnown, p.fullName, p.alias, p.parentage, p.ageYears,
                        p.gender, p.phone, p.addressPresent, p.addressPermanent, p.nationality, p.identityMasked)
                .query(UUID.class).single());
    }

    private static final java.time.ZoneId IST = java.time.ZoneId.of("Asia/Kolkata");

    private static void badRequest(String message) {
        throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    /** The BNSS 187(3) 60/90 days run from the first remand, so it can never be before the arrest day (IST). */
    private static void checkRemand(LocalDate remand, OffsetDateTime arrestedAt) {
        if (remand != null && remand.isBefore(arrestedAt.atZoneSameInstant(IST).toLocalDate()))
            badRequest("The first remand cannot be before the day of arrest.");
    }

    /**
     * Arrest memo (BNSS 35; grounds told to the person, BNSS 47; a relative or friend informed, BNSS 48).
     * The signed-in officer records it and is named as the arresting officer. Only an accused of this case can be
     * arrested; the time cannot be in the future. The memo is kept as written (database trigger, V11).
     */
    @PostMapping("/arrests")
    ResponseEntity<Map<String, UUID>> arrest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewArrest a) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireRow("person", a.personId, firId);
        if (!db.sql("select role = 'accused' from person where id = ?").param(a.personId).query(Boolean.class).single())
            badRequest("Only an accused can be arrested. Change the person's role first.");
        if (a.arrestedAt.isAfter(OffsetDateTime.now().plusMinutes(5))) badRequest("The time of arrest cannot be in the future.");
        checkRemand(a.firstRemandOn, a.arrestedAt);
        return created(db.sql("""
                insert into arrest (person_id, arrested_at, place, grounds, informed_name, informed_contact,
                  arresting_officer, first_remand_on, max_punishment, recorded_by, remand_recorded_by, remand_recorded_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(a.personId, a.arrestedAt, a.place, a.grounds.stream().map(String::trim).toArray(String[]::new), a.informedName,
                        a.informedContact, me, a.firstRemandOn, a.maxPunishment, me,
                        a.firstRemandOn == null ? null : me, a.firstRemandOn == null ? null : OffsetDateTime.now())
                .query(UUID.class).single());
    }

    /**
     * Arrests in this case, oldest first, each with its own BNSS 187(3) last day once the first remand is known.
     * The relative or friend who was informed is a private person: their name and contact go only to the case team.
     */
    @GetMapping("/arrests")
    List<Map<String, Object>> arrests(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        requireFir(firId);
        boolean onTeam = team.includes(CaseTeam.user(jwt), firId);
        return db.sql("""
                select a.id, a.person_id, p.label as person_label, a.arrested_at, a.place, to_json(a.grounds)::text as grounds,
                  a.informed_name, a.informed_contact, u.full_name as arresting_officer_name, a.max_punishment, a.first_remand_on,
                  case when a.first_remand_on is not null then chargesheet_last_day(a.first_remand_on, a.max_punishment) end as chargesheet_last_day,
                  r.full_name as remand_recorded_by_name
                from arrest a join person p on p.id = a.person_id
                  join app_user u on u.id = a.arresting_officer left join app_user r on r.id = a.remand_recorded_by
                where p.fir_id = ? order by a.arrested_at, a.id""")
                .param(firId).query().listOfRows().stream().map(row -> {
                    Map<String, Object> out = new java.util.LinkedHashMap<>(row);
                    try {
                        out.put("grounds", JSON.readValue((String) row.get("grounds"), List.class));
                    } catch (java.io.IOException e) {
                        throw new IllegalStateException(e);
                    }
                    if (!onTeam) {
                        out.put("informed_name", null);
                        out.put("informed_contact", null);
                    }
                    return out;
                }).toList();
    }

    /** The first remand is usually recorded the day after the arrest memo. It can be recorded once and is then fixed. */
    @PostMapping("/arrests/{arrestId}/first-remand")
    ResponseEntity<Void> firstRemand(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID arrestId,
                                     @Valid @RequestBody FirstRemand f) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var arrestedAt = db.sql("select a.arrested_at from arrest a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(OffsetDateTime.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        checkRemand(f.firstRemandOn, arrestedAt);
        int n = db.sql("update arrest set first_remand_on = ?, remand_recorded_by = ?, remand_recorded_at = now() where id = ? and first_remand_on is null")
                .params(f.firstRemandOn, me, arrestId).update();
        if (n == 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                "The first remand of this arrest is already recorded; it cannot be changed.");
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/evidence")
    ResponseEntity<Map<String, UUID>> evidence(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewEvidence e) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireFir(firId);
        return created(db.sql("""
                insert into evidence_item (fir_id, label, description, kind, seized_at, seizure_memo, esakshya_id, seal_no, sha256)
                values (?,?,?,?,?,?,?,?,?) returning id""")
                .params(firId, e.label, e.description, e.kind, e.seizedAt, e.seizureMemo, e.esakshyaId, e.sealNo,
                        e.sha256 == null ? null : e.sha256.toLowerCase())
                .query(UUID.class).single());
    }

    /**
     * Notices with the items asked for and, for each, whether some reply has brought it (ticked present).
     * `items_missing` lists what is still outstanding, so the officer knows what to chase.
     */
    @GetMapping("/notices")
    List<Map<String, Object>> notices(@PathVariable UUID firId) {
        return db.sql("""
                select n.id, n.kind, n.addressee, to_json(n.items_requested)::text as items_requested,
                  to_json(array(select i from unnest(n.items_requested) i where not exists (
                    select 1 from notice_reply r, jsonb_array_elements(r.checks) x
                    where r.notice_id = n.id and x->>'item' = i and (x->>'present')::boolean)))::text as items_missing,
                  n.status, n.issued_at, n.reply_due_on, u.full_name as signed_by_name, n.ai_request_id is not null as ai_drafted,
                  (select count(*) from notice_reply r where r.notice_id = n.id) as replies
                from notice n left join app_user u on u.id = n.signed_by
                where n.fir_id = ? order by n.issued_at nulls first, n.id""")
                .param(firId).query().listOfRows().stream().map(RecordsController::jsonLists).toList();
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    /** The two item lists come from PostgreSQL as JSON text; send them as real lists. */
    private static Map<String, Object> jsonLists(Map<String, Object> row) {
        var out = new java.util.LinkedHashMap<>(row);
        for (String k : List.of("items_requested", "items_missing")) {
            try {
                out.put(k, JSON.readValue((String) row.get(k), List.class));
            } catch (java.io.IOException e) {
                throw new IllegalStateException(e);
            }
        }
        return out;
    }

    record Send(@NotNull OffsetDateTime issuedAt, LocalDate replyDueOn) {}

    /** A draft becomes a sent notice, signed by the signed-in officer. Only drafts can be sent. */
    @PostMapping("/notices/{noticeId}/send")
    ResponseEntity<Void> sendNotice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID noticeId,
                                    @Valid @RequestBody Send s) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireRow("notice", noticeId, firId);
        int n = db.sql("update notice set status = 'sent', signed_by = ?, issued_at = ?, reply_due_on = ? where id = ? and status = 'draft'")
                .params(me, s.issuedAt, s.replyDueOn, noticeId).update();
        if (n == 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT, "Only a draft notice can be sent.");
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notices")
    ResponseEntity<Map<String, UUID>> notice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewNotice n) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireFir(firId);
        return created(db.sql("""
                insert into notice (fir_id, kind, addressee, items_requested, body, ai_request_id, signed_by,
                  issued_at, reply_due_on, status)
                values (?,?,?,?,?,?,?,?,?, coalesce(?, 'draft')) returning id""")
                .params(firId, n.kind, n.addressee,
                        (n.itemsRequested == null ? List.<String>of() : n.itemsRequested).toArray(new String[0]),
                        n.body, n.aiRequestId, "sent".equals(n.status) ? CaseTeam.user(jwt) : null, n.issuedAt, n.replyDueOn, n.status)
                .query(UUID.class).single());
    }

    /**
     * Logs a reply and marks the notice complete or reply_incomplete, from the checks the officer ticked.
     * With items requested (BNSS 94), complete means every requested item has been ticked present in some
     * reply so far. Without items, complete means this reply has at least one check and all are present.
     * An empty or partial check list never closes a notice.
     */
    @PostMapping("/notices/{noticeId}/replies")
    @org.springframework.transaction.annotation.Transactional
    ResponseEntity<Map<String, Object>> reply(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID noticeId,
                                              @Valid @RequestBody Reply r) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireRow("notice", noticeId, firId);
        String noticeStatus = db.sql("select status from notice where id = ?").param(noticeId).query(String.class).single();
        if (noticeStatus.equals("draft") || noticeStatus.equals("cancelled"))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                    "This notice was never sent (" + noticeStatus + "); a reply cannot be logged against it.");
        String checks = r.checksJson == null ? "[]" : r.checksJson;
        db.sql("insert into notice_reply (notice_id, received_at, channel, checks) values (?,?,?,?::jsonb)")
                .params(noticeId, r.receivedAt, r.channel, checks).update();
        boolean allPresent = db.sql("""
                select case when cardinality(n.items_requested) > 0
                  then not exists (select 1 from unnest(n.items_requested) i where not exists (
                         select 1 from notice_reply r, jsonb_array_elements(r.checks) x
                         where r.notice_id = n.id and x->>'item' = i and (x->>'present')::boolean))
                  else jsonb_array_length(c.j) > 0
                       and not exists (select 1 from jsonb_array_elements(c.j) x where (x->>'present')::boolean is not true)
                  end
                from notice n, (select ?::jsonb as j) c where n.id = ?""")
                .params(checks, noticeId).query(Boolean.class).single();
        String status = allPresent ? "complete" : "reply_incomplete";
        db.sql("update notice set status = ? where id = ? and status in ('sent','reply_incomplete')")
                .params(status, noticeId).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("replyComplete", allPresent));
    }

    /** All 63(4) certificates of an item, oldest first; `replaced_by` is set on those a correction replaced. */
    @GetMapping("/evidence/{itemId}/certificates")
    List<Map<String, Object>> certificates(@PathVariable UUID firId, @PathVariable UUID itemId) {
        requireRow("evidence", itemId, firId);
        return db.sql("""
                select c.id, c.part, c.signer_name, c.device_type, c.device_ids, c.hash_algo, c.hash_value, c.signed_at, c.place,
                  c.supersedes, c.correction_reason, (select n.id from certificate_63_4 n where n.supersedes = c.id) as replaced_by
                from certificate_63_4 c where c.item_id = ? order by c.signed_at, c.id""").param(itemId).query().listOfRows();
    }

    @PostMapping("/evidence/{itemId}/certificates")
    /** Certificates are never edited; a correction is a new certificate that names the one it replaces, with a reason. */
    ResponseEntity<Map<String, UUID>> certificate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID itemId, @Valid @RequestBody Certificate c) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireRow("evidence", itemId, firId);
        return created(db.sql("""
                insert into certificate_63_4 (item_id, part, signer_name, device_type, device_ids, hash_algo, hash_value,
                  signed_at, place, supersedes, correction_reason) values (?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(itemId, c.part, c.signerName, c.deviceType, c.deviceIds, c.hashAlgo, c.hashValue, c.signedAt, c.place,
                        c.supersedes, c.correctionReason)
                .query(UUID.class).single());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this entry (a rule or a duplicate)."));
    }
}
