import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DataTable, type DataColumn } from "./DataTable";

type Row = { id: number; name: string; b: number | null; t: number | null };

const COLUMNS: DataColumn<Row>[] = [
  { key: "name", label: "Name", kind: "text", get: (r) => r.name, set: (r, v) => ({ ...r, name: String(v ?? "") }) },
  {
    key: "b",
    label: "b̄",
    unit: "mm",
    kind: "number",
    get: (r) => r.b,
    set: (r, v) => ({ ...r, b: v as number | null }),
    fieldKey: (r) => `row-${r.id}-b`,
  },
  { key: "t", label: "t", unit: "mm", kind: "number", get: (r) => r.t, set: (r, v) => ({ ...r, t: v as number | null }) },
];

const newRow = (rows: Row[]): Row => {
  const id = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return { id, name: "", b: null, t: null };
};

let latest: Row[] = [];

function Harness({ initial, minRows = 0, maxRows }: { initial: Row[]; minRows?: number; maxRows?: number }) {
  const [rows, setRows] = useState(initial);
  latest = rows;
  return (
    <DataTable
      caption="Plates"
      columns={COLUMNS}
      rows={rows}
      onChange={setRows}
      rowKey={(r) => r.id}
      rowName={(r) => r.name || `row ${r.id}`}
      newRow={newRow}
      minRows={minRows}
      maxRows={maxRows}
    />
  );
}

const body = () => screen.getByRole("table").querySelector("tbody") as HTMLElement;
const dataRows = () => body().querySelectorAll("tr:not(.data-row-new)");
const newRowEl = () => body().querySelector("tr.data-row-new") as HTMLElement | null;
const cell = (row: number, col: number) =>
  screen.getByRole("table").querySelector<HTMLInputElement>(`input[data-cell="${row}:${col}"]`) as HTMLInputElement;

function paste(input: HTMLInputElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("DataTable", () => {
  it("always ends with an empty row; typing there adds a row and a new empty row appears", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 1, name: "web", b: 250, t: 6 }]} />);
    expect(dataRows()).toHaveLength(1);
    expect(newRowEl()).not.toBeNull();

    await user.type(cell(1, 1), "95");
    expect(dataRows()).toHaveLength(2);
    expect(newRowEl()).not.toBeNull(); // still one empty row at the end
    expect(cell(1, 1)).toHaveFocus(); // the cursor stayed in the cell, now a real row
    expect(latest[1]).toEqual({ id: 2, name: "", b: 95, t: null });
    expect(cell(1, 1).closest("td")).toHaveAttribute("data-field", "row-2-b");
  });

  it("keeps half-typed numbers as typed and flags text that is not a number", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 1, name: "web", b: null, t: null }]} />);
    await user.type(cell(0, 1), "12,");
    expect(cell(0, 1)).toHaveValue("12,");
    expect(latest[0].b).toBe(12);
    await user.type(cell(0, 1), "5");
    expect(latest[0].b).toBe(12.5);
    await user.clear(cell(0, 2));
    await user.type(cell(0, 2), "abc");
    expect(cell(0, 2)).toHaveAttribute("aria-invalid", "true");
    expect(latest[0].t).toBeNull();
  });

  it("pastes cells copied from Excel, skipping a heading row and adding rows", () => {
    render(<Harness initial={[{ id: 1, name: "", b: null, t: null }]} />);
    paste(cell(0, 0), "Name\tb [mm]\tt [mm]\r\nweb\t250\t6\r\nflange\t95,5\t10\r\n");
    expect(latest).toEqual([
      { id: 1, name: "web", b: 250, t: 6 },
      { id: 2, name: "flange", b: 95.5, t: 10 },
    ]);
    expect(newRowEl()).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Pasted 2 rows, 1 new, heading row skipped.");
  });

  it("leaves a single pasted value to the browser", () => {
    render(<Harness initial={[{ id: 1, name: "", b: null, t: null }]} />);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.assign(event, { clipboardData: { getData: () => "250" } });
    cell(0, 1).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("moves down and up a column with Enter and the arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { id: 1, name: "a", b: 1, t: 1 },
          { id: 2, name: "b", b: 2, t: 2 },
        ]}
      />,
    );
    cell(0, 2).focus();
    await user.keyboard("{Enter}");
    expect(cell(1, 2)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell(2, 2)).toHaveFocus(); // the empty last row
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(cell(1, 2)).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(cell(0, 2)).toHaveFocus();
  });

  it("deletes a row with its button, never below the minimum", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        minRows={1}
        initial={[
          { id: 1, name: "web", b: 1, t: 1 },
          { id: 2, name: "flange", b: 2, t: 2 },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete flange" }));
    expect(latest.map((r) => r.name)).toEqual(["web"]);
    expect(screen.getByRole("button", { name: "Delete web" })).toBeDisabled();
  });

  it("removes a row whose cells were all cleared once the cursor leaves it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 1, name: "web", b: 1, t: 1 }, { id: 2, name: "x", b: 2, t: null }]} />);
    await user.clear(cell(1, 0));
    await user.clear(cell(1, 1));
    expect(dataRows()).toHaveLength(2); // still there while the cursor is in it
    await user.click(cell(0, 1));
    expect(latest.map((r) => r.id)).toEqual([1]);
  });

  it("stops offering an empty row when the table is full", () => {
    render(<Harness maxRows={2} initial={[{ id: 1, name: "a", b: 1, t: 1 }, { id: 2, name: "b", b: 2, t: 2 }]} />);
    expect(newRowEl()).toBeNull();
    expect(screen.getByText("The table is full (2 rows).")).toBeInTheDocument();
  });

  it("reads typeset symbols plainly in the labels (k_σ reads kσ)", () => {
    const columns: DataColumn<Row>[] = [{ ...COLUMNS[2], label: "k_σ", unit: undefined }];
    render(
      <DataTable
        caption="k"
        columns={columns}
        rows={[{ id: 1, name: "web", b: null, t: null }]}
        onChange={() => undefined}
        rowKey={(r) => r.id}
        rowName={(r) => r.name}
        newRow={newRow}
      />,
    );
    expect(screen.getByLabelText("kσ, web")).toBeInTheDocument();
    expect(screen.getByLabelText("New row: kσ")).toBeInTheDocument();
  });

  it("labels every cell with its column, unit and row for screen readers", () => {
    render(<Harness initial={[{ id: 1, name: "web", b: 1, t: 1 }]} />);
    expect(within(body()).getByLabelText("b̄ [mm], web")).toBe(cell(0, 1));
    expect(within(body()).getByLabelText("New row: t [mm]")).toBe(cell(1, 2));
  });
});
