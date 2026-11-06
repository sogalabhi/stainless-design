/**
 * The chart wrapper with simulated Plotly events: value tags on hover, the pin card, linked
 * charts, and "Show values" with its CSV. Plotly is mocked; the mock gives the graph div an `on`
 * method, as Plotly does after its first draw, and keeps the handlers so a test can fire them.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartLinkProvider } from "../lib/chartLinks";
import type { PlotlyAxis, PlotlyEvent, PlotlyPoint, Readout, TraceMeta } from "../lib/chartReadout";
import { PlotlyChart } from "./PlotlyChart";

type Handler = (data: PlotlyEvent) => void;

const plotly = vi.hoisted(() => {
  const handlers = new Map<HTMLElement, Record<string, (data: unknown) => void>>();
  return {
    handlers,
    react: vi.fn((element: HTMLElement & { on?: unknown }, ..._rest: unknown[]) => {
      if (!handlers.has(element)) {
        const own: Record<string, (data: unknown) => void> = {};
        handlers.set(element, own);
        element.on = (name: string, handler: (data: unknown) => void) => {
          own[name] = handler;
        };
      }
      return Promise.resolve();
    }),
    purge: vi.fn(),
  };
});
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  plotly.react.mockClear();
  plotly.handlers.clear();
});

const XA: PlotlyAxis = { _id: "x", _offset: 40, _length: 400, d2p: (value) => value * 25 };
const YA: PlotlyAxis = { _id: "y", _offset: 20, _length: 300, d2p: (value) => 300 - value * 5 };

function meta(series: string, x: string, y: string, unit: string, extra: Partial<TraceMeta> = {}): TraceMeta {
  return {
    series,
    source: `EN 1993-1-4:2025, ${series}`,
    source_kind: "Code",
    role: "curve",
    value: "xy",
    x: { label: x, unit: "" },
    y: { label: y, unit },
    ...extra,
  };
}

function axisInfo(label: string, unit: string, quantity: string | null, schematic = false) {
  return { label, unit, html: label, quantity, schematic, also: [] };
}

function bendingFigure(): Record<string, unknown> {
  const curve = { x: [1, 2, 3, 4], y: [37.1, 40.2, 42.3, 44.4], meta: meta("Formula B.20", "ε_csm / ε_y", "M_csm,c,Rd", "kN m") };
  const elastic = {
    x: [0, 1, 2, 3, 4],
    y: [37.1, 37.1, 37.1, 37.1, 37.1],
    meta: meta("Elastic moment", "ε_csm / ε_y", "M_el", "kN m", { role: "reference", value: "y" }),
  };
  const readout: Readout = {
    title: "Bending resistance (B.19, B.20)",
    axes: { x: axisInfo("ε_csm / ε_y", "", "strain_ratio"), y: axisInfo("M_csm,c,Rd", "kN m", null) },
    tables: [
      {
        title: "Formula B.20",
        source: "EN 1993-1-4:2025, B.20",
        source_kind: "Code",
        columns: [
          { label: "ε_csm / ε_y", unit: "" },
          { label: "M_csm,c,Rd", unit: "kN m" },
        ],
        rows: curve.x.map((x, i) => [x, curve.y[i]]),
      },
      { title: "Elastic moment", source: "EN 1993-1-4:2025, 8.2.4(1)", source_kind: "Code", columns: [{ label: "M_el", unit: "kN m" }], rows: [[37.1]] },
    ],
  };
  return { data: [curve, elastic], layout: { height: 300, shapes: [{ type: "rect" }] }, readout };
}

function baseFigure(): Record<string, unknown> {
  const curve = { x: [0.4, 0.5, 0.6], y: [4, 2.6, 1.8], meta: meta("Base curve", "λ_p,cs", "ε_csm / ε_y", "") };
  const readout: Readout = {
    title: "Base curve (B.6)",
    axes: { x: axisInfo("λ_p,cs", "", "lambda_p"), y: axisInfo("ε_csm / ε_y", "", "strain_ratio") },
    tables: [],
  };
  return { data: [curve], layout: { height: 300 }, readout };
}

function point(figure: Record<string, unknown>, curve: number, index: number): PlotlyPoint {
  const trace = (figure.data as { x: number[]; y: number[]; meta?: unknown }[])[curve];
  return { x: trace.x[index], y: trace.y[index], curveNumber: curve, pointIndex: index, data: trace, xaxis: XA, yaxis: YA };
}

/** Lets Plotly.react resolve, so the wrapper attaches its handlers. */
async function drawn() {
  await act(async () => {
    await Promise.resolve();
  });
}

