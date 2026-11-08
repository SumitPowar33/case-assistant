package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** A body of unknown length is counted as it is read, by every way of reading it (security review, 2 Nov 2026). */
class BodyLimitTest {
    static BodyLimit.Counted counted(byte[] body, String charset, long limit) {
        var req = new MockHttpServletRequest("POST", "/api/firs");
        req.setContent(body);
        if (charset != null) req.setCharacterEncoding(charset);
        return new BodyLimit.Counted(req, limit);
    }

    @Test
    void readingByteByByteStopsPastTheCapAndTheEndIsNotCounted() throws IOException {
        var in = counted("abcd".getBytes(StandardCharsets.UTF_8), null, 4).getInputStream();
        assertThat(in.isFinished()).isFalse();
        for (char c : "abcd".toCharArray()) assertThat(in.read()).isEqualTo(c);
        assertThat(in.read()).as("the end of the body is not a byte").isEqualTo(-1);
        assertThat(in.isFinished()).isTrue();
        assertThat(in.isReady()).isTrue();
        var over = counted("abcde".getBytes(StandardCharsets.UTF_8), null, 4).getInputStream();
        for (int i = 0; i < 4; i++) over.read();
        assertThatThrownBy(over::read).isInstanceOf(IOException.class).hasMessageContaining("over 4 bytes");
    }

    @Test
    void theReaderCountsTooInTheRequestsCharsetOrUtf8() throws IOException {
        assertThat(counted("नमस्ते".getBytes(StandardCharsets.UTF_8), null, 100).getReader().readLine()).isEqualTo("नमस्ते");
        assertThat(counted("नमस्ते".getBytes(StandardCharsets.UTF_16), "UTF-16", 100).getReader().readLine()).isEqualTo("नमस्ते");
        var big = counted("x".repeat(9000).getBytes(StandardCharsets.UTF_8), null, 8192).getReader();
        assertThatThrownBy(big::readLine).isInstanceOf(IOException.class);
    }

    @Test
    void aReadListenerIsHandedToTheRealStream() throws IOException {
        var in = counted(new byte[0], null, 4).getInputStream();
        assertThatThrownBy(() -> in.setReadListener(null)).isNotInstanceOf(IOException.class);   // the mock stream refuses async reads itself
    }

    @Test
    void anImportMayBeLargerThanAnyOtherBody() {
        assertThat(BodyLimit.limitFor("/api/imports")).isEqualTo(16L << 20);
        assertThat(BodyLimit.limitFor("/api/imports/inspect")).isEqualTo(16L << 20);
        assertThat(BodyLimit.limitFor("/api/imports/x/commit")).isEqualTo(1L << 20);
        assertThat(BodyLimit.limitFor("/api/firs")).isEqualTo(1L << 20);
    }
}
