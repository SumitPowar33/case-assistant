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
import java.util.Optional;
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
 * it began); each state's own hours from its pack are not built yet. A swap (V74) is asked by an officer for one of their
 * own duties against a colleague's; whoever writes the roster approves it, which takes both entries back and writes the
 * two exchanged ones, or refuses it with a note. The reason and the note are told only to the two officers and to those
 * who write the roster.
 * Nothing here rates an officer.
 */
@RestController
class DutyRosterController {
    static final String MANAGE = "roster.manage";
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final int MAX_DAYS = 31;
    /** How far ahead a court date on a day with nothing rostered for the officer is pointed out (later days are not written yet). */
    private static final int NOTHING_ROSTERED_DAYS = 7;
    /** The entries of a station (one ?) that have not been taken back. */
    private static final String ENTRIES = """
            select a.id, a.officer_id, u.full_name, u.rank, a.on_date, a.kind, a.shift, a.post, a.note
            from duty_assignment a join app_user u on u.id = a.officer_id
            where a.station_id = ? and not exists (select 1 from duty_assignment_cancel c where c.assignment_id = a.id)""";

    record NewEntry(@NotNull UUID stationId, @NotNull UUID officerId, @NotBlank String date,
            @NotBlank @Pattern(regexp = "duty|weekly_off|leave") String kind,
            @Pattern(regexp = "morning|evening|night") String shift,
            @Pattern(regexp = "station_house|front_desk|beat|patrol|court|lock_up|bandobast") String post,
            @Size(max = 300) String note) {}

    record Cancel(@NotBlank @Size(min = 10, max = 500) String reason) {}

    record SwapRequest(@NotNull UUID giveId, @NotNull UUID takeId, @NotBlank @Size(max = 500) String reason) {}

    record SwapDecision(@NotNull Boolean approve, @Size(max = 500) String note) {}

    /** One side of a swap: a roster entry with its officer, and whether it still stands and has not passed. */
    record Duty(UUID id, UUID station, UUID officer, String officerName, LocalDate on, String shift, String post, String note, boolean swappable) {}

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

    /**
     * Who is on duty at the station at this India time. Asked of the table itself: from midnight to 6 am the shift running
     * is yesterday's night, which a list that starts today does not hold. An officer since moved or closed is not named.
     */
    List<Map<String, Object>> onDuty(UUID station, LocalDateTime now) {
        String[] shift = shiftAt(now);
        return db.sql(ENTRIES + " and u.active and u.station_id = a.station_id and a.kind = 'duty' and a.on_date = ? and a.shift = ? order by a.post, u.full_name, a.id")
                .params(station, LocalDate.parse(shift[1]), shift[0]).query().listOfRows();
    }

    /**
     * Court dates the roster does not allow for: a case of the station with a court date on a day its investigating officer
     * is off, on leave or rostered with no court duty (one line for a case and day, with the day's first entry), and, in
     * the next seven days, a day with nothing rostered for that officer (kind null), at a station that has written its
     * roster for today or later. Only cases the caller may open are named. Who attends is for people to decide.
     */
    private List<Map<String, Object>> courtClashes(UUID me, UUID station, LocalDate from, LocalDate before) {
        LocalDate today = LocalDate.now(IST), week = today.plusDays(NOTHING_ROSTERED_DAYS);
        return db.sql("""
                select distinct on (c.on_date, u.full_name, fir.io_id, fir.fir_year, fir.fir_no)
                       c.on_date, fir.io_id as officer_id, u.full_name, u.rank, a.kind, a.shift, a.post, fir.id as fir_id, fir.fir_no, fir.fir_year
                from fir
                join app_user u on u.id = fir.io_id and u.active and u.station_id = fir.station_id
                join court_event c on c.fir_id = fir.id
                left join duty_assignment a on a.officer_id = fir.io_id and a.on_date = c.on_date and a.station_id = fir.station_id
                  and not exists (select 1 from duty_assignment_cancel x where x.assignment_id = a.id)
                where fir.station_id = ? and c.on_date >= ? and c.on_date < ?
                  and (a.id is not null or c.on_date < ? and exists (select 1 from duty_assignment w where w.station_id = fir.station_id and w.on_date >= ?
                       and not exists (select 1 from duty_assignment_cancel x where x.assignment_id = w.id)))
                  and not exists (select 1 from duty_assignment k where k.officer_id = fir.io_id and k.on_date = c.on_date and k.post = 'court'
                                  and not exists (select 1 from duty_assignment_cancel x where x.assignment_id = k.id))
                  and""" + " " + team.canReadFirSql() + """
                 order by c.on_date, u.full_name, fir.io_id, fir.fir_year, fir.fir_no, array_position(array['morning','evening','night'], a.shift)""")
                .params(station, from, before, week, today, me).query().listOfRows();
    }

