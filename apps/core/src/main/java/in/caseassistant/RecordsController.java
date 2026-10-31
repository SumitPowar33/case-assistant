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

    record Release(@NotNull LocalDate releasedOn, @NotBlank @Pattern(regexp = "bail|default_bail|other") String basis) {}

    /** A correction restates the facts the 60/90-day limit depends on; it replaces the newest earlier version. */
    record ArrestCorrection(LocalDate firstRemandOn, @NotBlank @Pattern(regexp = "death|life|10_years_or_more|less_than_10_years") String maxPunishment,
                            LocalDate releasedOn, @Pattern(regexp = "bail|default_bail|other") String releaseBasis,
                            @NotBlank String reason) {}

    /** A correction of the memo restates place, grounds told and the person informed; it replaces the newest version. */
    record MemoCorrection(@NotBlank String place, @NotEmpty List<@NotBlank String> grounds, @NotBlank String informedName,
                          String informedContact, @NotBlank String reason) {}

    /** A correction of the time of arrest; the newest counts. The IST day of it is what remand and release are checked against. */
    record TimeCorrection(@NotNull OffsetDateTime arrestedAt, @NotBlank String reason) {}

    record ChargesheetCorrection(@NotNull LocalDate filedOn, @NotBlank @Size(max = 200) String court,
                                 @NotBlank @Size(max = 60) String reportNo, @NotEmpty List<@NotNull UUID> accusedIds,
                                 @NotBlank String reason) {}

    record NewChargesheet(@NotNull LocalDate filedOn, @NotBlank @Size(max = 200) String court,
                          @NotBlank @Size(max = 60) String reportNo, @NotEmpty List<@NotNull UUID> accusedIds) {}

    record NewClosure(@NotNull LocalDate filedOn, @NotBlank @Size(max = 200) String court, @NotBlank @Size(max = 60) String reportNo,
                      @NotBlank @Pattern(regexp = "untraced|insufficient_evidence|false_complaint|civil_nature|other") String ground,
                      @NotBlank @Size(min = 10, max = 2000) String reason, LocalDate informantInformedOn) {}

    record ClosureCorrection(@NotNull LocalDate filedOn, @NotBlank @Size(max = 200) String court, @NotBlank @Size(max = 60) String reportNo,
                             @NotBlank @Pattern(regexp = "untraced|insufficient_evidence|false_complaint|civil_nature|other") String ground,
                             @NotBlank @Size(min = 10, max = 2000) String reason, LocalDate informantInformedOn,
                             @NotBlank String correctionReason) {}

    record ClosureDecision(@NotBlank @Pattern(regexp = "accepted|further_investigation") String decision, @NotNull LocalDate decidedOn,
                           @Size(max = 2000) String note) {}

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
            case "chargesheet" -> "select exists (select 1 from chargesheet where id = ? and fir_id = ?)";
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
        // a slipped year (2027 for 2026) would push the 60/90-day limit far out without anyone noticing
        if (remand != null && remand.isAfter(LocalDate.now(IST)))
            badRequest("The first remand cannot be after today.");
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
                select a.id, a.person_id, p.label as person_label, c.arrested_at, c.time_correction_id is not null as time_corrected, m.place, to_json(m.grounds)::text as grounds,
                  m.informed_name, m.informed_contact, m.memo_correction_id is not null as memo_corrected, u.full_name as arresting_officer_name, c.max_punishment, c.first_remand_on,
                  arrest_last_day(a.id) as chargesheet_last_day, earlier_custody_days(a.id) as earlier_custody_days,
                  r.full_name as remand_recorded_by_name, c.released_on, c.release_basis,
                  chargesheet_filed_for(a.person_id) as chargesheet_filed_on, c.correction_id is not null as corrected,
                  c.arrested_at + interval '24 hours' as produce_by,
                  coalesce(c.first_remand_on > ist_date(c.arrested_at + interval '24 hours'), false) as remand_after_24_hours
                from arrest a join arrest_current c on c.id = a.id join arrest_memo_current m on m.id = a.id join person p on p.id = a.person_id
                  left join app_user u on u.id = a.arresting_officer left join app_user r on r.id = a.remand_recorded_by
                where p.fir_id = ? order by c.arrested_at, a.id""")
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
        var arrestedAt = db.sql("select a.arrested_at from arrest_current a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(OffsetDateTime.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        checkRemand(f.firstRemandOn, arrestedAt);
        int n = db.sql("""
                update arrest set first_remand_on = ?, remand_recorded_by = ?, remand_recorded_at = now()
                where id = ? and first_remand_on is null
                and not exists (select 1 from arrest_correction where arrest_id = arrest.id)""")
                .params(f.firstRemandOn, me, arrestId).update();
        if (n == 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                "The first remand of this arrest is already recorded; to fix it, add a correction.");
        return ResponseEntity.noContent().build();
    }

    private static LocalDate todayIst() {
        return LocalDate.now(IST);
    }

    /**
     * Release from custody (bail, default bail under BNSS 187(3), or otherwise), recorded once. From then on the
     * 60/90-day custody limit no longer runs for this accused.
     */
    @PostMapping("/arrests/{arrestId}/release")
    ResponseEntity<Void> release(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @PathVariable UUID arrestId,
                                 @Valid @RequestBody Release r) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var arrestedAt = db.sql("select a.arrested_at from arrest_current a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(OffsetDateTime.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        if (r.releasedOn.isBefore(arrestedAt.atZoneSameInstant(IST).toLocalDate())) badRequest("The release cannot be before the day of arrest.");
        if (r.releasedOn.isAfter(todayIst())) badRequest("The release date cannot be in the future.");
        int n = db.sql("""
                update arrest set released_on = ?, release_basis = ?, release_recorded_by = ?, release_recorded_at = now()
                where id = ? and released_on is null
                and not exists (select 1 from arrest_correction where arrest_id = arrest.id)""").params(r.releasedOn, r.basis, me, arrestId).update();
        if (n == 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                "The release from this arrest is already recorded; to fix it, add a correction.");
        return ResponseEntity.noContent().build();
    }

    /**
     * A chargesheet (police report, BNSS 193(3)) filed in court, naming the accused it covers. Kept as written; a
     * supplementary chargesheet is a new one. It ends the custody limit for the accused it names and the BNSS 193(2)
     * two-month limit of the case.
     */
    @PostMapping("/chargesheets")
    @org.springframework.transaction.annotation.Transactional
    ResponseEntity<Map<String, UUID>> chargesheet(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewChargesheet c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireFir(firId);
        if (c.filedOn.isAfter(todayIst())) badRequest("The filing date cannot be in the future.");
        var registered = db.sql("select ist_date(registered_at) from fir where id = ?").param(firId).query(LocalDate.class).single();
        if (c.filedOn.isBefore(registered)) badRequest("A chargesheet cannot be filed before the FIR was registered.");
        return created(insertChargesheet(me, firId, c.filedOn, c.court, c.reportNo, c.accusedIds, null, null));
    }

    private UUID insertChargesheet(UUID me, UUID firId, LocalDate filedOn, String court, String reportNo, List<UUID> accused,
                                   UUID supersedes, String reason) {
        for (UUID p : accused) {
            requireRow("person", p, firId);
            if (!db.sql("select role = 'accused' from person where id = ?").param(p).query(Boolean.class).single())
                badRequest("A chargesheet names only accused.");
        }
        UUID id = db.sql("""
                insert into chargesheet (fir_id, filed_on, court, report_no, recorded_by, supersedes, correction_reason)
                values (?,?,?,?,?,?,?) returning id""")
                .params(firId, filedOn, court.trim(), reportNo.trim(), me, supersedes, reason == null ? null : reason.trim())
                .query(UUID.class).single();
        for (UUID p : new java.util.LinkedHashSet<>(accused))
            db.sql("insert into chargesheet_accused (chargesheet_id, person_id) values (?,?)").params(id, p).update();
        return id;
    }

    /**
     * Fixes a wrong chargesheet entry (court, number, date or the accused it names): a new chargesheet that replaces
     * the current one, with a written reason. The old one stays on record; the deadlines use only the new one.
     */
    @PostMapping("/chargesheets/{chargesheetId}/corrections")
    @org.springframework.transaction.annotation.Transactional
    ResponseEntity<Map<String, UUID>> correctChargesheet(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId,
                                                         @PathVariable UUID chargesheetId, @Valid @RequestBody ChargesheetCorrection c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireRow("chargesheet", chargesheetId, firId);
        requireReason(c.reason);
        if (c.filedOn.isAfter(todayIst())) badRequest("The filing date cannot be in the future.");
        if (db.sql("select exists (select 1 from chargesheet where supersedes = ?)").param(chargesheetId).query(Boolean.class).single())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                    "This chargesheet has already been replaced; correct the newest one.");
        return created(insertChargesheet(me, firId, c.filedOn, c.court, c.reportNo, c.accusedIds, chargesheetId, c.reason));
    }

    private static void requireReason(String reason) {
        if (reason.trim().length() < 10) badRequest("Say why, in at least 10 characters.");
    }

    /**
     * Fixes a wrong remand date, punishment class or release of an arrest. The arrest memo itself stays as written; a
     * correction restates the four facts the custody limit uses, with a written reason, and the newest one counts.
     * Leaving the release out says the person was not released.
     */
    @PostMapping("/arrests/{arrestId}/corrections")
    ResponseEntity<Map<String, UUID>> correctArrest(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId,
                                                    @PathVariable UUID arrestId, @Valid @RequestBody ArrestCorrection c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        var arrestedAt = db.sql("select a.arrested_at from arrest_current a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(OffsetDateTime.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        requireReason(c.reason);
        checkRemand(c.firstRemandOn, arrestedAt);
        // a recorded remand can be corrected but not cleared: clearing it would silently drop the BNSS 187(3) limit
        if (c.firstRemandOn == null && db.sql("select first_remand_on is not null from arrest_current where id = ?").param(arrestId).query(Boolean.class).single())
            badRequest("A first remand is on record; a correction must restate its date.");
        if ((c.releasedOn == null) != (c.releaseBasis == null)) badRequest("A release needs both its date and how it happened.");
        if (c.releasedOn != null) {
            if (c.releasedOn.isBefore(arrestedAt.atZoneSameInstant(IST).toLocalDate())) badRequest("The release cannot be before the day of arrest.");
            if (c.releasedOn.isAfter(todayIst())) badRequest("The release date cannot be in the future.");
        }
        UUID newest = db.sql("select id from arrest_correction c where arrest_id = ? and not exists (select 1 from arrest_correction n where n.supersedes = c.id)")
                .param(arrestId).query(UUID.class).optional().orElse(null);
        return created(db.sql("""
                insert into arrest_correction (arrest_id, supersedes, first_remand_on, max_punishment, released_on, release_basis, reason, recorded_by)
                values (?,?,?,?,?,?,?,?) returning id""")
                .params(arrestId, newest, c.firstRemandOn, c.maxPunishment, c.releasedOn, c.releaseBasis, c.reason.trim(), me)
                .query(UUID.class).single());
    }

    /** Every correction of every arrest in this case, oldest first, so the history can be read. */
    @GetMapping("/arrests/corrections")
    List<Map<String, Object>> arrestCorrections(@PathVariable UUID firId) {
        requireFir(firId);
        return db.sql("""
                select c.id, c.arrest_id, c.first_remand_on, c.max_punishment, c.released_on, c.release_basis, c.reason,
                  c.recorded_at, u.full_name as recorded_by_name
                from arrest_correction c join arrest a on a.id = c.arrest_id join person p on p.id = a.person_id
                  join app_user u on u.id = c.recorded_by
                where p.fir_id = ? order by c.recorded_at, c.id""").param(firId).query().listOfRows();
    }

    /**
     * Fixes a wrong place, grounds or informed person on the arrest memo. The memo stays as written; the correction
     * restates the three, with a written reason, and the newest one counts. The person arrested cannot be corrected
     * here; the time of arrest has its own correction.
     */
    @PostMapping("/arrests/{arrestId}/memo-corrections")
    ResponseEntity<Map<String, UUID>> correctMemo(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId,
                                                  @PathVariable UUID arrestId, @Valid @RequestBody MemoCorrection c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        db.sql("select 1 from arrest a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(Integer.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        requireReason(c.reason);
        UUID newest = db.sql("select id from arrest_memo_correction c where arrest_id = ? and not exists (select 1 from arrest_memo_correction n where n.supersedes = c.id)")
                .param(arrestId).query(UUID.class).optional().orElse(null);
        return ResponseEntity.status(201).body(Map.of("id", db.sql("""
                insert into arrest_memo_correction (arrest_id, supersedes, place, grounds, informed_name, informed_contact, reason, recorded_by)
                values (?,?,?,?,?,?,?,?) returning id""")
                .params(arrestId, newest, c.place.trim(), c.grounds.stream().map(String::trim).toArray(String[]::new), c.informedName.trim(),
                        c.informedContact, c.reason.trim(), me)
                .query(UUID.class).single()));
    }

    /**
     * Fixes a wrong time of arrest. The memo keeps the time as written; the newest correction counts. It cannot be in
     * the future, and its IST day cannot be after a first remand or release already on record (the database refuses it).
     */
    @PostMapping("/arrests/{arrestId}/time-corrections")
    ResponseEntity<Map<String, UUID>> correctTime(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId,
                                                  @PathVariable UUID arrestId, @Valid @RequestBody TimeCorrection c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        db.sql("select 1 from arrest a join person p on p.id = a.person_id where a.id = ? and p.fir_id = ?")
                .params(arrestId, firId).query(Integer.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        requireReason(c.reason);
        if (c.arrestedAt.isAfter(OffsetDateTime.now().plusMinutes(5))) badRequest("The time of arrest cannot be in the future.");
        UUID newest = db.sql("select id from arrest_time_correction c where arrest_id = ? and not exists (select 1 from arrest_time_correction n where n.supersedes = c.id)")
                .param(arrestId).query(UUID.class).optional().orElse(null);
        return created(db.sql("""
                insert into arrest_time_correction (arrest_id, supersedes, arrested_at, reason, recorded_by)
                values (?,?,?,?,?) returning id""")
                .params(arrestId, newest, c.arrestedAt, c.reason.trim(), me).query(UUID.class).single());
    }

    /** Every correction of the time of arrest in this case, oldest first. */
    @GetMapping("/arrests/time-corrections")
    List<Map<String, Object>> timeCorrections(@PathVariable UUID firId) {
        requireFir(firId);
        return db.sql("""
                select c.id, c.arrest_id, c.arrested_at, c.reason, c.recorded_at, u.full_name as recorded_by_name
                from arrest_time_correction c join arrest a on a.id = c.arrest_id join person p on p.id = a.person_id
                  join app_user u on u.id = c.recorded_by
                where p.fir_id = ? order by c.recorded_at, c.id""").param(firId).query().listOfRows();
    }

    /** Every memo correction in this case, oldest first. The informed person is private: only the case team sees them. */
    @GetMapping("/arrests/memo-corrections")
    List<Map<String, Object>> memoCorrections(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        requireFir(firId);
        boolean onTeam = team.includes(CaseTeam.user(jwt), firId);
        return db.sql("""
                select c.id, c.arrest_id, c.place, to_json(c.grounds)::text as grounds, c.informed_name, c.informed_contact,
                  c.reason, c.recorded_at, u.full_name as recorded_by_name
                from arrest_memo_correction c join arrest a on a.id = c.arrest_id join person p on p.id = a.person_id
                  join app_user u on u.id = c.recorded_by
                where p.fir_id = ? order by c.recorded_at, c.id""").param(firId).query().listOfRows().stream().map(row -> {
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

    /**
     * The closure (final) report: the investigation ends without a chargesheet. Once per case, kept as written. It ends the
     * BNSS 193(2) limit but not the custody limit. It cannot be recorded while a current chargesheet exists.
     */
    @PostMapping("/closure-report")
    @org.springframework.transaction.annotation.Transactional
    ResponseEntity<Map<String, UUID>> closure(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody NewClosure c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireFir(firId);
        checkClosureDates(firId, c.filedOn, c.informantInformedOn);
        if (db.sql("select exists (select 1 from chargesheet c where c.fir_id = ? and not exists (select 1 from chargesheet n where n.supersedes = c.id))")
                .param(firId).query(Boolean.class).single())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                    "A chargesheet is already filed in this case; a closure report cannot be recorded with it.");
        try {
            return created(db.sql("""
                    insert into closure_report (fir_id, filed_on, court, report_no, ground, reason, informant_informed_on, recorded_by)
                    values (?,?,?,?,?,?,?,?) returning id""")
                    .params(firId, c.filedOn, c.court.trim(), c.reportNo.trim(), c.ground, c.reason.trim(), c.informantInformedOn, me)
                    .query(UUID.class).single());
        } catch (DataIntegrityViolationException e) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT, "A closure report is already recorded for this case.");
        }
    }

    private void checkClosureDates(UUID firId, LocalDate filedOn, LocalDate informedOn) {
        if (filedOn.isAfter(todayIst())) badRequest("The filing date cannot be in the future.");
        if (informedOn != null && (informedOn.isBefore(filedOn) || informedOn.isAfter(todayIst())))
            badRequest("The informant must be told on or after the filing day, and not in the future.");
        var registered = db.sql("select ist_date(registered_at) from fir where id = ?").param(firId).query(LocalDate.class).single();
        if (filedOn.isBefore(registered)) badRequest("A closure report cannot be filed before the FIR was registered.");
    }

    private UUID closureId(UUID firId) {
        return db.sql("select id from closure_report where fir_id = ?").param(firId).query(UUID.class).optional()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND, "No closure report in this case."));
    }

    /** The closure report as it stands now (newest correction counts), with the Magistrate's decision if recorded. */
    @GetMapping("/closure-report")
    List<Map<String, Object>> closureReport(@PathVariable UUID firId) {
        requireFir(firId);
        return db.sql("""
                select r.id, c.filed_on, c.court, c.report_no, c.ground, c.reason, c.informant_informed_on, c.corrected,
                  u.full_name as recorded_by_name, d.decision, d.decided_on, d.note as decision_note
                from closure_report r join closure_report_current c on c.id = r.id join app_user u on u.id = r.recorded_by
                  left join closure_decision d on d.closure_id = r.id
                where r.fir_id = ?""")
                .param(firId).query().listOfRows();
    }

    /** A correction restates the whole report with a written reason; the newest counts and the older ones stay. */
    @PostMapping("/closure-report/corrections")
    @org.springframework.transaction.annotation.Transactional
    ResponseEntity<Map<String, UUID>> correctClosure(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody ClosureCorrection c) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireFir(firId);
        UUID closure = closureId(firId);
        requireReason(c.correctionReason);
        checkClosureDates(firId, c.filedOn, c.informantInformedOn);
        UUID newest = db.sql("select id from closure_correction c where closure_id = ? and not exists (select 1 from closure_correction n where n.supersedes = c.id)")
                .param(closure).query(UUID.class).optional().orElse(null);
        return created(db.sql("""
                insert into closure_correction (closure_id, supersedes, filed_on, court, report_no, ground, reason, informant_informed_on, correction_reason, recorded_by)
                values (?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(closure, newest, c.filedOn, c.court.trim(), c.reportNo.trim(), c.ground, c.reason.trim(), c.informantInformedOn,
                        c.correctionReason.trim(), me).query(UUID.class).single());
    }

    /** Every correction of the closure report, oldest first. */
    @GetMapping("/closure-report/corrections")
    List<Map<String, Object>> closureCorrections(@PathVariable UUID firId) {
        requireFir(firId);
        return db.sql("""
                select c.id, c.filed_on, c.court, c.report_no, c.ground, c.reason, c.informant_informed_on, c.correction_reason,
                  c.recorded_at, u.full_name as recorded_by_name
                from closure_correction c join closure_report r on r.id = c.closure_id join app_user u on u.id = c.recorded_by
                where r.fir_id = ? order by c.recorded_at, c.id""").param(firId).query().listOfRows();
    }

    /**
     * The Magistrate's decision on the closure report: accepted, or further investigation ordered. Recorded once, kept as written.
     * It changes no deadline; a chargesheet may still be recorded afterwards.
     */
    @PostMapping("/closure-report/decision")
    ResponseEntity<Map<String, UUID>> closureDecision(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody ClosureDecision d) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        requireFir(firId);
        UUID closure = closureId(firId);
        var filed = db.sql("select filed_on from closure_report_current where id = ?").param(closure).query(LocalDate.class).single();
        if (d.decidedOn.isAfter(todayIst()) || d.decidedOn.isBefore(filed)) badRequest("The decision date must be between the filing day and today.");
        try {
            return created(db.sql("""
                    insert into closure_decision (closure_id, decision, decided_on, note, recorded_by) values (?,?,?,?,?) returning id""")
                    .params(closure, d.decision, d.decidedOn, d.note == null || d.note.isBlank() ? null : d.note.trim(), me)
                    .query(UUID.class).single());
        } catch (DataIntegrityViolationException e) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT, "A decision is already recorded for this closure report.");
        }
    }

    @GetMapping("/chargesheets")
    List<Map<String, Object>> chargesheets(@PathVariable UUID firId) {
        requireFir(firId);
        return db.sql("""
                select c.id, c.filed_on, c.court, c.report_no, u.full_name as recorded_by_name, c.supersedes, c.correction_reason,
                  exists (select 1 from chargesheet n where n.supersedes = c.id) as replaced,
                  array_to_string(array(select p.label from chargesheet_accused ca join person p on p.id = ca.person_id
                    where ca.chargesheet_id = c.id order by p.label), ', ') as accused
                from chargesheet c join app_user u on u.id = c.recorded_by where c.fir_id = ? order by c.filed_on, c.recorded_at""")
                .param(firId).query().listOfRows();
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
     * `items_missing` lists what is still outstanding, so the officer knows what to chase (nothing once the notice is
     * complete: an imported old notice marked replied has no reply rows to tick items off).
     */
    @GetMapping("/notices")
    List<Map<String, Object>> notices(@PathVariable UUID firId) {
        return db.sql("""
                select n.id, n.kind, n.addressee, to_json(n.items_requested)::text as items_requested,
                  to_json(array(select i from unnest(n.items_requested) i where n.status <> 'complete' and not exists (
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
