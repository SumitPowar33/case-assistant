package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Incoming 112 events (item 15, V70). The state's ERSS interface does not exist yet, so an event is written by hand at
 * the station (time received, place, kind of call, vehicle sent, caller as given); the feed will insert rows later. The
 * duty officer ("call112.handle", posted at the station) writes, acknowledges and opens events; anyone posted at the
 * station reads them. An event is kept as written. It is acknowledged once, and then opened once: as a complaint at the
 * front desk (mode phone, the text as written) or as a general diary entry of the station. A call about a woman or a
 * child in distress shows its caller and details only to the officer who wrote it and to those who supervise the
 * station, like a complaint of a protected kind at the front desk; the diary entry never carries caller or details.
 */
@RestController
class Call112Controller {
    static final String HANDLE = "call112.handle";
    /** Kinds of call whose caller and details are withheld from the rest of the station. */
    static final Set<String> SENSITIVE = Set.of("woman_in_distress", "child_in_distress");
    private static final DateTimeFormatter IST_TIME = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").withZone(ZoneId.of("Asia/Kolkata"));

    record NewEvent(@NotNull UUID stationId, @NotNull OffsetDateTime receivedAt, @NotBlank @Size(max = 300) String place,
            @NotBlank @Pattern(regexp = "crime_in_progress|violence|woman_in_distress|child_in_distress|accident|missing_person|fire_medical|dispute|other") String kind,
            @Size(max = 100) String vehicle, @Size(max = 200) String callerName, @Size(max = 100) String callerContact,
            @NotBlank @Size(max = 2000) String details) {}

    record Open(@NotBlank @Pattern(regexp = "complaint|diary") String as, String complaintKind,
            @Pattern(regexp = "[a-z]{2,3}(-[A-Za-z]{2,4})?") String textLanguage) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final ComplaintKinds kinds;

    Call112Controller(JdbcClient db, CaseTeam team, ComplaintKinds kinds) {
        this.db = db;
        this.team = team;
        this.kinds = kinds;
    }

    private boolean reads(UUID me, UUID station) {
        return db.sql("select exists (select 1 from app_user where id = ? and active and station_id = ?)").params(me, station).query(Boolean.class).single();
    }

