import ExcelJS from 'exceljs';

/**
 * Read ONLY the header row of an xlsx file using the streaming reader, so even a
 * huge upload is validated cheaply (we stop after the first row).
 * Returns an array of trimmed header strings.
 */
export async function readHeaderRow(filePath) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    entries: 'emit',
    styles: 'ignore',
  });

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      const headers = [];
      // row.values is 1-indexed (index 0 is empty)
      const values = Array.isArray(row.values) ? row.values : [];
      for (let i = 1; i < values.length; i += 1) {
        headers.push(cellText(values[i]));
      }
      // we only need the first row of the first worksheet
      return headers.filter((h) => h !== '');
    }
    break;
  }
  return [];
}

/** Coerce an ExcelJS cell value (rich text, hyperlink, formula, etc.) to text. */
export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim(); // formula
    if (v.hyperlink !== undefined) return String(v.hyperlink).trim();
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v instanceof Date) return v; // preserve real dates for the date parser
  }
  return String(v).trim();
}

/** Raw cell value but Date-aware (keeps Date objects and numbers intact). */
export function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text !== undefined) return v.text;
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.hyperlink !== undefined) return v.hyperlink;
  }
  return v;
}

/**
 * Build an xlsx summary workbook in memory and return a Buffer. `rows` is an
 * array of flat objects; `columns` is an array of { header, key }.
 */
export async function buildSummaryBuffer(rows, columns) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
