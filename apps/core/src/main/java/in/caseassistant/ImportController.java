package in.caseassistant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Loads existing FIRs from a CSV file in four deliberate steps: stage and check the file, look at the result, approve it
 * (with the authority for the load), and, if it was wrong, undo it while nobody has built on the imported records.
 * Only records are added, an existing FIR is never changed. Needs "import.run" at the station (see {@link CaseTeam#canAt}).
 */
@RestController
@RequestMapping("/api/imports")
class ImportController {
    static final int MAX_CHARS = 5_000_000;
    static final int MAX_ROWS = 5000;
    static final int PAGE = 500;

    record Inspect(@NotBlank String profile, @NotBlank @Size(max = MAX_CHARS) String csv) {}

    record Stage(@NotNull UUID stationId, @NotBlank String profile, @NotBlank @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,4})?") String complaintLanguage,
                 @NotBlank @Size(max = 200) String filename, @NotBlank @Size(max = MAX_CHARS) String csv, Map<String, String> mapping) {}

    record Approve(@NotBlank @Size(min = 10, max = 500) String authority) {}

    record Undo(@NotBlank @Size(min = 10, max = 2000) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final FirImport rules;
    private final ArrestImport arrests;
    private final ChargesheetImport chargesheets;
    private final Policies policies;
    private final ObjectMapper json;
    private List<String[]> childLinks;

    ImportController(JdbcClient db, CaseTeam team, FirImport rules, ArrestImport arrests, ChargesheetImport chargesheets, Policies policies, ObjectMapper json) {
        this.db = db;
        this.chargesheets = chargesheets;
        this.policies = policies;
        this.arrests = arrests;
        this.team = team;
        this.rules = rules;
        this.json = json;
    }

    @GetMapping("/profiles")
    List<Map<String, Object>> profiles(@AuthenticationPrincipal Jwt jwt) {
        requireImporter(CaseTeam.user(jwt));
        return rules.profileList();
    }

    /** Stateless: reads the header line and suggests which file column feeds which field. Stores nothing. */
    @PostMapping("/inspect")
    Map<String, Object> inspect(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Inspect in) {
        requireImporter(CaseTeam.user(jwt));
        requireProfile(in.profile);
        var rows = read(in.csv);
        return Map.of("headers", rows.get(0), "suggested", rules.suggest(in.profile, rows.get(0)),
                "required", rules.requiredFields(in.profile), "rows", rows.size() - 1);
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, Object>> stage(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Stage s) {
        UUID me = CaseTeam.user(jwt);
        requireProfile(s.profile);
        if (!team.canAt(me, "import.run", s.stationId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot load records for this police station.");
        var rows = read(s.csv);
        var headers = rows.get(0);
        var map = new LinkedHashMap<String, String>(s.mapping == null ? rules.suggest(s.profile, headers) : s.mapping);
        for (String field : rules.requiredFields(s.profile))
            if (!headers.contains(map.get(field)))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the file column for '" + field + "'.");
        if (!map.values().stream().allMatch(headers::contains))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The mapping names a column that is not in the file.");

        String entity = rules.entity(s.profile);
        var staged = new ArrayList<Object[]>();
        int[] count = new int[4];
        switch (entity) {
            case "arrest" -> arrestRows(s, rows, headers, map, staged, count);
            case "chargesheet" -> chargesheetRows(s, rows, headers, map, staged, count);
            default -> firRows(s, rows, headers, map, staged, count);
        }
        UUID id = db.sql("""
                insert into import_batch (station_id, entity, profile, filename, file_sha256, complaint_language, rows_total,
                  rows_ok, rows_warning, rows_error, rows_duplicate, created_by)
                values (?,?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(s.stationId, entity, s.profile, s.filename.trim(), sha(s.csv), s.complaintLanguage, rows.size() - 1,
                        count[0], count[1], count[2], count[3], me).query(UUID.class).single();
        for (Object[] r : staged)
            db.sql("insert into import_row (batch_id, row_no, status, messages, source_key, raw, parsed) values (?,?,?,?::jsonb,?,?::jsonb,?::jsonb)")
                    .params(id, r[0], r[1], r[2], r[3], r[4], r[5]).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(batch(id));
    }

    private void firRows(Stage s, List<List<String>> rows, List<String> headers, Map<String, String> map, List<Object[]> staged, int[] count) {
        var known = new HashMap<String, String>();
        db.sql("select fir_year || '/' || fir_no as k, coalesce(source_hash, '') as h from fir where station_id = ?").param(s.stationId)
                .query().listOfRows().forEach(r -> known.put((String) r.get("k"), (String) r.get("h")));
        var accusedBy = new HashMap<String, String>();   // normalised name -> FIR of this station that already has an accused of that name
        db.sql("""
                select p.full_name as n, f.fir_year || '/' || f.fir_no as k from person p join fir f on f.id = p.fir_id
                where f.station_id = ? and p.role = 'accused' order by f.registered_at""").param(s.stationId)
                .query().listOfRows().forEach(r -> accusedBy.putIfAbsent(FirImport.sameName((String) r.get("n")), (String) r.get("k")));
        var ios = new HashMap<String, UUID>();
        var seen = new HashMap<String, Integer>();
        Instant now = Instant.now();
        for (int i = 1; i < rows.size(); i++) {
            var cells = rows.get(i);
            var raw = rawOf(headers, cells);
            var fields = fieldsOf(map, raw);
            var r = rules.check(fields, u -> ios.computeIfAbsent(u, k -> db.sql(
                    "select id from app_user where username = ? and active and station_id = ? and role in " + team.caseLeadRoles())
                    .params(k, s.stationId).query(UUID.class).optional().orElse(null)), now);
            var msgs = new ArrayList<>(r.messages());
            String status = r.status();
            if (cells.size() > headers.size()) {
                msgs.add(new FirImport.Message("error", "", "This row has more values than the header has columns."));
                status = "error";
            }
            if (!status.equals("error")) {
                String key = r.parsed().get("firYear") + "/" + r.parsed().get("firNo");
                if (seen.containsKey(key)) {
                    msgs.add(new FirImport.Message("error", "fir_no", "The same FIR number as row " + seen.get(key) + " of this file."));
                    status = "error";
                } else {
                    seen.put(key, i);
                    if (known.containsKey(key)) {
                        status = "duplicate";
                        msgs.add(known.get(key).equals(hash(r.parsed()))
                                ? new FirImport.Message("info", "fir_no", "Already imported with the same content; skipped.")
                                : new FirImport.Message("warning", "fir_no", "An FIR with this number already exists and differs; it is not changed. Skipped."));
                    }
                }
            }
            if (status.equals("ok") || status.equals("warning")) {
                String key = r.parsed().get("firYear") + "/" + r.parsed().get("firNo");
                var others = new java.util.TreeSet<String>();
                for (Object n : (List<?>) r.parsed().get("accused")) {
                    String earlier = accusedBy.putIfAbsent(FirImport.sameName((String) n), key);
                    if (earlier != null && !earlier.equals(key)) others.add(earlier);
                }
                if (!others.isEmpty()) {
                    msgs.add(new FirImport.Message("warning", "accused_names", "An accused has the same name as an accused in FIR "
                            + String.join(", ", others) + ". It may be the same person; check before relying on either record. Nothing is merged."));
                    status = "warning";
                }
            }
            count[switch (status) { case "ok" -> 0; case "warning" -> 1; case "error" -> 2; default -> 3; }]++;
            staged.add(new Object[] {i, status, write(msgs), r.sourceKey(), write(raw), status.equals("ok") || status.equals("warning") ? write(r.parsed()) : null});
        }
    }

    private static Map<String, String> rawOf(List<String> headers, List<String> cells) {
        var raw = new LinkedHashMap<String, String>();
        for (int c = 0; c < headers.size(); c++) raw.put(headers.get(c), c < cells.size() ? cells.get(c) : "");
        return raw;
    }

    private static Map<String, String> fieldsOf(Map<String, String> map, Map<String, String> raw) {
        var fields = new HashMap<String, String>();
        map.forEach((field, header) -> fields.put(field, raw.get(header)));
        return fields;
    }

    /** Stages an arrests file: each row is checked against the FIR and accused already in the system. */
    private void arrestRows(Stage s, List<List<String>> rows, List<String> headers, Map<String, String> map, List<Object[]> staged, int[] count) {
        var firs = new HashMap<String, List<ArrestImport.Fir>>();
        var existing = new HashMap<String, String>();   // accused id | IST day of an arrest already recorded -> its fingerprint ("" if none)
        var officers = new HashMap<String, UUID>();
        var seen = new HashMap<String, Integer>();
        Instant now = Instant.now();
        for (int i = 1; i < rows.size(); i++) {
            var cells = rows.get(i);
            var raw = rawOf(headers, cells);
            var r = arrests.check(fieldsOf(map, raw), (year, no) -> firs.computeIfAbsent(year + "/" + no, k -> firsOf(s.stationId, year, no, existing)),
                    u -> officers.computeIfAbsent(u, k -> db.sql("select id from app_user where username = ? and active and station_id = ?")
                            .params(k, s.stationId).query(UUID.class).optional().orElse(null)), now);
            var msgs = new ArrayList<>(r.messages());
            String status = r.status();
            if (cells.size() > headers.size()) {
                msgs.add(new FirImport.Message("error", "", "This row has more values than the header has columns."));
                status = "error";
            }
            if (!status.equals("error")) {
                String key = ArrestImport.arrestKey(r.parsed().get("personId"), r.parsed().get("arrestedAt"));
                if (seen.containsKey(key)) {
                    msgs.add(new FirImport.Message("error", "arrested_at", "The same accused and day as row " + seen.get(key) + " of this file."));
                    status = "error";
                } else {
                    seen.put(key, i);
                    if (existing.containsKey(key)) {
                        status = "duplicate";
                        msgs.add(existing.get(key).equals(hash(r.parsed()))
                                ? new FirImport.Message("info", "arrested_at", "Already imported with the same content; skipped.")
                                : new FirImport.Message("warning", "arrested_at", "An arrest of this accused on this day is already recorded; it is not changed. Skipped."));
                    }
                }
            }
            count[switch (status) { case "ok" -> 0; case "warning" -> 1; case "error" -> 2; default -> 3; }]++;
            staged.add(new Object[] {i, status, write(msgs), r.sourceKey(), write(raw), status.equals("ok") || status.equals("warning") ? write(r.parsed()) : null});
        }
    }

    /** Stages a chargesheets file: each row is checked against the FIR and accused already in the system. */
    private void chargesheetRows(Stage s, List<List<String>> rows, List<String> headers, Map<String, String> map, List<Object[]> staged, int[] count) {
        var firs = new HashMap<String, List<ArrestImport.Fir>>();
        var existing = new HashMap<String, String>();   // FIR id | report number -> fingerprint ("" if none) of an original chargesheet already recorded
        var seen = new HashMap<String, Integer>();
        Instant now = Instant.now();
        for (int i = 1; i < rows.size(); i++) {
            var cells = rows.get(i);
            var raw = rawOf(headers, cells);
            var r = chargesheets.check(fieldsOf(map, raw), (year, no) -> firs.computeIfAbsent(year + "/" + no, k -> {
                var found = firsOf(s.stationId, year, no, new HashMap<>());
                for (var f : found)
                    db.sql("select report_no, coalesce(source_hash, '') as h from chargesheet where fir_id = ? and supersedes is null").param(f.id()).query().listOfRows()
                            .forEach(c -> existing.put(ChargesheetImport.key(f.id(), c.get("report_no")), (String) c.get("h")));
                return found;
            }), now);
            var msgs = new ArrayList<>(r.messages());
            String status = r.status();
            if (cells.size() > headers.size()) {
                msgs.add(new FirImport.Message("error", "", "This row has more values than the header has columns."));
                status = "error";
            }
            if (!status.equals("error")) {
                String key = ChargesheetImport.key(r.parsed().get("firId"), r.parsed().get("reportNo"));
                if (seen.containsKey(key)) {
                    msgs.add(new FirImport.Message("error", "report_no", "The same FIR and chargesheet number as row " + seen.get(key) + " of this file."));
                    status = "error";
                } else {
                    seen.put(key, i);
                    if (existing.containsKey(key)) {
                        status = "duplicate";
                        msgs.add(existing.get(key).equals(hash(r.parsed()))
                                ? new FirImport.Message("info", "report_no", "Already imported with the same content; skipped.")
                                : new FirImport.Message("warning", "report_no", "A chargesheet with this number is already recorded for this FIR; it is not changed. Skipped."));
                    }
                }
            }
            count[switch (status) { case "ok" -> 0; case "warning" -> 1; case "error" -> 2; default -> 3; }]++;
            staged.add(new Object[] {i, status, write(msgs), r.sourceKey(), write(raw), status.equals("ok") || status.equals("warning") ? write(r.parsed()) : null});
        }
    }

    /** The FIRs of the station with this number (of this year, or of any year), with their accused and the arrests already recorded. */
    private List<ArrestImport.Fir> firsOf(UUID station, Integer year, int no, Map<String, String> existing) {
        return db.sql("select id, registered_at, concluded from fir where station_id = ? and fir_no = ? and (?::int is null or fir_year = ?)")
                .params(station, no, year, year).query().listOfRows().stream().map(f -> {
                    UUID id = (UUID) f.get("id");
                    db.sql("""
                            select a.person_id, ist_date(a.arrested_at)::text as day, coalesce(a.source_hash, '') as h from arrest a
                            join person p on p.id = a.person_id where p.fir_id = ?""").param(id).query().listOfRows()
                            .forEach(a -> existing.put(a.get("person_id") + "|" + a.get("day"), (String) a.get("h")));
                    return new ArrestImport.Fir(id, ((java.sql.Timestamp) f.get("registered_at")).toInstant(), (Boolean) f.get("concluded"),
                            db.sql("select act, section from fir_section where fir_id = ?").param(id).query().listOfRows().stream()
                                    .map(x -> (Map<String, Object>) new HashMap<>(x)).toList(),
                            db.sql("select id, label, full_name from person where fir_id = ? and role = 'accused'").param(id).query().listOfRows().stream()
                                    .map(x -> new ArrestImport.Accused((UUID) x.get("id"), (String) x.get("label"), (String) x.get("full_name"))).toList());
                }).toList();
    }

    @GetMapping
    List<Map<String, Object>> history(@AuthenticationPrincipal Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        var allowed = new HashMap<UUID, Boolean>();
        return db.sql(BATCH_SQL + " order by b.created_at desc limit 200").query().listOfRows().stream()
                .filter(b -> allowed.computeIfAbsent((UUID) b.get("station_id"), st -> team.canAt(me, "import.run", st))).toList();
    }

    @GetMapping("/{id}")
    Map<String, Object> one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return open(jwt, id);
    }

    /** Rows of a batch with the messages found, newest 500 from "offset"; "status" filters (ok, warning, error, duplicate, imported, skipped). */
    @GetMapping("/{id}/rows")
    List<Map<String, Object>> rows(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestParam(required = false) String status,
                                   @RequestParam(defaultValue = "0") int offset) {
        open(jwt, id);
        return db.sql("""
                select row_no, status, messages::text as messages, source_key, raw::text as raw from import_row
                where batch_id = ? and (?::text is null or status = ?) order by row_no offset ? limit ?""")
                .params(id, status, status, Math.max(0, offset), PAGE).query().listOfRows().stream().map(this::inflate).toList();
    }

    /** Every row with an error or a warning, for the person fixing the file. Values that look like formulas are defanged. */
    @GetMapping(value = "/{id}/errors.csv", produces = "text/csv")
    ResponseEntity<String> errors(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        open(jwt, id);
        var sb = new StringBuilder(Csv.line(List.of("row", "status", "field", "problem")));
        db.sql("select row_no, status, messages::text as m from import_row where batch_id = ? and status in ('error','warning','duplicate') order by row_no")
                .param(id).query().listOfRows().forEach(r -> {
                    for (var m : read(r.get("m"), new TypeReference<List<Map<String, String>>>() {}))
                        if (!m.get("level").equals("info")) sb.append(Csv.line(List.of(r.get("row_no"), m.get("level"), m.get("field"), m.get("text"))));
                });
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header("Content-Disposition", "attachment; filename=\"import-problems.csv\"").body(sb.toString());
    }

    @PostMapping("/{id}/commit")
    @Transactional
    Map<String, Object> commit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Approve a) {
        UUID me = CaseTeam.user(jwt);
        var b = open(jwt, id);
        db.sql("select 1 from import_batch where id = ? for update").param(id).query().listOfRows();
        if (!"staged".equals(db.sql("select status from import_batch where id = ?").param(id).query(String.class).single()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This batch is not waiting for approval.");
        UUID station = (UUID) b.get("station_id");
        if (policies.effective(station, "import_self_approval") == 0 && me.equals(db.sql("select created_by from import_batch where id = ?").param(id).query(UUID.class).single()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "At this police station a second authorised person must approve a load that you checked.");
        String entity = (String) b.get("entity");
        int done = 0;
        for (var row : db.sql("select row_no, parsed::text as parsed from import_row where batch_id = ? and parsed is not null order by row_no")
                .param(id).query().listOfRows()) {
            var p = read((String) row.get("parsed"), new TypeReference<Map<String, Object>>() {});
            if (switch (entity) {
                case "arrest" -> addArrest(id, me, station, p);
                case "chargesheet" -> addChargesheet(id, me, station, p);
                default -> addFir(id, station, (String) b.get("complaint_language"), p);
            }) {
                db.sql("update import_row set status = 'imported' where batch_id = ? and row_no = ?").params(id, row.get("row_no")).update();
                done++;
            } else {
                db.sql("update import_row set status = 'skipped', messages = messages || ?::jsonb where batch_id = ? and row_no = ?")
                        .params(write(List.of(new FirImport.Message("warning", switch (entity) { case "arrest" -> "arrested_at"; case "chargesheet" -> "report_no"; default -> "fir_no"; },
                                switch (entity) {
                                    case "arrest" -> "This arrest was recorded in the meantime, or the person is no longer an accused; skipped.";
                                    case "chargesheet" -> "This chargesheet was recorded in the meantime, or an accused it names is no longer an accused; skipped.";
                                    default -> "Another FIR took this number before approval; skipped.";
                                }))), id, row.get("row_no")).update();
            }
        }
        if (done == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "No row can be imported.");
        db.sql("update import_row set raw = null, parsed = null where batch_id = ?").param(id).update();
        db.sql("update import_batch set status = 'imported', approved_by = ?, approved_at = clock_timestamp(), authority_note = ?, rows_imported = ? where id = ?")
                .params(me, a.authority.trim(), done, id).update();
        return batch(id);
    }

    /** Adds one checked FIR with its sections and people; false when another FIR took the number meanwhile. */
    private boolean addFir(UUID batch, UUID station, String language, Map<String, Object> p) {
        UUID io = p.get("ioId") == null ? null : UUID.fromString((String) p.get("ioId"));
        if (io != null && !team.canBeIo(io, station)) io = null;
        UUID fir = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at, is_zero_fir,
                  outside_limits_place, contents_original, contents_language, action_taken, io_id, import_batch_id, source_key,
                  source_hash, concluded)
                values (?,?,?,?,?::timestamptz,?::timestamptz,?,?,?,?,'investigate',?,?,?,?,?)
                on conflict (station_id, fir_year, fir_no) do nothing returning id""")
                .params(station, p.get("firYear"), p.get("firNo"), p.get("gdEntryNo"), p.get("registeredAt"), p.get("informationReceivedAt"),
                        p.get("zeroFir"), p.get("outsideLimitsPlace"), p.get("complaintText"), language, io, batch,
                        p.get("sourceKey"), hash(p), p.get("concluded"))
                .query(UUID.class).optional().orElse(null);
        if (fir == null) return false;
        for (var sec : (List<Map<String, String>>) p.get("sections"))
            db.sql("insert into fir_section (fir_id, act, section) values (?,?,?) on conflict do nothing").params(fir, sec.get("act"), sec.get("section")).update();
        person(fir, batch, "complainant", "C", p.get("complainant") == null ? List.of() : List.of((String) p.get("complainant")));
        person(fir, batch, "victim", "V", (List<String>) p.get("victims"));
        person(fir, batch, "accused", "A", (List<String>) p.get("accused"));
        person(fir, batch, "witness", "W", (List<String>) p.get("witnesses"));
        return true;
    }

    /**
     * Adds one checked arrest as the old record has it. The approving officer is recorded as the person who entered it (and
     * who recorded the remand and release); the arresting officer is whoever the file named, or nobody. False when the
     * accused is no longer an accused or an arrest of that person on that day was recorded meanwhile.
     */
    private boolean addArrest(UUID batch, UUID me, UUID station, Map<String, Object> p) {
        return db.sql("""
                insert into arrest (person_id, arrested_at, place, grounds, informed_name, informed_contact, arresting_officer, first_remand_on,
                  max_punishment, recorded_by, remand_recorded_by, remand_recorded_at, released_on, release_basis, release_recorded_by,
                  release_recorded_at, import_batch_id, source_hash)
                select pe.id, ?::timestamptz, ?::text, ?::text[], ?::text, ?::text, ?::uuid, ?::date, ?::text, ?::uuid,
                  case when ?::date is null then null else ?::uuid end, case when ?::date is null then null else clock_timestamp() end,
                  ?::date, ?::text, case when ?::date is null then null else ?::uuid end,
                  case when ?::date is null then null else clock_timestamp() end, ?::uuid, ?::text
                from person pe join fir f on f.id = pe.fir_id
                where pe.id = ?::uuid and pe.role = 'accused' and f.station_id = ?
                  and not exists (select 1 from arrest x where x.person_id = pe.id and ist_date(x.arrested_at) = ist_date(?::timestamptz))""")
                .params(p.get("arrestedAt"), p.get("place"), ((List<String>) p.get("grounds")).toArray(String[]::new), p.get("informedName"),
                        p.get("informedContact"), p.get("officerId") == null ? null : UUID.fromString((String) p.get("officerId")),
                        p.get("firstRemandOn"), p.get("maxPunishment"), me, p.get("firstRemandOn"), me, p.get("firstRemandOn"),
                        p.get("releasedOn"), p.get("releaseBasis"), p.get("releasedOn"), me, p.get("releasedOn"), batch, hash(p),
                        p.get("personId"), station, p.get("arrestedAt")).update() == 1;
    }

    /** Adds one checked chargesheet with the accused it names; false when it was recorded meanwhile or a named person is no longer an accused. */
    private boolean addChargesheet(UUID batch, UUID me, UUID station, Map<String, Object> p) {
        UUID fir = UUID.fromString((String) p.get("firId"));
        var accused = ((List<String>) p.get("accusedIds")).stream().map(UUID::fromString).toList();
        if (db.sql("select count(*) from person where id = any(?::uuid[]) and fir_id = ? and role = 'accused'")
                .params(accused.toArray(UUID[]::new), fir).query(Long.class).single() != accused.size()) return false;
        UUID id = db.sql("""
                insert into chargesheet (fir_id, filed_on, court, report_no, recorded_by, import_batch_id, source_hash)
                select f.id, ?::date, ?::text, ?::text, ?::uuid, ?::uuid, ?::text from fir f where f.id = ?::uuid and f.station_id = ?::uuid
                  and not exists (select 1 from chargesheet x where x.fir_id = f.id and x.supersedes is null
                                  and lower(regexp_replace(x.report_no, '\\s', '', 'g')) = lower(regexp_replace(?::text, '\\s', '', 'g')))
                returning id""")
                .params(p.get("filedOn"), p.get("court"), p.get("reportNo"), me, batch, hash(p), fir, station, p.get("reportNo"))
                .query(UUID.class).optional().orElse(null);
        if (id == null) return false;
        for (UUID a : accused) db.sql("insert into chargesheet_accused (chargesheet_id, person_id) values (?,?)").params(id, a).update();
        return true;
    }

    @PostMapping("/{id}/discard")
    @Transactional
    Map<String, Object> discard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        open(jwt, id);
        if (db.sql("update import_batch set status = 'discarded' where id = ? and status = 'staged'").param(id).update() == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a batch waiting for approval can be discarded.");
        db.sql("update import_row set raw = null, parsed = null where batch_id = ?").param(id).update();
        return batch(id);
    }

    /** Removes the FIRs (or arrests) a batch added, but only while nothing else has been recorded on them or their people. */
    @PostMapping("/{id}/undo")
    @Transactional
    Map<String, Object> undo(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Undo u) {
        UUID me = CaseTeam.user(jwt);
        var b = open(jwt, id);
        if (db.sql("update import_batch set status = 'undone', undone_by = ?, undone_at = clock_timestamp(), undo_reason = ? where id = ? and status = 'imported'")
                .params(me, u.reason.trim(), id).update() == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an imported batch can be undone.");
        String entity = (String) b.get("entity");
        boolean arrestBatch = entity.equals("arrest");
        for (String[] l : links()) {
            // an FIR batch is guarded by what points at its FIRs and people, any other batch by what points at its own records
            if (!(entity.equals("fir") ? l[2].equals("fir") || l[2].equals("person") : l[2].equals(entity))) continue;
            String owned = "select id from " + l[2] + " where import_batch_id = ?";
            if (db.sql("select exists (select 1 from " + l[0] + " where " + l[1] + " in (" + owned + "))").param(id).query(Boolean.class).single())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Work has been recorded on some of these " + things(entity) + ", so the batch cannot be undone.");
        }
        if (entity.equals("chargesheet")) {
            db.sql("delete from chargesheet_accused where chargesheet_id in (select id from chargesheet where import_batch_id = ?)").param(id).update();
            db.sql("delete from chargesheet where import_batch_id = ?").param(id).update();
            return batch(id);
        }
        if (arrestBatch) {
            if (db.sql("""
                    select exists (select 1 from arrest a join import_batch ib on ib.id = a.import_batch_id where a.import_batch_id = ?
                      and (a.remand_recorded_at > ib.approved_at or a.release_recorded_at > ib.approved_at))""").param(id).query(Boolean.class).single())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A remand or release was recorded on some of these arrests, so the batch cannot be undone.");
            db.sql("delete from arrest where import_batch_id = ?").param(id).update();
            return batch(id);
        }
        if (db.sql("select exists (select 1 from person where fir_id in (select id from fir where import_batch_id = ?) and import_batch_id is distinct from ?)")
                .params(id, id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "People were added to some of these FIRs, so the batch cannot be undone.");
        try {
            db.sql("delete from fir where import_batch_id = ?").param(id).update();
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Work has been recorded on some of these FIRs, so the batch cannot be undone.");
        }
        return batch(id);
    }

    // ---------------------------------------------------------------------------------------------

    static final String BATCH_SQL = """
            select b.id, b.station_id, s.name as station_name, b.entity, b.profile, b.filename, b.file_sha256, b.complaint_language, b.status,
              b.rows_total, b.rows_ok, b.rows_warning, b.rows_error, b.rows_duplicate, b.rows_imported, b.created_at,
              c.full_name as created_by_name, b.approved_at, a.full_name as approved_by_name, b.authority_note,
              b.undone_at, x.full_name as undone_by_name, b.undo_reason
            from import_batch b join police_station s on s.id = b.station_id join app_user c on c.id = b.created_by
            left join app_user a on a.id = b.approved_by left join app_user x on x.id = b.undone_by""";

    Map<String, Object> batch(UUID id) {
        return db.sql(BATCH_SQL + " where b.id = ?").param(id).query().singleRow();
    }

    /** The batch, or 404 for anyone who may not load records for its station (its existence is not revealed). */
    private Map<String, Object> open(Jwt jwt, UUID id) {
        var b = db.sql(BATCH_SQL + " where b.id = ?").param(id).query().listOfRows().stream().findFirst().orElse(null);
        if (b == null || !team.canAt(CaseTeam.user(jwt), "import.run", (UUID) b.get("station_id")))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such import.");
        return b;
    }

    private static String things(String entity) {
        return switch (entity) { case "arrest" -> "arrests"; case "chargesheet" -> "chargesheets"; default -> "FIRs"; };
    }

    private void requireImporter(UUID user) {
        if (!team.can(user, "import.run")) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot load existing records.");
    }

    private void requireProfile(String profile) {
        if (!rules.hasProfile(profile)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such import profile.");
    }

    private List<List<String>> read(String csv) {
        List<List<String>> rows;
        try {
            rows = Csv.parse(csv);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        if (rows.size() < 2) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The file needs a header line and at least one row.");
        if (rows.size() - 1 > MAX_ROWS)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "At most " + MAX_ROWS + " rows can be loaded at once; split the file.");
        return rows;
    }

    private void person(UUID fir, UUID batch, String role, String label, List<String> names) {
        int n = 1;
        for (String name : names)
            db.sql("insert into person (fir_id, role, label, full_name, import_batch_id) values (?,?,?,?,?)")
                    .params(fir, role, label + n++, name, batch).update();
    }

    /** Tables holding a link to fir.id, person.id, arrest.id or chargesheet.id, from the database catalogue, so a new table is guarded without an edit here. */
    private synchronized List<String[]> links() {
        if (childLinks == null) {
            childLinks = new ArrayList<>();
            db.sql("""
                    select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as parent
                    from pg_constraint c cross join lateral unnest(c.conkey, c.confkey) k(ck, fk)
                    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.ck
                    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.fk
                    where c.contype = 'f' and c.confrelid in ('fir'::regclass, 'person'::regclass, 'arrest'::regclass, 'chargesheet'::regclass) and pa.attname = 'id'
                      and c.conrelid::regclass::text not in ('fir_section', 'person', 'fir')
                      and not (c.conrelid = 'chargesheet_accused'::regclass and c.confrelid = 'chargesheet'::regclass)""").query().listOfRows()
                    .forEach(r -> childLinks.add(new String[] {(String) r.get("tbl"), (String) r.get("col"), (String) r.get("parent")}));
        }
        return childLinks;
    }

    private Map<String, Object> inflate(Map<String, Object> r) {
        var out = new LinkedHashMap<>(r);
        out.put("messages", read((String) r.get("messages"), new TypeReference<List<Object>>() {}));
        out.put("raw", r.get("raw") == null ? null : read((String) r.get("raw"), new TypeReference<Map<String, Object>>() {}));
        return out;
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private <T> T read(Object text, TypeReference<T> type) {
        try {
            return json.readValue((String) text, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String hash(Map<String, Object> parsed) {
        var copy = new LinkedHashMap<>(parsed);
        copy.remove("sourceKey");
        try {
            // jsonb does not keep key order, so the fingerprint is taken over sorted keys
            return sha(json.copy().configure(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true).writeValueAsString(copy));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static String sha(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
