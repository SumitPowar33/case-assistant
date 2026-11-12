package in.caseassistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Call detail records (V56). Loading: the operator's file must already be an electronic item of this case's evidence
 * register, and its bytes must have that item's SHA-256, so what is analysed is exactly what was seized. The columns are
 * found by the names in the packs' {@code cdr-layouts.json} (data, not code); each readable line is kept as written with its
 * line number, an unreadable one is counted and named, never guessed. Analysis: per file the most frequent other numbers,
 * the cells and the events per day; across the case's files the numbers several files share; a number that is a person of
 * this FIR (by phone) is named by that person's label. Counts only: no score, no prediction. Case team only; every read is
 * logged (the records hold numbers of people outside the case).
 */
@RestController
class CdrController {
    static final int MAX_LINES = 50_000;
    static final int TOP = 20;

    record Load(@NotNull UUID evidenceItemId, @NotBlank @Size(max = 20) String target, @NotBlank @Size(max = 200) String filename,
                @NotBlank String contentBase64) {}

    private final JdbcClient db;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final CaseTeam team;
    private final Map<String, List<String>> aliases = new LinkedHashMap<>();
    private final Map<String, String> types = new LinkedHashMap<>();   // the operator's word -> call_out, call_in, sms_out, sms_in
    private final List<String> required = new ArrayList<>();

    CdrController(JdbcClient db, org.springframework.jdbc.core.JdbcTemplate jdbc, CaseTeam team, ObjectMapper json) throws IOException {
        this.db = db;
        this.jdbc = jdbc;
        this.team = team;
        for (var res : new PathMatchingResourcePatternResolver().getResources("classpath*:packs/*/cdr-layouts.json"))
            try (InputStream in = res.getInputStream()) {
                addLayout(json.readTree(in));
            }
    }

    void addLayout(JsonNode layout) {
        layout.path("fields").fields().forEachRemaining(f -> {
            f.getValue().path("aliases").forEach(a -> aliases.computeIfAbsent(f.getKey(), k -> new ArrayList<>()).add(norm(a.asText())));
            if (f.getValue().path("required").asBoolean() && !required.contains(f.getKey())) required.add(f.getKey());
        });
        layout.path("types").fields().forEachRemaining(t -> t.getValue().forEach(w -> types.put(norm(w.asText()), t.getKey())));
    }

