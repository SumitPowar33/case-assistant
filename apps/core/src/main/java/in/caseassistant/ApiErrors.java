package in.caseassistant;

import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

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

    /**
     * A query parameter of the wrong kind (e.g. limit=abc) is the caller's mistake, not a server fault: a plain 400,
     * not a 500. Without this it would fall to {@link #unexpected} by its NumberFormatException cause (an
     * IllegalArgumentException). The bad value is not echoed, so nothing a caller sent comes back.
     */
    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    ResponseEntity<Map<String, String>> badRequestParam(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", "A request parameter is missing or of the wrong kind."));
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
