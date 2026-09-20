/**
 * A minimal RFC-4180 CSV tokenizer: quoted fields, doubled-quote escaping ("" -> "),
 * commas and newlines inside quotes, CRLF or LF line endings. No dependency, and no
 * knowledge of cases.csv's columns — that belongs in cases.ts.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);

    if (inQuotes) {
      if (char === '"' && text.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // swallowed; the \n that follows (or a lone \r, treated the same) ends the row
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("malformed CSV: unterminated quoted field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
