package in.caseassistant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps the size of a request body before anything reads it: 1 MiB, or 16 MiB for loading a file (an import or a call records file; an import holds up
 * to 5 million characters, 3 bytes each in an Indian script). Security review, 2 Nov 2026: a signed-in user could
 * store a 15 MB name on a case, which every case screen then loads. A body without a declared length is counted as it
 * is read and stops at the cap.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class BodyLimit extends OncePerRequestFilter {
    static final long LIMIT = 1L << 20;
    static final long IMPORT_LIMIT = 16L << 20;
    static final java.util.regex.Pattern CDR_LOAD = java.util.regex.Pattern.compile("/api/firs/[^/]+/cdr");   // a call records file (CdrController)

    static long limitFor(String path) {
        return path.equals("/api/imports") || path.equals("/api/imports/inspect") || CDR_LOAD.matcher(path).matches() ? IMPORT_LIMIT : LIMIT;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        long limit = limitFor(req.getRequestURI());
        if (req.getContentLengthLong() > limit) {
            res.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"This is too large to send (at most " + (limit >> 20) + " MB).\"}");
            return;
        }
        chain.doFilter(req.getContentLengthLong() >= 0 ? req : new Counted(req, limit), res);
    }

    /** A body of unknown length: reading past the cap fails, so it is never taken in whole. */
    static final class Counted extends HttpServletRequestWrapper {
        private final long limit;

        Counted(HttpServletRequest req, long limit) {
            super(req);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream in = super.getInputStream();
            return new ServletInputStream() {
                long seen;

                private int count(int n) throws IOException {
                    if (n > 0 && (seen += n) > limit) throw new IOException("request body over " + limit + " bytes");
                    return n;
                }

                @Override public int read() throws IOException { int b = in.read(); if (b >= 0) count(1); return b; }
                @Override public int read(byte[] b, int off, int len) throws IOException { return count(in.read(b, off, len)); }
                @Override public boolean isFinished() { return in.isFinished(); }
                @Override public boolean isReady() { return in.isReady(); }
                @Override public void setReadListener(ReadListener l) { in.setReadListener(l); }
            };
        }

        @Override
        public java.io.BufferedReader getReader() throws IOException {
            String cs = getCharacterEncoding();
            return new java.io.BufferedReader(new java.io.InputStreamReader(getInputStream(),
                    cs == null ? java.nio.charset.StandardCharsets.UTF_8 : java.nio.charset.Charset.forName(cs)));
        }
    }
}
