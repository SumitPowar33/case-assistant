package in.caseassistant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The state admin's work: user accounts (create, disable, enable, unlock) and police stations. Every change is
 * written to the admin log with who made it; disabling, enabling and unlocking need a written reason.
 * Anyone signed in may read the station list (it is needed to pick a station; it holds no case data).
 */
@RestController
@RequestMapping("/api")
class AdminController {
    record NewUser(@NotBlank @Pattern(regexp = "[a-z0-9._-]{3,40}") String username,
                   @NotBlank @Size(min = 12, max = 200) String password, @NotBlank @Size(max = 200) String fullName,
                   @NotBlank @Size(max = 60) String rank,
                   @NotBlank @Pattern(regexp = "[a-z][a-z_]{1,29}") String role,
                   UUID stationId) {}

    record Reason(@NotBlank @Size(min = 10, max = 2000) String reason) {}

    record Change(@NotBlank @Pattern(regexp = "[a-z][a-z_]{1,29}") String role,
                  @NotBlank @Size(max = 60) String rank, UUID stationId, @NotBlank @Size(min = 10, max = 2000) String reason) {}

    record NewStation(@NotBlank @Pattern(regexp = "[A-Z]{2,3}") String stateCode, @NotBlank @Size(max = 120) String district,
                      @NotBlank @Size(max = 200) String name, @Size(max = 40) String cctnsCode) {}

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final CaseTeam team;
    private final AuthController auth;
    private final Roles roles;

    AdminController(JdbcClient db, PasswordEncoder passwords, CaseTeam team, AuthController auth, Roles roles) {
        this.roles = roles;
        this.db = db;
        this.passwords = passwords;
        this.team = team;
        this.auth = auth;
    }

    private UUID requireAdmin(Jwt jwt) {
        UUID me = CaseTeam.user(jwt);
        if (!team.can(me, "admin.manage")) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the state admin can do this.");
        return me;
    }

    /**
     * The state this admin works in: the state of their police station. An admin with no station is the platform
     * admin of the installation (the first account) and works in every state. A state admin can never see or change
     * another state's accounts or stations.
     */
    private String scope(UUID me) {
        return db.sql("select s.state_code from app_user u left join police_station s on s.id = u.station_id where u.id = ?")
                .param(me).query(String.class).optional().orElse(null);
    }

