package in.caseassistant;

import java.util.ArrayList;
import java.util.List;

/** Reads and writes CSV (RFC 4180: quotes, doubled quotes, line breaks inside quotes). The separator is found from the first line. */
final class Csv {
    private Csv() {}

    static List<List<String>> parse(String text) {
        if (text.startsWith("﻿")) text = text.substring(1);
        String first = text.lines().findFirst().orElse("");
        char sep = ",;\t|".chars().mapToObj(c -> (char) c)
                .max(java.util.Comparator.comparingLong(c -> first.chars().filter(x -> x == c).count())).get();
        var rows = new ArrayList<List<String>>();
        var row = new ArrayList<String>();
        var cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c != '"') cell.append(c);
                else if (i + 1 < text.length() && text.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == sep) { row.add(cell.toString().trim()); cell.setLength(0); }
            else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                end(rows, row, cell);
            } else cell.append(c);
        }
        if (quoted) throw new IllegalArgumentException("A quoted value is never closed.");
        end(rows, row, cell);
        return rows;
    }

    private static void end(List<List<String>> rows, List<String> row, StringBuilder cell) {
        row.add(cell.toString().trim());
        cell.setLength(0);
        if (row.stream().anyMatch(v -> !v.isEmpty())) rows.add(new ArrayList<>(row));
        row.clear();
    }

    /** One CSV line. A value starting with = + - @ is prefixed with ' so a spreadsheet never runs it as a formula. */
    static String line(List<?> values) {
        var sb = new StringBuilder();
        for (Object o : values) {
            String v = o == null ? "" : o.toString();
            if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) v = "'" + v;
            if (sb.length() > 0) sb.append(',');
            sb.append('"').append(v.replace("\"", "\"\"")).append('"');
        }
        return sb.append("\r\n").toString();
    }
}
