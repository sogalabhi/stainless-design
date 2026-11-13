import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BendingResponse } from "../../api/types";
import { bendingView } from "../../lib/stage";
import { stageSection } from "../../lib/stageSection";
import { defaultDeformationForm } from "../../lib/geometry";
import bending from "../../test/fixtures/bending_template.json";
import { StageSectionDrawing } from "../SectionSketch";
import { stageLayout } from "../../lib/stageLayout";
import { StageDrawing } from "./StageDrawing";
import Stage3D, { STAGE_WEBGL_MISSING } from "./Stage3D";

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
