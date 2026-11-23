package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
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
 * Station duty roster (item 16, V66): shifts, posts, weekly offs and leave of the officers of one police station. Anyone
 * posted at the station reads it (the front desk sees the duty officer); whoever holds "roster.manage" in reach of the
 * station (the SHO, also as an acting charge) writes it. Entries are kept as written; taking one back is a second row
 * with a reason. The shift hours are fixed here (morning 06-14, evening 14-22, night 22-06, the night belongs to the day
 * it began); each state's own hours from its pack, swaps and the court-date clash warning are not built yet.
 * Nothing here rates an officer.
 */
@RestController
class DutyRosterController {
    static final String MANAGE = "roster.manage";
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final int MAX_DAYS = 31;

    record NewEntry(@NotNull UUID stationId, @NotNull UUID officerId, @NotBlank String date,
            @NotBlank @Pattern(regexp = "duty|weekly_off|leave") String kind,
            @Pattern(regexp = "morning|evening|night") String shift,
            @Pattern(regexp = "station_house|front_desk|beat|patrol|court|lock_up|bandobast") String post,
            @Size(max = 300) String note) {}

    record Cancel(@NotBlank @Size(min = 10, max = 500) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;

    DutyRosterController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    /** The shift running at this India time and the day it belongs to (the night's small hours belong to the day before). */
    static String[] shiftAt(LocalDateTime now) {
        int h = now.getHour();
        if (h >= 6 && h < 14) return new String[] {"morning", now.toLocalDate().toString()};
        if (h >= 14 && h < 22) return new String[] {"evening", now.toLocalDate().toString()};
        return new String[] {"night", (h < 6 ? now.toLocalDate().minusDays(1) : now.toLocalDate()).toString()};
    }

    private boolean reads(UUID me, UUID station) {
        boolean posted = db.sql("select exists (select 1 from app_user where id = ? and active and station_id = ?)").params(me, station).query(Boolean.class).single();
        return posted || team.canAt(me, MANAGE, station);
    }

    @GetMapping("/api/duty-roster")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId, @RequestParam(required = false) String from) {
        UUID me = CaseTeam.user(jwt);
        if (!reads(me, stationId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only officers of this police station, and those who run its roster, see it.");
        LocalDateTime now = LocalDateTime.now(IST);
        LocalDate start = from == null || from.isBlank() ? now.toLocalDate() : date(from);
        List<Map<String, Object>> rows = db.sql("""
                select a.id, a.officer_id, u.full_name, u.rank, a.on_date, a.kind, a.shift, a.post, a.note
                from duty_assignment a join app_user u on u.id = a.officer_id
                where a.station_id = ? and a.on_date >= ? and a.on_date < ?
                  and not exists (select 1 from duty_assignment_cancel c where c.assignment_id = a.id)
                order by a.on_date, array_position(array['morning','evening','night'], a.shift) nulls last, a.post nulls last, u.full_name, a.id""")
                .params(stationId, start, start.plusDays(MAX_DAYS)).query().listOfRows();
        String[] shift = shiftAt(now);
        var onDuty = rows.stream().filter(r -> "duty".equals(r.get("kind")) && shift[0].equals(r.get("shift")) && shift[1].equals(String.valueOf(r.get("on_date")))).toList();
        return Map.of("from", start.toString(), "rows", rows, "now", Map.of("shift", shift[0], "on_duty", onDuty),
                "can_manage", team.canAt(me, MANAGE, stationId));
    }

    /** The officers of the station an entry may name; for those who write the roster only. */
    @GetMapping("/api/duty-roster/options")
    List<Map<String, Object>> options(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId) {
        requireManage(CaseTeam.user(jwt), stationId);
        return db.sql("select id, full_name, rank from app_user where station_id = ? and active order by full_name, id").param(stationId).query().listOfRows();
    }

    @PostMapping("/api/duty-roster")
    @Transactional
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewEntry e) {
        UUID me = CaseTeam.user(jwt);
        requireManage(me, e.stationId);
        LocalDate on = date(e.date);
        if (on.isBefore(LocalDate.now(IST))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A roster entry cannot be for a day that has passed.");
        if (on.isAfter(LocalDate.now(IST).plusDays(60))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A roster entry can be at most 60 days ahead.");
        boolean duty = e.kind.equals("duty");
        if (duty != (e.shift != null && e.post != null) || (!duty && (e.shift != null || e.post != null)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, duty ? "A duty needs a shift and a post." : "A weekly off or leave has no shift or post.");
        boolean posted = db.sql("select exists (select 1 from app_user where id = ? and active and station_id = ?)").params(e.officerId, e.stationId).query(Boolean.class).single();
        if (!posted) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The officer is not posted at this police station.");
        // serialise entries of one officer, so two requests cannot both pass the checks below
        db.sql("select id from app_user where id = ? for update").param(e.officerId).query().listOfRows();
        var clash = db.sql("""
                select a.kind, a.shift from duty_assignment a where a.officer_id = ? and a.on_date = ?
                  and not exists (select 1 from duty_assignment_cancel c where c.assignment_id = a.id)""").params(e.officerId, on).query().listOfRows();
        for (var c : clash) {
            boolean sameShift = duty && "duty".equals(c.get("kind")) && e.shift.equals(c.get("shift"));
            if (sameShift || !duty || !"duty".equals(c.get("kind")))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "The officer already has an entry that day" + (sameShift ? " for this shift." : "; take it back first."));
        }
        UUID id = db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, note, recorded_by) values (?,?,?,?,?,?,?,?) returning id")
                .params(e.stationId, e.officerId, on, e.kind, e.shift, e.post, e.note == null || e.note.isBlank() ? null : e.note.trim(), me)
                .query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/duty-roster/{id}/cancel")
    @Transactional
    ResponseEntity<Void> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Cancel c) {
        UUID me = CaseTeam.user(jwt);
        var row = db.sql("select station_id, on_date from duty_assignment where id = ? for update").param(id).query().listOfRows().stream().findFirst().orElse(null);
        // an outsider learns nothing about an entry of another station: the same answer as for one that does not exist
        if (row == null || !team.canAt(me, MANAGE, (UUID) row.get("station_id"))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such roster entry.");
        if (db.sql("select exists (select 1 from duty_assignment_cancel where assignment_id = ?)").param(id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This entry has already been taken back.");
        db.sql("insert into duty_assignment_cancel (assignment_id, reason, cancelled_by) values (?,?,?)").params(id, c.reason.trim(), me).update();
        return ResponseEntity.noContent().build();
    }

    private void requireManage(UUID me, UUID station) {
        if (!team.canAt(me, MANAGE, station)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the officer in charge of this police station writes its duty roster.");
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text);
        } catch (DateTimeException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date must be written as YYYY-MM-DD.");
        }
    }
}
