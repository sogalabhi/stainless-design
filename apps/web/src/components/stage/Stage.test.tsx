import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BendingResponse } from "../../api/types";
import { bendingView } from "../../lib/stage";
import { stageSection } from "../../lib/stageSection";
import { defaultDeformationForm } from "../../lib/geometry";
import bending from "../../test/fixtures/bending_template.json";
import bendingForces from "../../test/fixtures/bending_forces.json";
import bendingCustom from "../../test/fixtures/bending_custom.json";
import { linkSolids } from "../../lib/stageSection";
import { depthY } from "../../lib/stageLayout";
import { StageSectionDrawing } from "../SectionSketch";
import { stageLayout } from "../../lib/stageLayout";
import { StageDrawing } from "./StageDrawing";
import { ForcesPanel } from "./StageControls";
import Stage3D, { STAGE_WEBGL_MISSING, buildContent } from "./Stage3D";
import { stageBody } from "../../lib/stage3d";

const dims = { h: 150, b: 100, tw: null, tf: null, t: 5, d: null, r: null, s: null, cStem: null, rO: 8 };
const drawing = (props: Partial<Parameters<typeof StageSectionDrawing>[0]> = {}) =>
  render(
    <svg>
      <StageSectionDrawing shape="rectangular hollow section" fabrication={null} dims={dims} turned={false} scale={1} cValues={{ web: 140, flange: 90 }} lit="web" {...props} />
    </svg>,
  );

describe("the section of the stage", () => {
  it("lights the governing plate of an RHS (both webs) and prints the engine's flat widths", () => {
    const { container } = drawing();
    expect(container.querySelectorAll('[data-lit="web"] rect')).toHaveLength(2);
    expect(container.querySelector('[data-band="c_w"]')).toHaveTextContent(/= 140/);
  });

  it("lights the flanges instead when the flange governs", () => {
    const { container } = drawing({ lit: "flange" });
    expect(container.querySelectorAll('[data-lit="flange"] rect')).toHaveLength(2);
  });

  it("draws no flat widths where the engine gave none, and a what-if has no typed values", () => {
    const { container } = drawing({ cValues: null, lit: null, withValues: false });
    expect(container.querySelector("[data-band]")).toBeNull();
    expect(container.querySelector("[data-lit]")).toBeNull();
    expect(container.textContent).not.toContain("= 150");
  });

  it("lights the whole ring of a tube", () => {
    const { container } = drawing({ shape: "circular hollow section", dims: { ...dims, d: 100, h: null, b: null }, lit: "tube", cValues: null });
    expect(container.querySelector(".sk-lit-ring")).not.toBeNull();
  });

  it("draws a section turned a quarter, with the lit plate turned with it and two overall sizes", () => {
    const { container } = drawing({ turned: true, shape: "I-section", fabrication: "rolled", dims: { ...dims, tw: 5.6, tf: 8.5, t: null, r: 12, rO: null, h: 200 }, lit: "web" });
    expect(container.querySelector('g[transform="rotate(90)"] [data-lit="web"]')).not.toBeNull();
    expect(container.querySelector('[data-dim="h"]')).toHaveTextContent("h = 200");
    expect(container.querySelector('[data-dim="b"]')).toHaveTextContent("b = 100");
    expect(container.querySelector('[data-dim="tw"]')).toBeNull();
  });

  it("works for every template: the channel, the T-section and the angle light a plate", () => {
    const base = { ...dims, tw: 6, tf: 9, t: null, r: 10, rO: null, s: null };
    for (const [shape, lit] of [["channel", "web"], ["T-section", "flange"], ["T-section", "stem"], ["angle", "leg"]] as const) {
      const { container, unmount } = drawing({
        shape,
        fabrication: shape === "angle" ? null : "rolled",
        dims: shape === "angle" ? { ...base, tw: null, tf: null, t: 8, r: 6 } : { ...base, cStem: 50 },
        lit,
        cValues: null,
      });
      expect(container.querySelector(`[data-lit="${lit}"] rect`), `${shape} ${lit}`).not.toBeNull();
      unmount();
    }
  });
});