    private boolean reads(UUID me, UUID station) {
        return posted(me, station) || team.canAt(me, MANAGE, station);
    }

    @GetMapping("/api/duty-roster")
    Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId, @RequestParam(required = false) String from) {
        UUID me = CaseTeam.user(jwt);
        if (!reads(me, stationId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only officers of this police station, and those who run its roster, see it.");
        LocalDateTime now = LocalDateTime.now(IST);
        LocalDate start = from == null || from.isBlank() ? now.toLocalDate() : date(from);
        List<Map<String, Object>> rows = db.sql(ENTRIES + """
                 and a.on_date >= ? and a.on_date < ?
                order by a.on_date, array_position(array['morning','evening','night'], a.shift) nulls last, a.post nulls last, u.full_name, a.id""")
                .params(stationId, start, start.plusDays(MAX_DAYS)).query().listOfRows();
        boolean manages = team.canAt(me, MANAGE, stationId);
        return Map.of("from", start.toString(), "rows", rows, "now", Map.of("shift", shiftAt(now)[0], "on_duty", onDuty(stationId, now)),
                "court_clashes", courtClashes(me, stationId, start.isAfter(now.toLocalDate()) ? start : now.toLocalDate(), start.plusDays(MAX_DAYS)),
                "swaps", swaps(me, stationId, manages), "can_manage", manages);
    }

    /** The station's swap requests: those waiting, and those asked or decided in the last 31 days. */
    private List<Map<String, Object>> swaps(UUID me, UUID station, boolean manages) {
        return db.sql("""
                select s.id, case when d.swap_id is not null then case when d.approved then 'approved' else 'refused' end
                            when duty_swappable(s.give_id) and duty_swappable(s.take_id) then 'waiting' else 'lapsed' end as state,
                       g.officer_id as give_officer_id, gu.full_name as give_name, gu.rank as give_rank, g.on_date as give_date, g.shift as give_shift, g.post as give_post,
                       t.officer_id as take_officer_id, tu.full_name as take_name, tu.rank as take_rank, t.on_date as take_date, t.shift as take_shift, t.post as take_post,
                       case when ? or ? in (g.officer_id, t.officer_id) then s.reason end as reason,
                       case when ? or ? in (g.officer_id, t.officer_id) then d.note end as note, du.full_name as decided_by
                from duty_swap s
                join duty_assignment g on g.id = s.give_id join app_user gu on gu.id = g.officer_id
                join duty_assignment t on t.id = s.take_id join app_user tu on tu.id = t.officer_id
                left join duty_swap_decision d on d.swap_id = s.id left join app_user du on du.id = d.decided_by
                where g.station_id = ? and (coalesce(d.decided_at, s.asked_at) > now() - interval '31 days'
                      or (d.swap_id is null and duty_swappable(s.give_id) and duty_swappable(s.take_id)))
                order by (d.swap_id is not null), s.asked_at desc, s.id""")
                .params(manages, me, manages, me, station).query().listOfRows();
    }

    @PostMapping("/api/duty-roster/swaps")
    @Transactional
    ResponseEntity<Map<String, Object>> askSwap(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SwapRequest r) {
        UUID me = CaseTeam.user(jwt);
        // an officer asks for their own duty at the station they are posted at; anything else is the same answer as no entry
        Duty give = duty(r.giveId).filter(d -> d.officer.equals(me) && posted(me, d.station))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such duty of yours."));
        Duty take = duty(r.takeId).filter(d -> d.station.equals(give.station))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such duty at your police station."));
        if (take.officer.equals(me)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose another officer's duty.");
        if (r.reason.trim().length() < 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say why in at least 10 characters.");
        lockOfficers(give.officer, take.officer);
        requirePossible(duty(give.id).orElseThrow(), duty(take.id).orElseThrow());
        if (db.sql("""
                select exists (select 1 from duty_swap s where (s.give_id in (?,?) or s.take_id in (?,?))
                  and duty_swappable(s.give_id) and duty_swappable(s.take_id) and not exists (select 1 from duty_swap_decision d where d.swap_id = s.id))""")
                .params(give.id, take.id, give.id, take.id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "One of these duties is already in a request that waits for a decision.");
        UUID id = db.sql("insert into duty_swap (give_id, take_id, reason, asked_by) values (?,?,?,?) returning id")
                .params(give.id, take.id, r.reason.trim(), me).query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/duty-roster/swaps/{id}/decision")
    @Transactional
    ResponseEntity<Void> decideSwap(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody SwapDecision d) {
        UUID me = CaseTeam.user(jwt);
        var swap = db.sql("select give_id, take_id from duty_swap where id = ? for update").param(id).query().listOfRows().stream().findFirst().orElse(null);
        Duty give = swap == null ? null : duty((UUID) swap.get("give_id")).orElseThrow();
        // as for a roster entry: another station's request is the same answer as one that does not exist
        if (give == null || !team.canAt(me, MANAGE, give.station)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such swap request.");
        Duty take = duty((UUID) swap.get("take_id")).orElseThrow();
        lockOfficers(give.officer, take.officer);
        if (db.sql("select exists (select 1 from duty_swap_decision where swap_id = ?)").param(id).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request has already been decided.");
        String note = d.note == null || d.note.isBlank() ? null : d.note.trim();
        if (!d.approve && (note == null || note.length() < 10))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say why the swap is refused (at least 10 characters).");
        if (d.approve) requirePossible(duty(give.id).orElseThrow(), duty(take.id).orElseThrow());   // read again, now that both officers are locked
        db.sql("insert into duty_swap_decision (swap_id, approved, note, decided_by) values (?,?,?,?)").params(id, d.approve, note, me).update();
        if (d.approve) {
            for (UUID old : List.of(give.id, take.id))
                db.sql("insert into duty_assignment_cancel (assignment_id, reason, cancelled_by) values (?, 'Swapped on an approved request', ?)").params(old, me).update();
            write(give, take.officer, me);
            write(take, give.officer, me);
        }
        return ResponseEntity.noContent().build();
    }

    /** The duty of one entry, written for the other officer. */
    private void write(Duty d, UUID officer, UUID by) {
        db.sql("insert into duty_assignment (station_id, officer_id, on_date, kind, shift, post, note, recorded_by) values (?,?,?,'duty',?,?,?,?)")
                .params(d.station, officer, d.on, d.shift, d.post, d.note, by).update();
    }

    private Optional<Duty> duty(UUID id) {
        return db.sql("""
                select a.id, a.station_id, a.officer_id, u.full_name, a.on_date, a.shift, a.post, a.note, duty_swappable(a.id) as swappable
                from duty_assignment a join app_user u on u.id = a.officer_id where a.id = ?""").param(id)
                .query((rs, n) -> new Duty(rs.getObject("id", UUID.class), rs.getObject("station_id", UUID.class), rs.getObject("officer_id", UUID.class),
                        rs.getString("full_name"), rs.getObject("on_date", LocalDate.class), rs.getString("shift"), rs.getString("post"), rs.getString("note"),
                        rs.getBoolean("swappable")))
                .optional();
    }

    /** Both duties still there, both officers still posted, and neither left with two entries for a shift or a duty on a day off. */
    private void requirePossible(Duty give, Duty take) {
        if (!give.swappable || !take.swappable)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only duties that stand on the roster and have not passed can be swapped.");
        if (!posted(give.officer, give.station) || !posted(take.officer, give.station))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "One of the two officers is no longer posted at this police station.");
        for (var move : List.of(Map.entry(take, give), Map.entry(give, take))) {   // (the duty taken, the taker's own duty given away)
            Duty taken = move.getKey(), given = move.getValue();
            if (db.sql("""
                    select exists (select 1 from duty_assignment a where a.officer_id = ? and a.on_date = ? and a.id <> ? and (a.kind <> 'duty' or a.shift = ?)
                      and not exists (select 1 from duty_assignment_cancel c where c.assignment_id = a.id))""")
                    .params(given.officer, taken.on, given.id, taken.shift).query(Boolean.class).single())
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        given.officerName + " already has an entry for that shift, or is off or on leave that day.");
        }
    }

    /** Serialises the roster writes of these officers (the same row lock a new entry takes), in one order. */
    private void lockOfficers(UUID a, UUID b) {
        db.sql("select id from app_user where id in (?,?) order by id for update").params(a, b).query().listOfRows();
    }

    private boolean posted(UUID officer, UUID station) {
        return db.sql("select exists (select 1 from app_user where id = ? and active and station_id = ?)").params(officer, station).query(Boolean.class).single();
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
        if (!posted(e.officerId, e.stationId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The officer is not posted at this police station.");
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
