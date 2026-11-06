import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceKind, TraceStepOut } from "../api/types";
import tension from "../test/fixtures/tension.json";
import { SOURCE_LABELS, Working } from "./Working";

function step(symbol: string, kind: SourceKind, citation: string): TraceStepOut {
  return {
    symbol,
    description: `step ${symbol}`,
    clause: kind === "input" ? "input" : "B.4",
    formula: "x",
    substituted: "1",
    value: 1,
    unit: "–",
    line: `${symbol} = 1`,
    latex: `${symbol} = 1`,
    source: { kind, citation },
  };
}

const CITATIONS: Record<SourceKind, string> = {
  code: "EN 1993-1-4:2025, B.4(1), Formula (B.4)",
  textbook: "Gere & Timoshenko, Mechanics of Materials, 2nd ed., eq. (10-28), p. 538",
  paper: "ref. [9] of the Bibliography of EN 1993-1-4:2025",
  input: "Entered by the user",
  derived: "From the steps above",
};

function items(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".working > li"));
}

describe("Working: the source of each step", () => {
  it("shows one badge per step with its kind and the citation, for every kind", () => {
    const kinds = Object.keys(CITATIONS) as SourceKind[];
    const steps = kinds.map((kind, i) => step(`s${i}`, kind, CITATIONS[kind]));
    const { container } = render(<Working title="test" steps={steps} />);
    const rows = items(container);
    expect(rows).toHaveLength(kinds.length);
    kinds.forEach((kind, i) => {
      const row = rows[i];
      const badges = row.querySelectorAll(".source-badge");
      expect(badges).toHaveLength(1);
      const badge = badges[0] as HTMLElement;
      expect(badge.textContent).toBe(SOURCE_LABELS[kind]);
      expect(badge).toHaveClass(`source-${kind}`);
      expect(badge).toHaveAttribute("title", CITATIONS[kind]);
      expect(within(row).getByText(CITATIONS[kind])).toBeInTheDocument();
      expect(row.querySelector(".step-source")?.textContent).toBe(
        `Source: ${SOURCE_LABELS[kind]} ${CITATIONS[kind]}`,
      );
    });
  });

  it("labels the kinds Code, Textbook, Paper, Input and Derived", () => {
    expect(Object.values(SOURCE_LABELS)).toEqual(["Code", "Textbook", "Paper", "Input", "Derived"]);
  });

  it("renders a step without a source (recorded before the field existed) with no badge", () => {
    const legacy = { ...step("old", "code", "unused") } as Partial<TraceStepOut>;
    delete legacy.source;
    const steps = [legacy as TraceStepOut, step("new", "input", CITATIONS.input)];
    const { container } = render(<Working title="test" steps={steps} />);
    const [oldRow, newRow] = items(container);
    expect(within(oldRow).getByText("step old")).toBeInTheDocument();
    expect(oldRow.querySelector(".source-badge")).toBeNull();
    expect(newRow.querySelector(".source-badge")?.textContent).toBe("Input");
  });

  it("renders a recorded fixture trace, whose steps have no source, without crashing", () => {
    const steps = (tension as unknown as { trace: TraceStepOut[] }).trace;
    const { container } = render(<Working title="B.6.1" steps={steps} />);
    expect(items(container)).toHaveLength(steps.length);
    expect(container.querySelectorAll(".source-badge")).toHaveLength(
      steps.filter((s) => s.source).length,
    );
  });

  it("keeps the badge with the steps the clause filter keeps", () => {
    const steps = [step("E", "input", CITATIONS.input), step("ε_y", "code", CITATIONS.code)];
    const { container } = render(
      <Working title="test" steps={steps} clauses={["B.6.1"]} alsoSymbols={["E"]} />,
    );
    const rows = items(container);
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".source-badge")?.textContent).toBe("Input");
  });
});
