export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const firstRecord = source.match(/^(?:[^"\r\n]|"(?:[^"]|"")*")*/)?.[0] || "";
  const delimiter = countCsvDelimiter(firstRecord, ";") >= countCsvDelimiter(firstRecord, ",") ? ";" : ",";
  const records = parseCsvRecords(source, delimiter).filter((record) => record.some((value) => value.trim()));
  if (records.length < 2) return [];
  const headers = records[0].map((item, index) => item.trim() || `Coluna ${index + 1}`);
  return records.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
  );
}

export function parseCsvRecords(text, delimiter = ",") {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field.trim());
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || record.length) {
    record.push(field.trim());
    records.push(record);
  }
  return records;
}

function countCsvDelimiter(line, delimiter) {
  return Math.max(0, parseCsvRecords(line, delimiter)[0]?.length - 1 || 0);
}

export function splitCsvLine(line, delimiter = ",") {
  return parseCsvRecords(String(line || ""), delimiter)[0] || [];
}
