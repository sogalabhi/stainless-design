import { Trash2 } from "lucide-react";
import { type ClipboardEvent, type FocusEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyPaste,
  type CellKind,
  type CellValue,
  parseClipboard,
  parseNumberCell,
  pasteSummary,
} from "../lib/dataTable";
import { useFieldHelp } from "./FieldHelp";
import { plainSymbols, renderSymbols } from "./Symbols";

export type DataColumn<R> = {
  key: string;
  /** heading, with symbols such as b̄ or k_σ typeset */
  label: string;
  /** a shorter heading for narrow tables, e.g. "b̄" for "Flat width b̄"; the label stays the cell's name */
  short?: string;
  unit?: string;
  kind: CellKind;
  get: (row: R) => CellValue;
  set: (row: R, value: CellValue) => R;
  /** the cell's data-field, so "Waiting for" links can put the cursor in it */
  fieldKey?: (row: R) => string;
  /** a field key whose "?" entry explains the column; shown once, in the heading */
  helpKey?: string;
};

type Props<R> = {
  caption: string;
  columns: DataColumn<R>[];
  rows: R[];
  onChange: (rows: R[]) => void;
  rowKey: (row: R) => string | number;
  /** what one row is called in labels, e.g. "plate 2" */
  rowName: (row: R, index: number) => string;
  newRow: (rows: R[]) => R;
  /** a row counts as empty (and is removed when the cursor leaves it) when this says so */
  isEmpty?: (row: R) => boolean;
  minRows?: number;
  maxRows?: number;
};

type Focus = { row: number; col: number };

const cellSelector = (row: number, col: number) => `input[data-cell="${row}:${col}"]`;

/**
 * A small spreadsheet for inputs. The last row is always empty: typing in it adds a row, and a new
 * empty row appears under it. Pasting cells copied from Excel (tab-separated, several rows) fills the
 * table from the cell under the cursor and adds rows as needed; a heading row is skipped. Enter and
 * the arrow keys move up and down a column. A row whose cells are all cleared is removed when the
 * cursor leaves it (never below `minRows`), and each row has a delete button.
 */
