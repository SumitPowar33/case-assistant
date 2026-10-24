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
                     @NotEmpty List<String> grounds, @NotBlank String informedName, String informedContact,
                     @NotNull UUID arrestingOfficer, LocalDate firstRemandOn, @NotBlank String maxPunishment) {}

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

    @PostMapping("/arrests")
    ResponseEntity<Map<String, UUID>> arrest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewArrest a) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        requireRow("person", a.personId, firId);
        return created(db.sql("""
                insert into arrest (person_id, arrested_at, place, grounds, informed_name, informed_contact,
                  arresting_officer, first_remand_on, max_punishment)
                values (?,?,?,?,?,?,?,?,?) returning id""")
                .params(a.personId, a.arrestedAt, a.place, a.grounds.toArray(new String[0]), a.informedName,
                        a.informedContact, a.arrestingOfficer, a.firstRemandOn, a.maxPunishment)
                .query(UUID.class).single());
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

    @GetMapping("/notices")
    List<Map<String, Object>> notices(@PathVariable UUID firId) {
        return db.sql("""
                select n.id, n.kind, n.addressee, array_to_string(n.items_requested, '; ') as items_requested, n.status, n.issued_at, n.reply_due_on,
                  (select count(*) from notice_reply r where r.notice_id = n.id) as replies
                from notice n where n.fir_id = ? order by n.issued_at nulls first, n.id""")
                .param(firId).query().listOfRows();
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
