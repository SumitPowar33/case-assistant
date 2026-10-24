package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DataIntegrityViolationException;
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
 * Sign-in, "who am I", and user accounts. Only the state admin creates users. The first admin comes from
 * BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD at start-up, so no password is ever in the code.
 */
@RestController
@RequestMapping("/api")
class AuthController implements ApplicationRunner {
    record Login(@NotBlank String username, @NotBlank String password) {}

    record NewUser(@NotBlank @Pattern(regexp = "[a-z0-9._-]{3,40}") String username,
                   @NotBlank @Size(min = 12, max = 200) String password, @NotBlank String fullName,
                   @NotBlank String rank, @NotBlank String role, UUID stationId) {}

    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JwtEncoder tokens;
    private final CaseTeam team;
    private final String bootstrapUser;
    private final String bootstrapPassword;
    /** Checked when the username is unknown, so a wrong username takes as long as a wrong password. */
    private final String dummyHash;

    AuthController(JdbcClient db, PasswordEncoder passwords, JwtEncoder tokens, CaseTeam team,
                   @Value("${BOOTSTRAP_ADMIN_USERNAME:}") String bootstrapUser,
                   @Value("${BOOTSTRAP_ADMIN_PASSWORD:}") String bootstrapPassword) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
        this.team = team;
        this.bootstrapUser = bootstrapUser;
        this.bootstrapPassword = bootstrapPassword;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @PostMapping("/login")
    ResponseEntity<Map<String, Object>> login(@Valid @RequestBody Login l) {
        var row = db.sql("""
                select id, username, full_name, rank, role, station_id, ui_language, password_hash
                from app_user where username = ? and active""").param(l.username.trim().toLowerCase())
                .query().listOfRows().stream().findFirst();
        String hash = row.map(r -> (String) r.get("password_hash")).orElse(null);
        boolean ok = passwords.matches(l.password, hash != null ? hash : dummyHash) && hash != null;
        if (!ok) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Wrong username or password."));
        var user = new LinkedHashMap<>(row.get());
        user.remove("password_hash");
        String token = SecurityConfig.issue(tokens, (UUID) user.get("id"), (String) user.get("role"), (String) user.get("full_name"));
        return ResponseEntity.ok(Map.of("token", token, "expiresInSeconds", SecurityConfig.TOKEN_LIFE.toSeconds(), "user", user));
    }

    @GetMapping("/me")
    Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
        return db.sql("select id, username, full_name, rank, role, station_id, ui_language from app_user where id = ?")
                .param(CaseTeam.user(jwt)).query().singleRow();
    }

    @PostMapping("/users")
    ResponseEntity<Map<String, UUID>> createUser(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NewUser u) {
        if (!team.hasRole(CaseTeam.user(jwt), "state_admin"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the state admin creates users.");
        UUID id = db.sql("""
                insert into app_user (username, password_hash, full_name, rank, role, station_id)
                values (?,?,?,?,?,?) returning id""")
                .params(u.username, passwords.encode(u.password), u.fullName, u.rank, u.role, u.stationId)
                .query(UUID.class).single();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
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

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected() {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this user (a rule or a duplicate username)."));
    }
}
