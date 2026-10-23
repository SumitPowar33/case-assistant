package in.caseassistant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/firs")
class FirController {
    record NewFir(
            @NotNull UUID stationId, @Positive int firYear, @Positive int firNo, @NotBlank String gdEntryNo,
            @NotNull OffsetDateTime registeredAt, @NotNull OffsetDateTime informationReceivedAt,
            boolean zeroFir, String outsideLimitsPlace, @NotBlank String contentsOriginal,
            @NotBlank String contentsLanguage, @NotBlank String actionTaken, String actionReason,
            UUID ioId, boolean sexualOffence, List<Section> sections) {}

    record Section(@NotBlank String act, @NotBlank String section) {}

    private final JdbcClient db;

    FirController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping
    List<Map<String, Object>> list() {
        return db.sql("select id, fir_year, fir_no, registered_at, is_zero_fir, action_taken, sexual_offence "
                        + "from fir order by registered_at desc")
                .query().listOfRows();
    }

    @GetMapping("/{id}")
    Map<String, Object> one(@PathVariable UUID id) {
        var fir = db.sql("select * from fir where id = ?").param(id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var out = new java.util.LinkedHashMap<>(fir);
        out.put("sections", db.sql("select act, section from fir_section where fir_id = ? order by act, section")
                .param(id).query().listOfRows());
        return out;
    }

    @PostMapping
    @Transactional
    ResponseEntity<Map<String, UUID>> create(@Valid @RequestBody NewFir f) {
        UUID id = db.sql("""
                insert into fir (station_id, fir_year, fir_no, gd_entry_no, registered_at, information_received_at,
                  is_zero_fir, outside_limits_place, contents_original, contents_language, action_taken,
                  action_reason, io_id, sexual_offence)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id""")
                .params(f.stationId, f.firYear, f.firNo, f.gdEntryNo, f.registeredAt, f.informationReceivedAt,
                        f.zeroFir, f.outsideLimitsPlace, f.contentsOriginal, f.contentsLanguage, f.actionTaken,
                        f.actionReason, f.ioId, f.sexualOffence)
                .query(UUID.class).single();
        if (f.sections != null) {
            for (Section s : f.sections) {
                db.sql("insert into fir_section (fir_id, act, section) values (?,?,?)")
                        .params(id, s.act, s.section).update();
            }
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> rejected(DataIntegrityViolationException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "The database rejected this FIR (a rule or a duplicate)."));
    }
}
