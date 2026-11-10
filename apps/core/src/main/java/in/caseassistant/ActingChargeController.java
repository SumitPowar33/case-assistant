package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Acting charge (decision 2 of 2 Nov 2026, BNSS 2(1)(r)): while the officer in charge of a station is away, an officer
 * posted at that station holds the role for a limited time. A holder of {@code acting.grant} in reach of the station (the SP
 * of its district, the state admin of its state) gives it, with a reason and a last day at most 90 days away (India date);
 * it ends by itself after that day, or earlier when a holder of {@code acting.grant} ends it with a reason. Nobody gives it
 * to themselves. Only a role that holds {@code acting.allowed} in the packs can be given. Both steps are kept as written
 * ({@code acting_charge}, {@code acting_charge_end}) and also in the admin log, which the audit screen shows. How access
 * follows an acting charge is in {@link CaseTeam#holds}.
 */
@RestController
class ActingChargeController {
    static final String GRANT = "acting.grant";
    static final String ALLOWED = "acting.allowed";
    static final int MAX_DAYS = 90;

    record NewCharge(@NotNull UUID userId, @NotBlank String role, @NotNull LocalDate endsOn, @NotBlank @Size(min = 10, max = 500) String reason) {}
    record End(@NotBlank @Size(min = 10, max = 500) String reason) {}

    private final JdbcClient db;
    private final CaseTeam team;
    private final Roles roles;

    ActingChargeController(JdbcClient db, CaseTeam team, Roles roles) {
        this.db = db;
        this.team = team;
        this.roles = roles;
    }

    private UUID stationOf(UUID user) {
        return db.sql("select station_id from app_user where id = ?").param(user).query(UUID.class).optional().orElse(null);
    }

    /** The charges of one station, newest first, each with its state now: running, ended early or finished. */
    @GetMapping("/api/acting-charges")
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID stationId) {
        if (!team.canAt(CaseTeam.user(jwt), GRANT, stationId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the SP of the district or the state admin can see this.");
        return db.sql("""
                select c.id, c.user_id, u.full_name, u.rank, c.role, r.label as role_label, c.reason, c.starts_at, c.ends_at,
                       g.full_name as granted_by_name, e.reason as ended_reason, e.ended_at, eb.full_name as ended_by_name,
                       case when e.charge_id is not null then 'ended' when c.ends_at <= clock_timestamp() then 'finished' else 'running' end as status
                from acting_charge c join app_user u on u.id = c.user_id join role r on r.code = c.role join app_user g on g.id = c.granted_by
                left join acting_charge_end e on e.charge_id = c.id left join app_user eb on eb.id = e.ended_by
                where c.station_id = ? order by c.starts_at desc, c.id""").param(stationId).query().listOfRows();
    }

    @PostMapping("/api/acting-charges")
    @Transactional
    ResponseEntity<Map<String, Object>> give(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewCharge c) {
        UUID me = CaseTeam.user(jwt);
        if (me.equals(c.userId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Nobody gives acting charge to themselves.");
        UUID station = stationOf(c.userId);
        if (station == null || !team.canAt(me, GRANT, station))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the SP of the district or the state admin can give acting charge, and only to an officer of a station in their reach.");
        if (!roles.exists(c.role) || !roles.has(c.role, ALLOWED))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This role cannot be held as an acting charge.");
        var officer = db.sql("select role, active from app_user where id = ?").param(c.userId).query().singleRow();
        if (!(Boolean) officer.get("active")) throw new ResponseStatusException(HttpStatus.CONFLICT, "This account is closed.");
        if (c.role.equals(officer.get("role"))) throw new ResponseStatusException(HttpStatus.CONFLICT, "The officer already holds this role.");
        LocalDate today = db.sql("select (now() at time zone 'Asia/Kolkata')::date").query(LocalDate.class).single();
        if (c.endsOn.isBefore(today) || c.endsOn.isAfter(today.plusDays(MAX_DAYS - 1)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The last day must be today or later, and within " + MAX_DAYS + " days.");
        boolean running = db.sql("""
                select exists (select 1 from acting_charge ac where ac.user_id = ? and ac.role = ? and ac.ends_at > clock_timestamp()
                  and not exists (select 1 from acting_charge_end ae where ae.charge_id = ac.id))""")
                .params(c.userId, c.role).query(Boolean.class).single();
        if (running) throw new ResponseStatusException(HttpStatus.CONFLICT, "This officer already has this acting charge running.");
        // the charge ends at the close of its last day, India time
        UUID id = db.sql("""
                insert into acting_charge (user_id, station_id, role, reason, ends_at, granted_by)
                values (?,?,?,?, ((?::date + 1)::timestamp at time zone 'Asia/Kolkata'), ?) returning id""")
                .params(c.userId, station, c.role, c.reason.trim(), c.endsOn, me).query(UUID.class).single();
        log(me, "acting_started", c.userId, station, c.reason, c.role + " until " + c.endsOn);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @PostMapping("/api/acting-charges/{id}/end")
    @Transactional
    ResponseEntity<Void> end(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody End e) {
        UUID me = CaseTeam.user(jwt);
        var c = db.sql("select user_id, station_id, role, ends_at > clock_timestamp() as running from acting_charge where id = ? for update")
                .param(id).query().listOfRows().stream().findFirst().orElse(null);
        // an outsider learns nothing about a charge of another unit: the same answer as for one that does not exist
        if (c == null || !team.canAt(me, GRANT, (UUID) c.get("station_id"))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such acting charge.");
        if (db.sql("select exists (select 1 from acting_charge_end where charge_id = ?)").param(id).query(Boolean.class).single() || !(Boolean) c.get("running"))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This acting charge has already ended.");
        db.sql("insert into acting_charge_end (charge_id, reason, ended_by) values (?,?,?)").params(id, e.reason.trim(), me).update();
        log(me, "acting_ended", (UUID) c.get("user_id"), (UUID) c.get("station_id"), e.reason, (String) c.get("role"));
        return ResponseEntity.noContent().build();
    }

    private void log(UUID actor, String action, UUID user, UUID station, String reason, String detail) {
        db.sql("insert into admin_action (actor_id, action, user_id, station_id, reason, detail) values (?,?,?,?,?,?)")
                .params(actor, action, user, station, reason.trim(), detail).update();
    }
}
