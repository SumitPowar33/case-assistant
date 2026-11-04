package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Money trail (design board 8, V42): the transfers out of the victim's account and the holds banks have put, typed
 * from bank replies already in the evidence register, and a table of the accused. The table reads the money that
 * reached each accused, whether they are marked as an account holder and the independent links already recorded
 * for the readiness check (V6): it adds nothing of its own and says plainly that money alone is not proof. Only the
 * case team reads or writes; rows are kept as written. No score of any person or case.
 */
@RestController
@RequestMapping("/api/firs/{firId}/money-trail")
class MoneyTrailController {
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    record Transfer(@NotBlank @Size(min = 2, max = 120) String from, @NotBlank @Size(min = 2, max = 120) String to, String toPersonId,
            @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount, @NotBlank String date, String evidenceId) {}

    record Hold(@NotBlank @Size(min = 2, max = 120) String account, @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotBlank String date, String evidenceId) {}

    private final JdbcClient db;
    private final CaseTeam team;

    MoneyTrailController(JdbcClient db, CaseTeam team) {
        this.db = db;
        this.team = team;
    }

    @GetMapping
    Map<String, Object> trail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId) {
        team.requireTeam(CaseTeam.user(jwt), firId);
        var transfers = db.sql("""
                select t.id, t.from_account, t.to_account, t.amount_paise, t.transferred_on, e.label as evidence_label, p.label as to_person
                from money_transfer t left join evidence_item e on e.id = t.evidence_item_id left join person_public p on p.id = t.to_person_id
                where t.fir_id = ? order by t.transferred_on, t.recorded_at""").params(firId).query().listOfRows();
        var holds = db.sql("""
                select h.id, h.account, h.amount_paise, h.held_on, e.label as evidence_label
                from money_hold h left join evidence_item e on e.id = h.evidence_item_id
                where h.fir_id = ? order by h.held_on, h.recorded_at""").params(firId).query().listOfRows();
        // one row per accused: money that reached them, account-holder mark, and the independent links still standing
        var accused = db.sql("""
                select p.id as person_id, p.label, p.display_name as name,
                       coalesce((select sum(t.amount_paise) from money_transfer t where t.to_person_id = p.id), 0) as received_paise,
                       exists (select 1 from account_holder a where a.person_id = p.id) as account_holder,
                       (select count(*) from accused_link l where l.person_id = p.id and l.withdrawn_at is null) as second_links
                from person_public p where p.fir_id = ? and p.role = 'accused' order by p.label, p.id""").params(firId).query().listOfRows();
        for (var a : accused) {
            boolean money = ((Number) a.get("received_paise")).longValue() > 0 || Boolean.TRUE.equals(a.get("account_holder"));
            boolean second = ((Number) a.get("second_links")).longValue() > 0;
            a.put("status", money ? (second ? "both" : "money_only") : (second ? "second_only" : "none"));
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("evidence", db.sql("select id, label from evidence_item where fir_id = ? order by label").param(firId).query().listOfRows());
        out.put("transfers", transfers);
        out.put("holds", holds);
        out.put("accused", accused);
        out.put("transferred_paise", db.sql("select coalesce(sum(amount_paise), 0) from money_transfer where fir_id = ?").param(firId).query(Long.class).single());
        out.put("held_paise", db.sql("select coalesce(sum(amount_paise), 0) from money_hold where fir_id = ?").param(firId).query(Long.class).single());
        return out;
    }

    @PostMapping("/transfers")
    ResponseEntity<Map<String, Object>> addTransfer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Transfer t) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        return created(() -> db.sql("""
                insert into money_transfer (fir_id, from_account, to_account, to_person_id, amount_paise, transferred_on, evidence_item_id, recorded_by)
                values (?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(firId, t.from.trim(), t.to.trim(), optionalId(t.toPersonId), paise(t.amount), pastDate(t.date), optionalId(t.evidenceId), me)
                .query(UUID.class).single());
    }

    @PostMapping("/holds")
    ResponseEntity<Map<String, Object>> addHold(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID firId, @Valid @RequestBody Hold h) {
        UUID me = CaseTeam.user(jwt);
        team.requireTeam(me, firId);
        return created(() -> db.sql("""
                insert into money_hold (fir_id, account, amount_paise, held_on, evidence_item_id, recorded_by)
                values (?, ?, ?, ?, ?, ?) returning id""")
                .params(firId, h.account.trim(), paise(h.amount), pastDate(h.date), optionalId(h.evidenceId), me)
                .query(UUID.class).single());
    }

    /** Runs the insert; a person or evidence item that is not of this case (or not an accused) is a 400, not a database message. */
    private static ResponseEntity<Map<String, Object>> created(java.util.function.Supplier<UUID> insert) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", insert.get()));
        } catch (DataIntegrityViolationException notOfThisCase) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The accused and the evidence item must belong to this case.");
        }
    }

    private static long paise(BigDecimal rupees) {
        return rupees.movePointRight(2).longValueExact();
    }

    /** The day of the bank's entry: a real date, not in the future (Indian time). */
    private static LocalDate pastDate(String text) {
        try {
            LocalDate d = LocalDate.parse(text);
            if (d.isAfter(LocalDate.now(IST))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date cannot be in the future.");
            return d;
        } catch (DateTimeException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date must be written as YYYY-MM-DD.");
        }
    }

    private static UUID optionalId(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException bad) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An id must be one of this case.");
        }
    }
}
