package in.caseassistant;

import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors no controller answers itself. The answer never carries the SQL, the database's own message or a Java
 * exception text (security review, 2 Nov 2026: a refused insert quoted its SQL statement to the caller). The full
 * error goes to the server log under a reference the officer can quote. A controller's own handler still comes first.
 */
@RestControllerAdvice
class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> refused(DataIntegrityViolationException e) {
        log.info("database refused an entry: {}", e.getMostSpecificCause().getMessage());
        return ResponseEntity.badRequest().body(Map.of("error",
                "The database refused this entry (a rule, a duplicate, or a character it cannot store)."));
    }

    @ExceptionHandler({DataAccessException.class, IllegalArgumentException.class, IllegalStateException.class,
            NullPointerException.class, ClassCastException.class})
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        String ref = UUID.randomUUID().toString().substring(0, 8);
        log.error("unexpected error, reference {}", ref, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error",
                "Something went wrong on the server. Reference " + ref + " (give it to the admin)."));
    }
}