    private void requireKnownRole(String role) {
        if (!roles.exists(role)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such role.");
    }

    /** The roles an account can have (from the packs): code, label, whether a station is needed, permissions. */
    @GetMapping("/roles")
    List<Map<String, Object>> roles(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return roles.list();
    }

    private void requireAccountInScope(String scope, UUID userId) {
        if (scope != null && !db.sql("""
                select exists (select 1 from app_user u join police_station s on s.id = u.station_id
                  where u.id = ? and s.state_code = ?)""").params(userId, scope).query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such account.");
    }

    /** A state admin must place every account at a station of their own state. */
    private void requireStationInScope(String scope, UUID stationId) {
        if (scope == null) return;
        if (stationId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the police station for this account.");
        if (!db.sql("select exists (select 1 from police_station where id = ? and state_code = ?)").params(stationId, scope)
                .query(Boolean.class).single())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such police station in your state.");
    }

    private void log(UUID actor, String action, UUID userId, UUID stationId, String reason) {
        log(actor, action, userId, stationId, reason, null);
    }

    private void log(UUID actor, String action, UUID userId, UUID stationId, String reason, String detail) {
        db.sql("insert into admin_action (actor_id, action, user_id, station_id, reason, detail) values (?,?,?,?,?,?)")
                .params(actor, action, userId, stationId, reason == null ? null : reason.trim(), detail).update();
    }

    /** Every account with its station and whether it is locked now; never a password hash. */
    @GetMapping("/users")
    List<Map<String, Object>> users(@AuthenticationPrincipal Jwt jwt) {
        String scope = scope(requireAdmin(jwt));
        var rows = db.sql("""
                select u.id, u.username, u.full_name, u.rank, u.role, u.station_id, s.name as station_name, d.name as district, u.active
                from app_user u left join police_station s on s.id = u.station_id left join district d on d.id = s.district_id
                where (?::text is null or s.state_code = ?) order by u.active desc, u.full_name""")
                .params(scope, scope).query().listOfRows();
        return rows.stream().map(r -> {
            var m = new LinkedHashMap<>(r);
            String username = (String) r.get("username");
            m.put("locked_until", username == null ? null : auth.lockedUntil(username).map(Object::toString).orElse(null));
            return (Map<String, Object>) m;
        }).toList();
    }

    @PostMapping("/users")
    @Transactional
    ResponseEntity<Map<String, UUID>> createUser(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewUser u) {
        UUID me = requireAdmin(jwt);
        requireKnownRole(u.role);
        if (roles.stationRequired(u.role) && u.stationId == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the police station for this role.");
        requireStationInScope(scope(me), u.stationId);
        UUID id = db.sql("""
                insert into app_user (username, password_hash, full_name, rank, role, station_id)
                values (?,?,?,?,?,?) returning id""")
                .params(u.username, passwords.encode(u.password), u.fullName.trim(), u.rank.trim(), u.role, u.stationId)
                .query(UUID.class).single();
        log(me, "user_created", id, null, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /**
     * Disables an account at once: its tokens stop working here at once and at the AI gateway within its short
     * check interval. The password stamp moves too, so old tokens stay dead if the account is enabled again.
     * The admin cannot disable their own account, so at least one active state admin always remains.
     */
    @PostMapping("/users/{id}/disable")
    @Transactional
    ResponseEntity<Void> disable(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Reason r) {
        UUID me = requireAdmin(jwt);
        if (me.equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot disable your own account.");
        requireAccountInScope(scope(me), id);
        int n = db.sql("update app_user set active = false, password_changed_at = clock_timestamp() where id = ? and active")
                .param(id).update();
        if (n == 0) throw notFoundOr(id, "This account is already disabled.");
        log(me, "user_disabled", id, null, r.reason);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/enable")
    @Transactional
    ResponseEntity<Void> enable(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Reason r) {
        UUID me = requireAdmin(jwt);
        requireAccountInScope(scope(me), id);
        if (db.sql("update app_user set active = true where id = ? and not active").param(id).update() == 0)
            throw notFoundOr(id, "This account is already active.");
        log(me, "user_enabled", id, null, r.reason);
        return ResponseEntity.noContent().build();
    }

    /**
     * Changes an account's role, rank or police station (a transfer or a promotion), with a reason. The admin log
     * keeps what changed. The officer's older tokens end, so they sign in again and see their new role. Case access
     * follows at once (it is read from the account, not the token). FIRs that still name the officer as IO are
     * counted in the answer, because a transferred IO stays IO of them until the cases are given to someone else.
     * The admin cannot change their own account, so one state admin always remains.
     */
    @PutMapping("/users/{id}")
    @Transactional
    Map<String, Object> change(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Change c) {
        UUID me = requireAdmin(jwt);
        if (me.equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot change your own account.");
        String scope = scope(me);
        requireAccountInScope(scope, id);
        requireKnownRole(c.role);
        UUID station = c.stationId;
        if (roles.stationRequired(c.role) && station == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose the police station for this role.");
        requireStationInScope(scope, station);
        var old = db.sql("""
                select u.role, u.rank, u.station_id, s.name as station_name from app_user u
                left join police_station s on s.id = u.station_id where u.id = ? for update of u""")
                .param(id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such account."));
        String newStationName = station == null ? null
                : db.sql("select name from police_station where id = ?").param(station).query(String.class).optional()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such police station."));
        var detail = new java.util.ArrayList<String>();
        if (!old.get("role").equals(c.role)) detail.add("role " + old.get("role") + " to " + c.role);
        if (!old.get("rank").equals(c.rank.trim())) detail.add("rank " + old.get("rank") + " to " + c.rank.trim());
        if (!java.util.Objects.equals(old.get("station_id"), station))
            detail.add("station " + java.util.Objects.requireNonNullElse(old.get("station_name"), "none") + " to "
                    + java.util.Objects.requireNonNullElse(newStationName, "none"));
        if (detail.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Nothing to change.");
        db.sql("update app_user set role = ?, rank = ?, station_id = ?, password_changed_at = clock_timestamp() where id = ?")
                .params(c.role, c.rank.trim(), station, id).update();
        log(me, "user_changed", id, null, c.reason, String.join("; ", detail));
        long firsAsIo = db.sql("select count(*) from fir where io_id = ?").param(id).query(Long.class).single();
        return Map.of("changed", String.join("; ", detail), "firsAsIo", firsAsIo);
    }

    /** Ends a sign-in lock before its 15 minutes are up (the officer has been reached and it was them). */
    @PostMapping("/users/{id}/unlock")
    @Transactional
    ResponseEntity<Void> unlock(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Reason r,
                                HttpServletRequest req) {
        UUID me = requireAdmin(jwt);
        requireAccountInScope(scope(me), id);
        String username = db.sql("select username from app_user where id = ?").param(id).query(String.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such account."));
        if (username == null || auth.lockedUntil(username).isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account is not locked.");
        auth.record(username, id, "unlocked_by_admin", req);
        log(me, "user_unlocked", id, null, r.reason);
        return ResponseEntity.noContent().build();
    }

    private ResponseStatusException notFoundOr(UUID id, String conflict) {
        boolean exists = db.sql("select exists (select 1 from app_user where id = ?)").param(id).query(Boolean.class).single();
        return exists ? new ResponseStatusException(HttpStatus.CONFLICT, conflict) : new ResponseStatusException(HttpStatus.NOT_FOUND, "No such account.");
    }

    @GetMapping("/stations")
    List<Map<String, Object>> stations() {
        return db.sql("""
                select s.id, s.state_code, d.name as district, s.name, s.cctns_code from police_station s
                join district d on d.id = s.district_id order by s.state_code, d.name, s.name""")
                .query().listOfRows();
    }

    /** The state packs loaded in this installation; a station belongs to one of them. */
    @GetMapping("/state-packs")
    List<Map<String, Object>> statePacks() {
        return db.sql("select code, name, status from state_pack order by code").query().listOfRows();
    }

    @PostMapping("/stations")
    @Transactional
    ResponseEntity<Map<String, UUID>> createStation(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewStation s) {
        UUID me = requireAdmin(jwt);
        String scope = scope(me);
        if (scope != null && !scope.equals(s.stateCode))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A state admin adds stations only in their own state.");
        String cctns = s.cctnsCode == null || s.cctnsCode.isBlank() ? null : s.cctnsCode.trim();
        UUID id = db.sql("insert into police_station (state_code, district_id, name, cctns_code) values (?, district_id_of(?, ?), ?, ?) returning id")
                .params(s.stateCode, s.stateCode, s.district, s.name.trim(), cctns).query(UUID.class).single();
        log(me, "station_created", null, id, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    /** The admin log, newest first. */
    @GetMapping("/admin-actions")
    List<Map<String, Object>> actions(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt);
        return db.sql("""
                select a.action, a.reason, a.detail, a.at, actor.full_name as actor_name, u.username, u.full_name as user_name, s.name as station_name
                from admin_action a join app_user actor on actor.id = a.actor_id
                left join app_user u on u.id = a.user_id left join police_station s on s.id = a.station_id
                order by a.at desc limit 200""").query().listOfRows();
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error",
                "The database refused this (a duplicate username or CCTNS code, an unknown station, or an unknown state)."));
    }
}
