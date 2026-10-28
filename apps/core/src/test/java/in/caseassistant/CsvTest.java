package in.caseassistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class CsvTest {
    @Test
    void readsQuotesLineBreaksAndBlankLines() {
        var rows = Csv.parse("﻿a,b\r\n\"x, \"\"y\"\"\",\"two\nlines\"\n\n,\n1,2");
        assertThat(rows).containsExactly(List.of("a", "b"), List.of("x, \"y\"", "two\nlines"), List.of("1", "2"));
    }

    @Test
    void findsTheSeparatorFromTheHeader() {
        assertThat(Csv.parse("a;b;c\n1;2;3")).containsExactly(List.of("a", "b", "c"), List.of("1", "2", "3"));
        assertThat(Csv.parse("a\tb\n1\t2").get(1)).containsExactly("1", "2");
    }

    @Test
    void anOpenQuoteIsAnError() {
        assertThatThrownBy(() -> Csv.parse("a,b\n\"x,y")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void writesQuotedValuesAndDefusesFormulas() {
        assertThat(Csv.line(List.of("=1+1", "say \"hi\"", 5))).isEqualTo("\"'=1+1\",\"say \"\"hi\"\"\",\"5\"\r\n");
        assertThat(Csv.line(java.util.Arrays.asList("@x", null))).isEqualTo("\"'@x\",\"\"\r\n");
    }
}