export function DataTable<R>({
  caption,
  columns,
  rows,
  onChange,
  rowKey,
  rowName,
  newRow,
  isEmpty,
  minRows = 0,
  maxRows = Number.POSITIVE_INFINITY,
}: Props<R>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [helpHost, setHelpHost] = useState<HTMLDivElement | null>(null);
  // text being typed that is not (yet) the stored number, e.g. "12," or "abc", keyed by row and column
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<Focus | null>(null);
  const [status, setStatus] = useState("");
  const kinds = columns.map((column) => column.kind);
  const canAdd = rows.length < maxRows;
  const empty = (row: R) =>
    isEmpty ? isEmpty(row) : columns.every((column) => [null, ""].includes(column.get(row) as never));

  useLayoutEffect(() => {
    if (!focus) return;
    const input = tableRef.current?.querySelector<HTMLInputElement>(cellSelector(focus.row, focus.col));
    if (input) {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange?.(end, end);
    }
    setFocus(null);
  }, [focus, rows]);

  const draftKey = (row: R, column: DataColumn<R>) => `${rowKey(row)}|${column.key}`;

  const shown = (row: R, column: DataColumn<R>): string => {
    const draft = drafts[draftKey(row, column)];
    if (draft !== undefined) return draft;
    const value = column.get(row);
    return value === null ? "" : String(value);
  };

  /** The row with the typed text applied; numbers keep their text as a draft until it reads cleanly. */
  const typed = (row: R, column: DataColumn<R>, text: string, nextDrafts: Record<string, string>): R => {
    const key = draftKey(row, column);
    if (column.kind === "text") {
      delete nextDrafts[key];
      return column.set(row, text);
    }
    const parsed = parseNumberCell(text);
    const clean = parsed.ok && (parsed.value === null ? "" : String(parsed.value)) === text.trim();
    if (clean) delete nextDrafts[key];
    else nextDrafts[key] = text;
    return column.set(row, parsed.value);
  };

  const edit = (rowIndex: number, colIndex: number, text: string) => {
    const column = columns[colIndex];
    const nextDrafts = { ...drafts };
    if (rowIndex >= rows.length) {
      if (text === "" || !canAdd) return;
      const created = typed(newRow(rows), column, text, nextDrafts);
      setDrafts(nextDrafts);
      onChange([...rows, created]);
      setFocus({ row: rowIndex, col: colIndex }); // the same cell, now in a real row
      setStatus(`Added ${rowName(created, rowIndex)}.`);
      return;
    }
    const updated = typed(rows[rowIndex], column, text, nextDrafts);
    setDrafts(nextDrafts);
    onChange(rows.map((row, index) => (index === rowIndex ? updated : row)));
  };

  const remove = (rowIndex: number) => {
    if (rows.length <= minRows) return;
    const gone = rows[rowIndex];
    const prefix = `${rowKey(gone)}|`;
    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([key]) => !key.startsWith(prefix))));
    onChange(rows.filter((_, index) => index !== rowIndex));
    setStatus(`Removed ${rowName(gone, rowIndex)}.`);
  };

  const move = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const last = canAdd ? rows.length : rows.length - 1;
    let target: number | null = null;
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "ArrowDown") target = rowIndex + 1;
    if ((event.key === "Enter" && event.shiftKey) || event.key === "ArrowUp") target = rowIndex - 1;
    if (target === null) return;
    event.preventDefault();
    if (target < 0 || target > last) return;
    tableRef.current?.querySelector<HTMLInputElement>(cellSelector(target, colIndex))?.focus();
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n;]/.test(text.replace(/\r?\n$/, ""))) return; // one value: an ordinary paste
    event.preventDefault();
    const result = applyPaste({
      rows,
      grid: parseClipboard(text),
      startRow: rowIndex,
      startCol: colIndex,
      kinds,
      set: (row, column, value) => columns[column].set(row, value),
      newRow,
      maxRows,
    });
    const touched = new Set(result.rows.slice(rowIndex, rowIndex + result.written).map((row) => `${rowKey(row)}|`));
    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([key]) => ![...touched].some((p) => key.startsWith(p)))));
    onChange(result.rows);
    setStatus(pasteSummary(result));
  };

  const leaveRow = (event: FocusEvent<HTMLTableRowElement>, rowIndex: number) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const row = rows[rowIndex];
    if (row !== undefined && empty(row) && rows.length > minRows) remove(rowIndex);
  };

  const cell = (rowIndex: number, colIndex: number, row: R | undefined) => {
    const column = columns[colIndex];
    const name = row === undefined ? "" : rowName(row, rowIndex);
    const text = row === undefined ? "" : shown(row, column);
    const invalid = row !== undefined && column.kind === "number" && !parseNumberCell(text).ok;
    return (
      <td
        key={column.key}
        className={`data-cell data-cell-${column.kind}${invalid ? " data-cell-invalid" : ""}`}
        data-field={row !== undefined ? column.fieldKey?.(row) : undefined}
      >
        <input
          type="text"
          inputMode={column.kind === "number" ? "decimal" : "text"}
          data-cell={`${rowIndex}:${colIndex}`}
          aria-label={
            row === undefined
              ? `New row: ${plainSymbols(column.label)}${column.unit ? ` [${column.unit}]` : ""}`
              : `${plainSymbols(column.label)}${column.unit ? ` [${column.unit}]` : ""}, ${name}`
          }
          aria-invalid={invalid || undefined}
          placeholder={row === undefined && colIndex === 0 ? "new" : ""}
          value={text}
          onChange={(event) => edit(rowIndex, colIndex, event.target.value)}
          onKeyDown={(event) => move(event, rowIndex, colIndex)}
          onPaste={(event) => paste(event, rowIndex, colIndex)}
        />
      </td>
    );
  };

  return (
    <div className="data-table">
      <div className="data-table-scroll">
        <table ref={tableRef}>
          <caption>{renderSymbols(caption)}</caption>
          <thead>
            <tr>
              <th scope="col" className="data-row-number">
                <span className="sr-only">Row</span>
              </th>
              {columns.map((column) => (
                <ColumnHeading key={column.key} column={column} helpHost={helpHost} />
              ))}
              <th scope="col" className="data-row-actions">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowKey(row)} onBlur={(event) => leaveRow(event, rowIndex)}>
                <th scope="row" className="data-row-number">
                  {rowIndex + 1}
                </th>
                {columns.map((_, colIndex) => cell(rowIndex, colIndex, row))}
                <td className="data-row-actions">
                  <button
                    type="button"
                    className="icon-button data-row-delete"
                    aria-label={`Delete ${rowName(row, rowIndex)}`}
                    title={`Delete ${rowName(row, rowIndex)}`}
                    disabled={rows.length <= minRows}
                    onClick={() => remove(rowIndex)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {canAdd ? (
              <tr className="data-row-new">
                <th scope="row" className="data-row-number">
                  <span aria-hidden="true">+</span>
                  <span className="sr-only">New row</span>
                </th>
                {columns.map((_, colIndex) => cell(rows.length, colIndex, undefined))}
                <td className="data-row-actions" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div ref={setHelpHost} className="data-table-help" />
      <p className="data-table-note muted">
        {canAdd
          ? "Type in the last row to add one, or paste cells copied from Excel. Enter moves down a column."
          : `The table is full (${maxRows} rows).`}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {status ? <p className="data-table-status muted">{status}</p> : null}
    </div>
  );
}

/** A column heading with its unit and, when the column has a "?" entry, the help button. */
function ColumnHeading<R>({ column, helpHost }: { column: DataColumn<R>; helpHost: HTMLDivElement | null }) {
  const help = useFieldHelp(column.helpKey, column.label);
  return (
    <th scope="col" className={`data-col data-col-${column.kind}`} title={plainSymbols(column.label)}>
      <span className="data-col-label">
        {renderSymbols(column.short ?? column.label)}
        {help.button}
        {column.unit ? <span className="unit">[{column.unit}]</span> : null}
      </span>
      {help.panel && helpHost ? createPortal(help.panel, helpHost) : null}
    </th>
  );
}