    private void requireHandle(UUID me, UUID station) {
        if (!team.holdsAtOwnStation(me, HANDLE, station)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the duty officer of this police station handles its 112 events.");
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    @GetMapping("/api/calls-112")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId) {
        UUID me = CaseTeam.user(jwt);
        if (!reads(me, stationId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only officers of this police station see its 112 events.");
        boolean supervises = team.supervisesStation(me, stationId);
        var rows = db.sql("""
                select e.id, e.received_at, e.place, e.kind, e.vehicle, e.caller_name, e.caller_contact, e.details, e.entered_by = ? as mine,
                  w.full_name as entered_by_name, a.acknowledged_at, au.full_name as acknowledged_by_name,
                  o.complaint_id, g.entry_no as diary_no
                from call112_event e join app_user w on w.id = e.entered_by
                left join call112_ack a on a.event_id = e.id left join app_user au on au.id = a.acknowledged_by
                left join call112_opened o on o.event_id = e.id left join general_diary_entry g on g.id = o.diary_id
                where e.station_id = ? order by e.received_at desc, e.id limit 100""").params(me, stationId).query().listOfRows();
        var out = rows.stream().map(r -> {
            var row = new LinkedHashMap<>(r);
            boolean withheld = SENSITIVE.contains(r.get("kind")) && !Boolean.TRUE.equals(r.get("mine")) && !supervises;
            row.remove("mine");
            row.put("withheld", withheld);
            if (withheld) { row.put("caller_name", null); row.put("caller_contact", null); row.put("details", null); }
            return row;
        }).toList();
        return Map.of("rows", out, "can_handle", team.holdsAtOwnStation(me, HANDLE, stationId));
    }

    @PostMapping("/api/calls-112")
    ResponseEntity<Map<String, UUID>> add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewEvent e) {
        UUID me = CaseTeam.user(jwt);
        requireHandle(me, e.stationId);
        if (e.receivedAt.toInstant().isAfter(Instant.now())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The time received is in the future.");
        UUID id = db.sql("""
                insert into call112_event (station_id, received_at, place, kind, vehicle, caller_name, caller_contact, details, entered_by)
                values (?,?,?,?,?,?,?,?,?) returning id""")
                .params(e.stationId, e.receivedAt, e.place.trim(), e.kind, blank(e.vehicle), blank(e.callerName), blank(e.callerContact), e.details.trim(), me)
                .query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** The event and its station, or 404: an outsider learns nothing about an event of another station. */
    private Map<String, Object> event(UUID me, UUID id) {
        var e = db.sql("select id, station_id, received_at, place, kind, vehicle, caller_name, caller_contact, details from call112_event where id = ? for update")
                .param(id).query().listOfRows().stream().findFirst().orElse(null);
        if (e == null || !team.holdsAtOwnStation(me, HANDLE, (UUID) e.get("station_id"))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such 112 event.");
        return e;
    }

    @PostMapping("/api/calls-112/{id}/acknowledge")
    @Transactional
    ResponseEntity<Void> acknowledge(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        UUID me = CaseTeam.user(jwt);
        event(me, id);
        if (db.sql("select exists (select 1 from call112_ack where event_id = ?)").param(id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This event has already been acknowledged.");
        db.sql("insert into call112_ack (event_id, acknowledged_by) values (?,?)").params(id, me).update();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/calls-112/{id}/open")
    @Transactional
    ResponseEntity<Map<String, Object>> open(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Open o) {
        UUID me = CaseTeam.user(jwt);
        var e = event(me, id);
        UUID station = (UUID) e.get("station_id");
        if (!db.sql("select exists (select 1 from call112_ack where event_id = ?)").param(id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Acknowledge the event first.");
        if (db.sql("select exists (select 1 from call112_opened where event_id = ?)").param(id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This event has already been opened.");
        UUID complaint = null, diary = null;
        if (o.as.equals("complaint")) {
            team.requireStationStaff(me, station);
            if (o.complaintKind == null || kinds.all().stream().noneMatch(k -> k.id().equals(o.complaintKind)))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a kind of complaint from the list.");
            if (o.textLanguage == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say which language the details are written in.");
            String name = (String) e.get("caller_name");
            complaint = db.sql("""
                    insert into complaint (station_id, received_at, mode, informant_name, informant_contact, kind, text_original, text_language, recorded_by)
                    values (?,?,'phone',?,?,?,?,?,?) returning id""")
                    .params(station, e.get("received_at"), name == null ? "Caller of 112 (name not given)" : name, e.get("caller_contact"), o.complaintKind, e.get("details"), o.textLanguage, me)
                    .query(UUID.class).single();
        } else {
            // the station's own numbering: one more than the highest, serialised on the station row
            db.sql("select id from police_station where id = ? for update").param(station).query().listOfRows();
            String text = "112 call received " + IST_TIME.format(((java.sql.Timestamp) e.get("received_at")).toInstant()) + " at " + e.get("place")
                    + " (" + e.get("kind") + (e.get("vehicle") == null ? "" : "; vehicle " + e.get("vehicle")) + "). Caller and details: see the 112 event.";
            diary = db.sql("""
                    insert into general_diary_entry (station_id, entry_no, entry_text, recorded_by)
                    values (?, (select coalesce(max(entry_no), 0) + 1 from general_diary_entry where station_id = ?), ?, ?) returning id""")
                    .params(station, station, text, me).query(UUID.class).single();
        }
        db.sql("insert into call112_opened (event_id, complaint_id, diary_id, opened_by) values (?,?,?,?)").params(id, complaint, diary, me).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(complaint != null ? Map.of("complaintId", complaint) : Map.of("diaryId", diary));
    }
}
