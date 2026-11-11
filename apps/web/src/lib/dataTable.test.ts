import { describe, expect, it } from "vitest";
import {
  applyPaste,
  type CellKind,
  type CellValue,
  looksLikeHeader,
  parseClipboard,
  parseNumberCell,
  pasteSummary,
} from "./dataTable";

describe("parseNumberCell", () => {
  it("reads the ways people type and paste numbers", () => {
    expect(parseNumberCell("12.5")).toEqual({ value: 12.5, ok: true });
    expect(parseNumberCell(" 12,5 ")).toEqual({ value: 12.5, ok: true }); // decimal comma
    expect(parseNumberCell("1,234.5")).toEqual({ value: 1234.5, ok: true }); // grouping comma
    expect(parseNumberCell("1 234,5")).toEqual({ value: 1234.5, ok: true });
    expect(parseNumberCell("1 234")).toEqual({ value: 1234, ok: true });
    expect(parseNumberCell("2e3")).toEqual({ value: 2000, ok: true });
    expect(parseNumberCell("-0.5")).toEqual({ value: -0.5, ok: true });
    expect(parseNumberCell(".5")).toEqual({ value: 0.5, ok: true });
  });

  it("treats empty as not given yet, and keeps anything else out of the calculation", () => {
    expect(parseNumberCell("")).toEqual({ value: null, ok: true });
    expect(parseNumberCell("   ")).toEqual({ value: null, ok: true });
    for (const bad of ["abc", "12mm", "1,2,3", "--1", "Infinity", "NaN", "1e999"]) {
      expect(parseNumberCell(bad), bad).toEqual({ value: null, ok: false });
    }
  });
});

describe("parseClipboard", () => {
  it("splits Excel's tab-separated rows and drops the trailing line", () => {
    expect(parseClipboard("web\t250\t6\r\nflange\t95\t10\r\n")).toEqual([
      ["web", "250", "6"],
      ["flange", "95", "10"],
    ]);
  });

  it("accepts semicolons when there are no tabs, and a single column otherwise", () => {
    expect(parseClipboard("a;1,5\nb;2,5")).toEqual([
      ["a", "1,5"],
      ["b", "2,5"],
    ]);
    expect(parseClipboard("100\n200\n")).toEqual([["100"], ["200"]]);
  });
});

const KINDS: CellKind[] = ["text", "number", "number"];
type Row = { id: number; name: string; a: number | null; b: number | null };
const set = (row: Row, column: number, value: CellValue): Row =>
  column === 0
    ? { ...row, name: String(value ?? "") }
    : column === 1
      ? { ...row, a: value as number | null }
      : { ...row, b: value as number | null };
const newRow = (rows: Row[]): Row => ({ id: rows.length + 1, name: `row ${rows.length + 1}`, a: null, b: null });

describe("looksLikeHeader", () => {
  it("is a header only when every filled number cell holds text", () => {
    expect(looksLikeHeader(["Name", "b [mm]", "t [mm]"], KINDS)).toBe(true);
    expect(looksLikeHeader(["web", "250", "6"], KINDS)).toBe(false);
    expect(looksLikeHeader(["web", "b", "6"], KINDS)).toBe(false);
    expect(looksLikeHeader(["Name", "", ""], KINDS)).toBe(false);
  });
});

describe("applyPaste", () => {
  const start: Row[] = [{ id: 1, name: "row 1", a: 1, b: 2 }];

  it("fills from the cell under the cursor and adds rows as needed, skipping a heading", () => {
    const result = applyPaste({
      rows: start,
      grid: parseClipboard("Name\tb\tt\nweb\t250\t6\nflange\t95,5\t10\n"),
      startRow: 0,
      startCol: 0,
      kinds: KINDS,
      set,
      newRow,
      maxRows: 20,
    });
    expect(result.skippedHeader).toBe(true);
    expect(result.written).toBe(2);
    expect(result.added).toBe(1);
    expect(result.rows).toEqual([
      { id: 1, name: "web", a: 250, b: 6 },
      { id: 2, name: "flange", a: 95.5, b: 10 },
    ]);
  });

  it("writes into the empty last row and from a middle column, leaving other cells alone", () => {
    const result = applyPaste({
      rows: start,
      grid: [["7"], ["8"]],
      startRow: 1,
      startCol: 2,
      kinds: KINDS,
      set,
      newRow,
      maxRows: 20,
    });
    expect(result.rows).toEqual([
      { id: 1, name: "row 1", a: 1, b: 2 },
      { id: 2, name: "row 2", a: null, b: 7 },
      { id: 3, name: "row 3", a: null, b: 8 },
    ]);
  });

  it("leaves cells that are not numbers empty, drops rows over the limit and extra columns", () => {
    const result = applyPaste({
      rows: [],
      grid: [
        ["a", "x", "1", "extra"],
        ["b", "2", "3"],
        ["c", "4", "5"],
      ],
      startRow: 0,
      startCol: 0,
      kinds: KINDS,
      set,
      newRow,
      maxRows: 2,
    });
    expect(result.rows).toEqual([
      { id: 1, name: "a", a: null, b: 1 },
      { id: 2, name: "b", a: 2, b: 3 },
    ]);
    expect(result).toMatchObject({ invalid: 1, dropped: 1, ignoredColumns: 1, skippedHeader: false });
    expect(pasteSummary(result)).toBe(
      "Pasted 2 rows, 2 new, 1 cell was not a number and left empty, 1 row over the limit dropped, 1 cell beyond the last column ignored.",
    );
  });
});
