package in.caseassistant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sign-in, "who am I" and the user's own password. Accounts are managed in {@link AdminController}. The first admin comes from
 * BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD at start-up, so no password is ever in the code.
 */
@RestController
@RequestMapping("/api")
class AuthController implements ApplicationRunner {
    record Login(@NotBlank @Size(max = 200) String username, @NotBlank @Size(max = 200) String password) {}

    record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(min = 12, max = 200) String newPassword) {}

    /** 5 wrong passwords within 15 minutes lock the username for 15 minutes. */
    static final int MAX_WRONG = 5;
    static final Duration LOCK = Duration.ofMinutes(15);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JwtEncoder tokens;
    private final CaseTeam team;
    private final Policies policies;
    private final String bootstrapUser;
    private final String bootstrapPassword;
    /** Checked when the username is unknown, so a wrong username takes as long as a wrong password. */
    private final String dummyHash;

    AuthController(JdbcClient db, PasswordEncoder passwords, JwtEncoder tokens, CaseTeam team, Policies policies,
                   @Value("${BOOTSTRAP_ADMIN_USERNAME:}") String bootstrapUser,
                   @Value("${BOOTSTRAP_ADMIN_PASSWORD:}") String bootstrapPassword) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
        this.team = team;
        this.policies = policies;
        this.bootstrapUser = bootstrapUser;
        this.bootstrapPassword = bootstrapPassword;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @PostMapping("/login")
    ResponseEntity<Map<String, Object>> login(@Valid @RequestBody Login l, HttpServletRequest req) {
        String username = l.username.trim().toLowerCase();
        var row = db.sql("""
                select id, username, full_name, rank, role, station_id, ui_language, password_hash, password_changed_at
                from app_user where username = ? and active""").param(username)
                .query().listOfRows().stream().findFirst();
        UUID userId = row.map(r -> (UUID) r.get("id")).orElse(null);
        var locked = lockedUntil(username);
        if (locked.isPresent()) {
            record(username, userId, "locked", req);
            return tooMany(locked.get());
        }
        String hash = row.map(r -> (String) r.get("password_hash")).orElse(null);
        boolean ok = passwords.matches(l.password, hash != null ? hash : dummyHash) && hash != null;
        record(username, userId, ok ? "ok" : "wrong_password", req);
        if (!ok) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Wrong username or password."));
        var user = new LinkedHashMap<>(row.get());
        user.remove("password_hash");
        user.put("can_import", team.can((UUID) user.get("id"), "import.run"));
        user.put("can_set_policy", team.can((UUID) user.get("id"), "policy.set") || team.can((UUID) user.get("id"), "admin.manage"));
        var changedAt = (java.sql.Timestamp) user.remove("password_changed_at");
        var life = policies.sessionLife((UUID) user.get("station_id"));
        String token = SecurityConfig.issue(tokens, (UUID) user.get("id"), (String) user.get("role"), (String) user.get("full_name"), changedAt, life);
        return ResponseEntity.ok(Map.of("token", token, "expiresInSeconds", life.toSeconds(), "user", user));
    }

    @GetMapping("/me")
    Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
        var me = new LinkedHashMap<>(db.sql("select id, username, full_name, rank, role, station_id, ui_language from app_user where id = ?")
                .param(CaseTeam.user(jwt)).query().singleRow());
        me.put("can_import", team.can(CaseTeam.user(jwt), "import.run"));
        me.put("can_set_policy", team.can(CaseTeam.user(jwt), "policy.set") || team.can(CaseTeam.user(jwt), "admin.manage"));
        // the AI gateway reads this on every call and refuses a cloud provider when the user's unit said no
        me.put("ai_cloud_allowed", policies.effective((UUID) me.get("station_id"), "ai_cloud_allowed") == 1);
        return me;
    }

    /** Changes the signed-in user's own password. Every older token stops working; a fresh one is returned. */
    @PostMapping("/me/password")
    ResponseEntity<Map<String, Object>> changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordChange c,
                                                      HttpServletRequest req) {
        UUID id = CaseTeam.user(jwt);
        var u = db.sql("select username, password_hash, role, full_name from app_user where id = ?").param(id).query().singleRow();
        String username = (String) u.get("username");
        var locked = lockedUntil(username);
        if (locked.isPresent()) {
            record(username, id, "locked", req);
            return tooMany(locked.get());
        }
        if (u.get("password_hash") == null || !passwords.matches(c.currentPassword, (String) u.get("password_hash"))) {
            record(username, id, "wrong_current_password", req);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "The current password is wrong."));
        }
        if (c.newPassword.equals(c.currentPassword))
            return ResponseEntity.badRequest().body(Map.of("error", "The new password must be different."));
        var changedAt = db.sql("update app_user set password_hash = ?, password_changed_at = clock_timestamp() where id = ? returning password_changed_at")
                .params(passwords.encode(c.newPassword), id).query(java.sql.Timestamp.class).single();
        record(username, id, "password_changed", req);
        var life = policies.sessionLife(db.sql("select station_id from app_user where id = ?").param(id).query(UUID.class).optional().orElse(null));
        String token = SecurityConfig.issue(tokens, id, (String) u.get("role"), (String) u.get("full_name"), changedAt, life);
        return ResponseEntity.ok(Map.of("token", token, "expiresInSeconds", life.toSeconds()));
    }

    /** The sign-in log, newest first; state admin only. Passwords are never recorded. */
    @GetMapping("/sign-ins")
    List<Map<String, Object>> signIns(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String username) {
        if (!team.can(CaseTeam.user(jwt), "admin.manage"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the state admin reads the sign-in log.");
        return db.sql("""
                select username_tried, outcome, client_ip, at from sign_in_attempt
                where ?::text is null or username_tried = lower(btrim(?::text)) order by at desc limit 200""")
                .params(username, username).query().listOfRows();
    }

    /**
     * When the username is locked: the 5 latest wrong passwords since the last success fall within 15 minutes,
     * and the latest is less than 15 minutes old. Attempts made while locked do not count; an unlock by the
     * state admin clears earlier wrong passwords like a successful sign-in.
     */
    Optional<Instant> lockedUntil(String username) {
        List<OffsetDateTime> wrong = db.sql("""
                select at from sign_in_attempt
                where username_tried = ? and outcome in ('wrong_password','wrong_current_password')
                  and at > coalesce((select max(at) from sign_in_attempt where username_tried = ?
                                     and outcome in ('ok','password_changed','unlocked_by_admin')), '-infinity')
                order by at desc limit ?""").params(username, username, MAX_WRONG).query(OffsetDateTime.class).list();
        if (wrong.size() < MAX_WRONG) return Optional.empty();
        Instant latest = wrong.get(0).toInstant(), fifth = wrong.get(MAX_WRONG - 1).toInstant();
        Instant until = latest.plus(LOCK);
        return Duration.between(fifth, latest).compareTo(LOCK) <= 0 && Instant.now().isBefore(until) ? Optional.of(until) : Optional.empty();
    }

    void record(String username, UUID userId, String outcome, HttpServletRequest req) {
        db.sql("insert into sign_in_attempt (username_tried, user_id, outcome, client_ip) values (left(coalesce(?, '(no username)'), 80), ?, ?, ?)")
                .params(username, userId, outcome, req.getRemoteAddr()).update();
    }

    private static ResponseEntity<Map<String, Object>> tooMany(Instant until) {
        long seconds = Math.max(1, Duration.between(Instant.now(), until).toSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", String.valueOf(seconds))
                .body(Map.of("error", "Too many wrong passwords. Try again after "
                        + DateTimeFormatter.ofPattern("HH:mm").format(until.atZone(IST)) + " IST."));
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureAdmin(bootstrapUser, bootstrapPassword);
    }

    /** Creates the first state admin if both values are given and the username is free. */
    void ensureAdmin(String username, String password) {
        if (username.isBlank() || password.isBlank()) return;
        if (password.length() < 12) throw new IllegalStateException("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters");
        db.sql("""
                insert into app_user (username, password_hash, full_name, rank, role)
                values (?, ?, 'State Admin', 'Admin', 'state_admin') on conflict (username) do nothing""")
                .params(username.trim().toLowerCase(), passwords.encode(password)).update();
    }
}