function fire(label: string, name: string, data: PlotlyEvent = {}) {
  const element = screen.getByRole("img", { name: label });
  const handler = plotly.handlers.get(element)?.[name] as Handler | undefined;
  if (!handler) throw new Error(`no ${name} handler on ${label}`);
  act(() => handler(data));
}

function lastLayout(label: string): Record<string, unknown> {
  const element = screen.getByRole("img", { name: label });
  const calls = plotly.react.mock.calls.filter((call) => call[0] === element);
  return calls[calls.length - 1][2] as Record<string, unknown>;
}

describe("value tags", () => {
  it("shows the hovered x under the plot and the y of the line under the cursor, then hides", async () => {
    const figure = bendingFigure();
    const { container } = render(<PlotlyChart figure={figure} dark={false} label="bending" />);
    await drawn();
    // cursor at the height of M_el (pixel 20 + 300 - 37.1 * 5)
    const top = container.querySelector(".plot")!.getBoundingClientRect().top;
    fire("bending", "plotly_hover", {
      points: [point(figure, 0, 2), point(figure, 1, 3)],
      event: { clientY: top + 20 + 300 - 37.1 * 5 },
    });
    const x = container.querySelector(".value-tag-x") as HTMLElement;
    const y = container.querySelector(".value-tag-y") as HTMLElement;
    expect(x.textContent).toBe("3");
    expect(x.style.left).toBe(`${40 + 75}px`);
    expect(x.style.top).toBe(`${20 + 300}px`);
    expect(y.textContent).toBe("37.1 kN m");
    expect(container.querySelector(".value-guide")).not.toBeNull();
    fire("bending", "plotly_unhover");
    expect(container.querySelector(".value-tag-x")).toBeNull();
  });

  it("shows no x tag on a schematic axis", async () => {
    const figure = bendingFigure();
    const readout = figure.readout as Readout;
    readout.axes.x.schematic = true;
    const { container } = render(<PlotlyChart figure={figure} dark={false} label="schematic" />);
    await drawn();
    fire("schematic", "plotly_hover", { points: [point(figure, 0, 1)] });
    expect(container.querySelector(".value-tag-x")).toBeNull();
    expect(container.querySelector(".value-tag-y")?.textContent).toBe("40.2 kN m");
  });
});

describe("click to pin", () => {
  it("shows every series at the clicked x with unit and source; Clear removes it", async () => {
    const figure = bendingFigure();
    render(<PlotlyChart figure={figure} dark={false} label="bending" />);
    await drawn();
    fire("bending", "plotly_click", { points: [point(figure, 0, 2), point(figure, 1, 3)] });
    const card = screen.getByRole("region", { name: "Pinned values on Bending resistance (B.19, B.20)" });
    expect(card.textContent).toContain("Pinned: εcsm / εy = 3");
    expect(card.textContent).toContain("Formula B.20: Mcsm,c,Rd = 42.3 kN m");
    expect(card.textContent).toContain("(EN 1993-1-4:2025, Formula B.20)");
    expect(card.textContent).toContain("Elastic moment: Mel = 37.1 kN m");
    fireEvent.click(within(card).getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("region", { name: /Pinned values/ })).toBeNull();
  });

  it("a double click clears the pin, and the click Plotly sends after it does not pin again", async () => {
    const figure = bendingFigure();
    render(<PlotlyChart figure={figure} dark={false} label="bending" />);
    await drawn();
    const click = { points: [point(figure, 0, 1)] };
    fire("bending", "plotly_click", click);
    expect(screen.getByRole("region", { name: /Pinned values/ })).toBeTruthy();
    fire("bending", "plotly_doubleclick");
    fire("bending", "plotly_click", click);
    expect(screen.queryByRole("region", { name: /Pinned values/ })).toBeNull();
  });

  it("drops the pin when the server sends new numbers", async () => {
    const figure = bendingFigure();
    const { rerender } = render(<PlotlyChart figure={figure} dark={false} label="bending" />);
    await drawn();
    fire("bending", "plotly_click", { points: [point(figure, 0, 1)] });
    expect(screen.getByRole("region", { name: /Pinned values/ })).toBeTruthy();
    rerender(<PlotlyChart figure={bendingFigure()} dark={false} label="bending" />);
    await drawn();
    expect(screen.queryByRole("region", { name: /Pinned values/ })).toBeNull();
  });
});