    static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[\\s_\\-()]+", "");
    }

    /** A phone number by its last ten digits; a sender name (a bank's SMS code) or a short code as written, upper case. */
    static String number(String s) {
        String digits = s.replaceAll("\\D", "");
        return digits.length() >= 10 ? digits.substring(digits.length() - 10) : s.trim().toUpperCase(Locale.ROOT);
    }

    /** Seconds from "75" or "00:01:15" / "1:15"; null when it cannot be read. */
    static Integer seconds(String s) {
        String t = s.trim();
        if (t.matches("\\d{1,7}")) return Integer.parseInt(t);
        if (!t.matches("\\d{1,3}(:\\d{1,2}){1,2}")) return null;
        int total = 0;
        for (String part : t.split(":")) total = total * 60 + Integer.parseInt(part);
        return total;
    }

    @Transactional
    @PostMapping("/api/firs/{firId}/cdr")
    ResponseEntity<Map<String, Object>> load(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Load in) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        String target = number(in.target);
        if (!target.matches("\\d{10}")) throw bad("The number whose records these are must have ten digits.");
        var item = db.sql("select label, sha256 from evidence_item where id = ? and fir_id = ? and kind = 'electronic'")
                .params(in.evidenceItemId, firId).query().listOfRows();
        if (item.isEmpty()) throw bad("Choose an electronic item of this case's evidence register: the records file must be seized first.");
        if (db.sql("select count(*) from cdr_file where evidence_item_id = ?").param(in.evidenceItemId).query(Integer.class).single() > 0)
            throw bad("The records of this evidence item are already loaded.");
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(in.contentBase64);
        } catch (IllegalArgumentException e) {
            throw bad("The file could not be read.");
        }
        if (!sha256(bytes).equals(item.get(0).get("sha256")))
            throw bad("This file is not the one recorded as " + item.get(0).get("label") + ": its SHA-256 differs. Load the file exactly as seized.");
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            throw bad("The file is not UTF-8 text. Ask the operator for a CSV file.");
        }
        if (text.startsWith("﻿")) text = text.substring(1);
        List<List<String>> rows = Csv.parse(text);
        if (rows.size() < 2) throw bad("The file has no records.");
        if (rows.size() - 1 > MAX_LINES) throw bad("The file has more than " + MAX_LINES + " records; ask the operator for a shorter period.");
        Map<String, Integer> col = columns(rows.get(0));
        var missing = required.stream().filter(f -> !col.containsKey(f)).toList();
        if (!missing.isEmpty() || !(col.containsKey("datetime") || col.containsKey("date")))
            throw bad("These columns were not found: " + String.join(", ", missing.isEmpty() ? List.of("date") : missing) + ". Headings found: "
                    + String.join(", ", rows.get(0)) + ".");

        UUID file = UUID.randomUUID();
        var calls = new ArrayList<Object[]>();
        var problems = new ArrayList<String>();
        int skipped = 0;
        for (int i = 1; i < rows.size(); i++) {
            var r = rows.get(i);
            if (r.stream().allMatch(String::isBlank)) continue;
            String why = null;
            String other = cell(r, col, "other"), type = types.get(norm(cell(r, col, "type")));
            Integer dur = seconds(cell(r, col, "duration"));
            String whenText = col.containsKey("datetime") ? cell(r, col, "datetime") : (cell(r, col, "date") + " " + cell(r, col, "time")).trim();
            Instant at = FirImport.when(whenText, new boolean[1]);
            String own = col.containsKey("target") ? cell(r, col, "target") : "";
            if (other.isBlank()) why = "no other number";
            else if (type == null) why = "unknown call type “" + cell(r, col, "type") + "”";
            else if (dur == null) why = "duration not readable";
            else if (at == null) why = "date not readable";
            else if (!own.isBlank() && !number(own).equals(target)) why = "another subscriber's line (" + own.trim() + ")";
            if (why != null) {
                skipped++;
                if (problems.size() < 20) problems.add("Line " + (i + 1) + ": " + why);
                continue;
            }
            String cellId = cell(r, col, "cell"), imei = cell(r, col, "imei");
            calls.add(new Object[] {file, i + 1, cut(number(other), 40), java.sql.Timestamp.from(at), dur, type.endsWith("_out") ? "out" : "in",
                    type.startsWith("sms") ? "sms" : "call", cellId.isBlank() ? null : cut(cellId.trim(), 60), imei.isBlank() ? null : cut(imei.trim(), 20)});
        }
        if (calls.isEmpty()) throw bad("No record of the file could be read. " + String.join("; ", problems));
        db.sql("insert into cdr_file (id, fir_id, evidence_item_id, target, filename, lines, skipped, loaded_by) values (?,?,?,?,?,?,?,?)")
                .params(file, firId, in.evidenceItemId, target, in.filename.trim(), calls.size(), skipped, me).update();
        jdbc.batchUpdate("insert into cdr_call (file_id, line, other, at, duration_s, direction, kind, cell, imei) values (?,?,?,?,?,?,?,?,?)", calls);
        var out = new LinkedHashMap<String, Object>();
        out.put("id", file);
        out.put("lines", calls.size());
        out.put("skipped", skipped);
        out.put("problems", problems);
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @Transactional
    @GetMapping("/api/firs/{firId}/cdr")
    Map<String, Object> analysis(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        // a number that is a person of this FIR is shown by that person's label (A1, W2), never by a name
        String who = "(select string_agg(p.label, ', ' order by p.label) from person p where p.fir_id = :fir and p.label is not null "
                + "and right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = %s)";
        var files = db.sql("""
                select f.id, f.target, f.filename, f.lines, f.skipped, f.loaded_at, u.full_name as loaded_by, e.label as evidence,
                       (select min(at) from cdr_call c where c.file_id = f.id) as first_at, (select max(at) from cdr_call c where c.file_id = f.id) as last_at,
                       """ + who.formatted("f.target") + """
                 as target_person
                from cdr_file f join evidence_item e on e.id = f.evidence_item_id join app_user u on u.id = f.loaded_by
                where f.fir_id = :fir order by f.loaded_at""").param("fir", firId).query().listOfRows();
        for (var f : files) {
            UUID id = (UUID) f.get("id");
            f.put("contacts", db.sql("""
                    select other, count(*) filter (where kind = 'call') as calls, count(*) filter (where kind = 'sms') as sms,
                           coalesce(sum(duration_s) filter (where kind = 'call'), 0) as seconds, min(at) as first_at, max(at) as last_at,
                           """ + who.formatted("other") + """
                     as person
                    from cdr_call where file_id = :file group by other order by count(*) desc, other limit :top""")
                    .param("fir", firId).param("file", id).param("top", TOP).query().listOfRows());
            f.put("cells", db.sql("""
                    select cell, count(*) as events, min(at) as first_at, max(at) as last_at from cdr_call
                    where file_id = ? and cell is not null group by cell order by count(*) desc, cell limit ?""").params(id, TOP).query().listOfRows());
            f.put("days", db.sql("""
                    select ist_date(at) as day, count(*) as events from cdr_call where file_id = ? group by 1 order by 1""").param(id).query().listOfRows());
        }
        var common = db.sql("""
                with n as (
                  select c.other as number, f.target from cdr_call c join cdr_file f on f.id = c.file_id where f.fir_id = :fir
                  union all
                  select f.target, f.target from cdr_file f where f.fir_id = :fir)
                select number, array_agg(distinct target order by target) as targets, count(*) as events,
                       """ + who.formatted("number") + """
                 as person
                from n group by number having count(distinct target) > 1 order by count(distinct target) desc, count(*) desc, number limit :top""")
                .param("fir", firId).param("top", TOP).query().listOfRows();
        for (var c : common) c.put("targets", array(c.get("targets")));
        db.sql("insert into cdr_read (reader, fir_id, files) values (?,?,?)").params(me, firId, files.size()).update();
        var out = new LinkedHashMap<String, Object>();
        out.put("files", files);
        out.put("common", common);
        return out;
    }

    private Map<String, Integer> columns(List<String> header) {
        var col = new LinkedHashMap<String, Integer>();
        for (int i = 0; i < header.size(); i++) {
            String h = norm(header.get(i));
            for (var a : aliases.entrySet())
                if (!col.containsKey(a.getKey()) && a.getValue().contains(h)) col.put(a.getKey(), i);
        }
        return col;
    }

    private static String cell(List<String> row, Map<String, Integer> col, String field) {
        Integer i = col.get(field);
        return i == null || i >= row.size() ? "" : row.get(i);
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static Object array(Object sqlArray) {
        try {
            return sqlArray instanceof java.sql.Array a ? a.getArray() : sqlArray;
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