describe("the 3D cut without WebGL", () => {
  it("says the view needs WebGL and that the drawing holds the same values", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const view = bendingView(bending as unknown as BendingResponse);
    const section = stageSection(
      { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
      "bending",
      "major",
    )!;
    const frame = view.frames.frames[view.frames.frames.length - 1];
    render(<Stage3D view={view} frame={frame} section={section} fy={210} stressTop={256.5} dark={false} />);
    expect(await screen.findByRole("status")).toHaveTextContent(STAGE_WEBGL_MISSING);
    quiet.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("the 2D stage on hover", () => {
  const view = bendingView(bending as unknown as BendingResponse);
  const frame = view.frames.frames[view.frames.frames.length - 1];
  const section = stageSection(
    { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
    "bending",
    "major",
  )!;
  const draw = () =>
    render(<StageDrawing view={view} frame={frame} section={section} cValues={null} lit={null} fy={210} whatIf={null} limitRatio={15} stressTop={256.5} />);

  it("shows the fibre under the pointer with its strain and stress, and takes them away on leaving", () => {
    const { container } = draw();
    const L = stageLayout(section, 15, 256.5, 210);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(container.querySelector(".st-probe")).toBeNull();
    // jsdom has no layout: make the box one SVG unit per pixel
    svg.getBoundingClientRect = () => ({ top: 0, left: 0, width: L.viewW, height: L.viewH, right: L.viewW, bottom: L.viewH, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: L.ex, clientY: L.mid - L.halfDepth / 2 });
    const card = container.querySelector(".st-probe") as SVGGElement;
    expect(card).toHaveTextContent("z = +50.0 mm from the axis");
    expect(card).toHaveTextContent(/ε = [\d.]+ εy, compression/);
    expect(card).toHaveTextContent(/σ = [\d. ]+ N\/mm² = [\d.]+ fy/);
    fireEvent.mouseMove(svg, { clientX: L.ex, clientY: L.bot + 40 });
    expect(container.querySelector(".st-probe")).toBeNull(); // below the section
    fireEvent.mouseMove(svg, { clientX: L.ex, clientY: L.mid });
    fireEvent.mouseLeave(svg);
    expect(container.querySelector(".st-probe")).toBeNull();
  });
});


describe("the Forces choice", () => {
  const view = bendingView(bendingForces as unknown as BendingResponse);
  const last = view.frames.frames[view.frames.frames.length - 1];
  const section = { shape: "I-section" as const, fabrication: "rolled" as const, dims: { h: 200, b: 100, tw: 5.6, tf: 8.5, t: null, d: null, r: 12, s: null, cStem: null, rO: null }, turned: false, width: 100, height: 200 };
  const draw = (forces: boolean) =>
    render(
      <StageDrawing view={view} frame={last} section={section} cValues={null} lit={null} fy={view.frames.yield_stress} whatIf={null} limitRatio={last.ratio} stressTop={Math.abs(last.stress)} forces={forces} />,
    );

  it("draws no forces until it is asked for", () => {
    const { container } = draw(false);
    expect(container.querySelector(".st-forces")).toBeNull();
  });

  it("draws the two forces and the lever arm from the engine's numbers", () => {
    const { container } = draw(true);
    const column = container.querySelector(".st-forces")!;
    const r = last.resultants!;
    expect(column.textContent).toContain(`${(r.force_compression / 1000).toFixed(1)}`);
    expect(column.textContent).toContain(`${r.lever_arm.toFixed(1)} mm`);
    expect(column.querySelectorAll(".st-force-head")).toHaveLength(2);
  });

  it("reads the forces, the block's moment beside the code's, the parts and the working", () => {
    render(<ForcesPanel view={view} frame={last} hogging={false} />);
    const r = last.resultants!;
    expect(screen.getByText("Moment of the drawn stress block")).toBeInTheDocument();
    expect(screen.getByText(`+${(r.moment / 1e6).toFixed(2)}`, { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
    expect(screen.getByLabelText("Working of the forces at the strain limit").textContent).toContain("Gere");
    expect(screen.getByText(/Why the block's moment is not/)).toBeInTheDocument();
  });

  it("says why there are no forces when the frames carry none", () => {
    const noForces = view.frames.frames.map((f) => ({ ...f, resultants: null }));
    render(<ForcesPanel view={{ ...view, frames: { ...view.frames, frames: noForces } }} frame={noForces[noForces.length - 1]} hogging={false} />);
    expect(screen.getByText(/need the section's outline/)).toBeInTheDocument();
  });

  it("with Forces on, the hovered fibre also says the force out to it and the width there", () => {
    const f = bendingView(bendingForces as unknown as BendingResponse);
    const last = f.frames.frames[f.frames.frames.length - 1];
    const sec = stageSection(
      { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
      "bending",
      "major",
    )!;
    const top = Math.abs(last.stress);
    const { container } = render(
      <StageDrawing view={f} frame={last} section={sec} cValues={null} lit={null} fy={f.frames.yield_stress} whatIf={null} limitRatio={last.ratio} stressTop={top} forces />,
    );
    const L = stageLayout(sec, last.ratio, top, f.frames.yield_stress, true);
    const svg = container.querySelector("svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ top: 0, left: 0, width: L.viewW, height: L.viewH, right: L.viewW, bottom: L.viewH, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(svg, { clientX: L.ex, clientY: L.mid - L.halfDepth / 2 });
    const card = container.querySelector(".st-probe") as SVGGElement;
    expect(card).toHaveTextContent(/section width here = [\d.]+ mm/);
    expect(card).toHaveTextContent(/force from the compression edge = [\d.]+ kN/);
    expect(container.querySelector(".st-fibre-block")).not.toBeNull();
    // and not without it
    fireEvent.mouseLeave(svg);
    expect(container.querySelector(".st-fibre-block")).toBeNull();
  });

  it("hovering a force names its parts, and the fibre's own card steps aside", () => {
    const f = bendingView(bendingForces as unknown as BendingResponse);
    const last = f.frames.frames[f.frames.frames.length - 1];
    const sec = stageSection(
      { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
      "bending",
      "major",
    )!;
    const { container } = render(
      <StageDrawing view={f} frame={last} section={sec} cValues={null} lit={null} fy={f.frames.yield_stress} whatIf={null} limitRatio={last.ratio} stressTop={Math.abs(last.stress)} forces />,
    );
    const hits = container.querySelectorAll(".st-force-hit");
    expect(hits).toHaveLength(2);
    fireEvent.mouseEnter(hits[0]);
    const card = container.querySelector(".st-probe") as SVGGElement;
    expect(card).toHaveTextContent(/F_?c = [\d.]+ kN/);
    expect(card).toHaveTextContent(/acts [\d.]+ mm from the neutral axis/);
    expect(card).toHaveTextContent(/yielded zone: [\d.]+ kN at/);
    fireEvent.mouseLeave(hits[0]);
    expect(container.querySelector(".st-probe")).toBeNull();
  });
});


describe("the 3D cut with the Forces choice (the scene as data, no WebGL needed)", () => {
  const view = bendingView(bendingForces as unknown as BendingResponse);
  const frames = view.frames.frames;
  const last = frames[frames.length - 1];
  const sec = stageSection(
    { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
    "bending",
    "major",
  )!;
  const body = stageBody(sec);
  const top = Math.abs(last.stress);
  const forceTop = Math.max(...frames.map((f) => f.resultants?.force_compression ?? 0));
  const build = (mode: "resultants" | "parts" | "field" | null) => buildContent(view, last, body, view.frames.yield_stress, top, mode, forceTop);
  const ids = (labels: { id: string }[]) => labels.map((l) => l.id);

  it("draws the field of arrows with its stress labels, and no forces, when the choice is off", () => {
    const built = build(null);
    expect(ids(built.labels)).toEqual(expect.arrayContaining(["top", "bottom"]));
    expect(ids(built.labels)).not.toContain("Fc");
    built.dispose();
  });

  it("draws the two resultants with their forces and the lever arm, in place of the field", () => {
    const built = build("resultants");
    const text = Object.fromEntries(built.labels.map((l) => [l.id, l.text]));
    expect(text.Fc).toMatch(/^F_c = [\d. ]+ kN$/);
    expect(text.Ft).toMatch(/^F_t = [\d. ]+ kN$/);
    expect(text.lever).toBe(`lever arm ${last.resultants!.lever_arm.toFixed(1)} mm`);
    expect(ids(built.labels)).not.toContain("top");
    built.dispose();
  });

  it("pulls the volume apart into parts, each labelled with the engine's force", () => {
    const built = build("parts");
    const parts = built.labels.filter((l) => l.id.startsWith("part-"));
    expect(parts).toHaveLength(6);
    expect(parts.map((l) => l.text).join("|")).toMatch(/elastic core, compression: [\d. ]+ kN/);
    expect(parts.map((l) => l.text).join("|")).toMatch(/hardening, tension: [\d. ]+ kN/);
    built.dispose();
  });

  it("has only the core at first yield, and the one force of a uniform case", () => {
    const yielded = frames.find((f) => f.marks.includes("first_yield"))!;
    const built = buildContent(view, yielded, body, view.frames.yield_stress, top, "parts", forceTop);
    expect(built.labels.filter((l) => l.id.startsWith("part-"))).toHaveLength(2);
    built.dispose();
  });
});


describe("the 2D stage for a section not symmetric about the axis", () => {
  const view = bendingView(bendingCustom as unknown as BendingResponse);
  const frames = view.frames.frames;
  const last = frames[frames.length - 1];
  const form = {
    nodes: [[1, 0, 0], [2, 0, 280], [3, -47, 280], [4, 47, 280], [5, -97, 0], [6, 97, 0]].map(([id, x, y]) => ({ id, x, y })),
    links: [[1, 2, 6], [3, 2, 10], [2, 4, 10], [5, 1, 10], [1, 6, 10]].map(([from, to, thickness]) => ({ from, to, thickness })),
  } as never;
  const raw = linkSolids(form)!;
  const pts = raw.flatMap((s) => s.outer);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const sec = {
    shape: "I-section" as const,
    fabrication: null,
    dims: {} as never,
    turned: false,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    solids: raw.map((s) => ({ outer: s.outer.map(([x, y]) => [x - cx, y - cy] as [number, number]) })),
  };
  const peak = (v: number[]) => Math.max(...v.map(Math.abs));
  const top = Math.max(...frames.map((f) => Math.max(Math.abs(f.stress), peak(f.stress_profile))));
  const lim = Math.max(...frames.map((f) => peak(f.strain_profile)));
  const draw = () =>
    render(<StageDrawing view={view} frame={last} section={sec} cValues={null} lit={null} fy={view.frames.yield_stress} whatIf={null} limitRatio={lim} stressTop={top} forces />);

  it("draws the neutral axis where the engine found it, not at mid-depth", () => {
    const { container } = draw();
    const L = stageLayout(sec, lim, top, view.frames.yield_stress, true);
    const nd = last.neutral_depth ?? 0;
    expect(nd).not.toBe(0);
    const guides = container.querySelector(".st-guide")!.getAttribute("d")!;
    expect(guides).toContain(`${depthY(L, nd)}`);
    expect(container.textContent).toContain("neutral axis");
  });

  it("labels each edge with its own strain and stress: the tension edge is not the compression edge", () => {
    const { container } = draw();
    const tension = Math.abs(last.strain_profile[0]);
    expect(tension).not.toBeCloseTo(last.ratio, 0);
    expect(container.textContent).toContain(`${tension.toFixed(2)} ε`);
    expect(container.textContent).toContain(`${last.ratio.toFixed(1)} ε`);
  });

  it("puts the forces at their distances from the moved axis, and yield guides at both corners", () => {
    const { container } = draw();
    expect(container.querySelectorAll(".st-guide-strong").length).toBe(1); // one path with a line per corner
    const d = container.querySelector(".st-guide-strong")!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(last.depth.length - 2);
    expect(container.querySelector(".st-forces")).not.toBeNull();
  });

  it("draws C pointing at the cut and T pointing away from it, on the same side, so the two are opposite", () => {
    const f = bendingView(bendingForces as unknown as BendingResponse);
    const last = f.frames.frames[f.frames.frames.length - 1];
    const sec = stageSection(
      { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
      "bending",
      "major",
    )!;
    const { container } = render(
      <StageDrawing view={f} frame={last} section={sec} cValues={null} lit={null} fy={f.frames.yield_stress} whatIf={null} limitRatio={last.ratio} stressTop={Math.abs(last.stress)} forces />,
    );
    const L = stageLayout(sec, last.ratio, Math.abs(last.stress), f.frames.yield_stress, true);
    const heads = [...container.querySelectorAll(".st-force-head")].map((p) => p.getAttribute("d")!);
    const tips = heads.map((d) => Number(d.match(/^M([\d.]+)/)![1]));
    const leans = heads.map((d) => Number(d.match(/l(-?[\d.]+)/)![1])); // the head leans back from its tip
    // C: the tip is at the axis line and the head leans to the right of it, so the arrow points left
    expect(tips[0]).toBeCloseTo(L.fx + 1);
    expect(leans[0]).toBeGreaterThan(0);
    // T: the tip is away from the axis line, to its right, and the head leans back left: it points right
    expect(tips[1]).toBeGreaterThan(L.fx + 40);
    expect(leans[1]).toBeLessThan(0);
  });

  it("points the stress arrows opposite ways: compression left, tension right", () => {
    const f = bendingView(bendingForces as unknown as BendingResponse);
    const last = f.frames.frames[f.frames.frames.length - 1];
    const sec = stageSection(
      { ...defaultDeformationForm, kind: "template", shape: "I-section", fabrication: "rolled", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
      "bending",
      "major",
    )!;
    const { container } = render(
      <StageDrawing view={f} frame={last} section={sec} cValues={null} lit={null} fy={f.frames.yield_stress} whatIf={null} limitRatio={last.ratio} stressTop={Math.abs(last.stress)} />,
    );
    const arrows = [...container.querySelectorAll(".st-arrow")];
    expect(arrows.length).toBeGreaterThan(2);
    const direction = (g: Element) => {
      const line = g.querySelector("path:not(.st-arrow-head)")!.getAttribute("d")!;
      const [tail, end] = [...line.matchAll(/(-?[\d.]+) /g)].map((m) => Number(m[1])).concat([Number(line.match(/H(-?[\d.]+)/)![1])]).filter((_, i, a) => i === 0 || i === a.length - 1);
      return Math.sign(end - tail); // +1 points right, -1 points left
    };
    const dirs = arrows.map(direction);
    expect(dirs).toContain(-1); // compression, in the upper half
    expect(dirs).toContain(1); // tension, in the lower half
    expect(dirs.slice(0, 2).every((d) => d === -1)).toBe(true);
    expect(dirs.slice(-2).every((d) => d === 1)).toBe(true);
  });
});