describe("linked charts", () => {
  it("a pin on the base curve marks the same ε_csm / ε_y on the bending chart, with the nearest computed point", async () => {
    const base = baseFigure();
    const bending = bendingFigure();
    const frozen = JSON.stringify(bending);
    render(
      <ChartLinkProvider>
        <PlotlyChart figure={base} dark={false} label="base" />
        <PlotlyChart figure={bending} dark={false} label="bending" />
      </ChartLinkProvider>,
    );
    await drawn();
    fire("base", "plotly_click", { points: [point(base, 0, 1)] });
    await drawn();
    const layout = lastLayout("bending");
    const shapes = layout.shapes as Record<string, unknown>[];
    expect(shapes).toHaveLength(2);
    expect(shapes[1]).toMatchObject({ type: "line", xref: "x", x0: 2.6, x1: 2.6 });
    const annotations = layout.annotations as Record<string, unknown>[];
    expect(annotations[0].text).toBe("pinned on Base curve (B.6): ε_csm / ε_y = 2.6");
    // the server figure is copied, never changed
    expect(JSON.stringify(bending)).toBe(frozen);
    const note = document.querySelector(".link-note") as HTMLElement;
    expect(note.textContent).toContain("Linked: pinned on Base curve (B.6): εcsm / εy = 2.6");
    expect(note.textContent).toContain("Nearest computed point on Formula B.20: εcsm / εy = 3, Mcsm,c,Rd = 42.3 kN m");
    // the base curve itself does not mark its own pin
    expect(lastLayout("base").shapes).toBeUndefined();

    fireEvent.click(within(note).getByRole("button", { name: "Clear pin" }));
    await drawn();
    expect(document.querySelector(".link-note")).toBeNull();
    expect(screen.queryByRole("region", { name: /Pinned values/ })).toBeNull();
    expect((lastLayout("bending").shapes as unknown[]).length).toBe(1);
  });

  it("a pin on the bending chart marks a horizontal line on the base curve's y axis", async () => {
    const base = baseFigure();
    const bending = bendingFigure();
    render(
      <ChartLinkProvider>
        <PlotlyChart figure={base} dark={false} label="base" />
        <PlotlyChart figure={bending} dark={false} label="bending" />
      </ChartLinkProvider>,
    );
    await drawn();
    fire("bending", "plotly_click", { points: [point(bending, 0, 3)] });
    await drawn();
    const shapes = lastLayout("base").shapes as Record<string, unknown>[];
    expect(shapes[0]).toMatchObject({ xref: "paper", yref: "y", y0: 4, y1: 4 });
  });
});

describe("Show values", () => {
  it("lists one table per series when opened, and saves the figure as one CSV", async () => {
    const figure = bendingFigure();
    const { container } = render(<PlotlyChart figure={figure} dark={false} label="Bending resistance" />);
    await drawn();
    const details = container.querySelector("details.chart-values") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(container.querySelectorAll(".chart-table")).toHaveLength(0);
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const tables = container.querySelectorAll(".chart-table table");
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelectorAll("tbody tr")).toHaveLength(4);
    expect(tables[0].textContent).toContain("Mcsm,c,Rd [kN m]");
    expect(tables[1].querySelector("caption")?.textContent).toContain("Code: EN 1993-1-4:2025, 8.2.4(1)");

    const blobs: Blob[] = [];
    const create = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:chart";
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("bending-resistance.csv");
      expect(this.href).toBe("blob:chart");
    });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(clicked).toHaveBeenCalledOnce();
    const text = await blobs[0].text();
    expect(text.split("\r\n")[0]).toBe('series,source kind,source,ε_csm / ε_y,"M_csm,c,Rd [kN m]",M_el [kN m]');
    expect(text).toContain('Elastic moment,Code,"EN 1993-1-4:2025, 8.2.4(1)",,,37.1');
    clicked.mockRestore();
  });

  it("shows nothing extra for a figure without a readout", () => {
    const { container } = render(<PlotlyChart figure={{ data: [], layout: {} }} dark={false} label="plain" />);
    expect(container.querySelector("details")).toBeNull();
  });
});
