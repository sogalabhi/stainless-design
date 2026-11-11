/**
 * Pure helpers for the spreadsheet-like input table (components/DataTable.tsx): reading a typed or
 * pasted number, splitting what Excel puts on the clipboard, and writing a pasted block into rows.
 * No engineering formula lives here: the table only collects the user's inputs.
 */

export type CellKind = "text" | "number";

export type ParsedNumber = { value: number | null; ok: boolean };

/**
 * A number as people type or paste it: "12.5", "12,5" (decimal comma), "1 234.5" or "1,234.5"
 * (grouping), "1e3". Empty means "not given yet" (null, ok). Anything else is not ok, and the
 * value stays null so nothing wrong reaches a calculation.
 */
export function parseNumberCell(text: string): ParsedNumber {
  // spaces, no-break and thin spaces, and apostrophes group digits ("1 234", "1'234")
  let s = text.trim().replace(/[\s\u00a0\u2009\u202f']/g, "");
  if (s === "") return { value: null, ok: true };
  const commas = (s.match(/,/g) ?? []).length;
  if (commas > 0 && s.includes(".")) s = s.replace(/,/g, ""); // 1,234.5: commas group thousands
  else if (commas === 1) s = s.replace(",", "."); // 12,5: a decimal comma
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { value: null, ok: false };
  const value = Number(s);
  return Number.isFinite(value) ? { value, ok: true } : { value: null, ok: false };
}

/**
 * What a spreadsheet puts on the clipboard: rows on lines, cells split by tabs. Semicolons are
 * accepted as separators when there is no tab (CSV from a locale that uses decimal commas).
 * A trailing empty line (Excel adds one) is dropped.
 */
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  const separator = lines.some((line) => line.includes("\t"))
    ? "\t"
    : lines.some((line) => line.includes(";"))
      ? ";"
      : null;
  return lines.map((line) => (separator ? line.split(separator) : [line]).map((cell) => cell.trim()));
}

/** True when a pasted first line looks like column headings: text where numbers are expected. */
export function looksLikeHeader(cells: string[], kinds: CellKind[]): boolean {
  let numberCells = 0;
  let textInNumberCells = 0;
  cells.forEach((cell, index) => {
    if (kinds[index] !== "number" || cell === "") return;
    numberCells += 1;
    if (!parseNumberCell(cell).ok) textInNumberCells += 1;
  });
  return numberCells > 0 && textInNumberCells === numberCells;
}

export type CellValue = string | number | null;

export type PasteResult<R> = {
  rows: R[];
  /** pasted rows written (after the header, if one was skipped) */
  written: number;
  /** rows appended to the table */
  added: number;
  skippedHeader: boolean;
  /** pasted rows dropped because the table is full */
  dropped: number;
  /** pasted cells that were not numbers; their cells are left empty */
  invalid: number;
  /** pasted cells to the right of the last column, ignored */
  ignoredColumns: number;
};

/**
 * Writes a pasted block into the rows, starting at row `startRow` (rows.length means the empty last
 * row) and column `startCol`, appending rows as needed up to `maxRows`. Cells outside the block keep
 * their values.
 */
export function applyPaste<R>(options: {
  rows: R[];
  grid: string[][];
  startRow: number;
  startCol: number;
  kinds: CellKind[];
  set: (row: R, column: number, value: CellValue) => R;
  newRow: (rows: R[]) => R;
  maxRows: number;
}): PasteResult<R> {
  const { grid, startRow, startCol, kinds, set, newRow, maxRows } = options;
  const rows = [...options.rows];
  const pastedKinds = kinds.slice(startCol);
  const skippedHeader = grid.length > 1 && looksLikeHeader(grid[0], pastedKinds);
  const body = skippedHeader ? grid.slice(1) : grid;
  let written = 0;
  let added = 0;
  let dropped = 0;
  let invalid = 0;
  let ignoredColumns = 0;
  body.forEach((cells, offset) => {
    const target = startRow + offset;
    if (target >= maxRows) {
      dropped += 1;
      return;
    }
    while (rows.length <= target) {
      rows.push(newRow(rows));
      added += 1;
    }
    let row = rows[target];
    cells.forEach((cell, index) => {
      const column = startCol + index;
      if (column >= kinds.length) {
        if (cell !== "") ignoredColumns += 1;
        return;
      }
      if (kinds[column] === "number") {
        const parsed = parseNumberCell(cell);
        if (!parsed.ok) invalid += 1;
        row = set(row, column, parsed.value);
      } else {
        row = set(row, column, cell);
      }
    });
    rows[target] = row;
    written += 1;
  });
  return { rows, written, added, skippedHeader, dropped, invalid, ignoredColumns };
}

/** One short sentence for the table's status line after a paste. */
export function pasteSummary(result: PasteResult<unknown>): string {
  const parts = [`Pasted ${result.written} row${result.written === 1 ? "" : "s"}`];
  if (result.added > 0) parts.push(`${result.added} new`);
  if (result.skippedHeader) parts.push("heading row skipped");
  if (result.invalid > 0) {
    parts.push(`${result.invalid} cell${result.invalid === 1 ? " was" : "s were"} not a number and left empty`);
  }
  if (result.dropped > 0) parts.push(`${result.dropped} row${result.dropped === 1 ? "" : "s"} over the limit dropped`);
  if (result.ignoredColumns > 0) parts.push(`${result.ignoredColumns} cell${result.ignoredColumns === 1 ? "" : "s"} beyond the last column ignored`);
  return `${parts.join(", ")}.`;
}
