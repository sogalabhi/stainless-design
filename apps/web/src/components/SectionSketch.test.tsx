import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SectionPropertiesResponse, SectionType } from "../api/types";
import { DEFAULT_LAYERS, type SketchLayers } from "../lib/layers";
import properties from "../test/fixtures/section_properties.json";
import propertiesAngle from "../test/fixtures/section_properties_angle.json";
import { EMPTY_DIMS, type DimKey, type Fabrication, type SketchDims } from "../lib/sectionTemplates";
import { SCHEMATIC_CAPTION, SectionSketch } from "./SectionSketch";

const ROLLED_I: SketchDims = { ...EMPTY_DIMS, h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 };

function sketch(
  props: Partial<{
    shape: SectionType;
    fabrication: Fabrication | null;
    dims: SketchDims;
    highlight: DimKey | null;
    cValues: Partial<Record<"web" | "flange" | "stem" | "leg", number>> | null;
    layers: SketchLayers;
    properties: SectionPropertiesResponse | null;
    onHover: (key: DimKey | null) => void;
    onSelect: (key: DimKey) => void;
  }> = {},
) {
  return render(
    <SectionSketch
      shape={props.shape ?? "I-section"}
      fabrication={props.fabrication === undefined ? "rolled" : props.fabrication}
      dims={props.dims ?? ROLLED_I}
      highlight={props.highlight ?? null}
      cValues={props.cValues ?? null}
      layers={props.layers}
      properties={props.properties}
      onHover={props.onHover}
      onSelect={props.onSelect}
    />,
  );
}

const svg = (container: HTMLElement) => container.querySelector("svg") as SVGSVGElement;
const dim = (container: HTMLElement, key: string) => container.querySelector(`[data-dim="${key}"]`) as SVGGElement;
const band = (container: HTMLElement, symbol: string) => container.querySelector(`[data-band="${symbol}"]`);

describe("the section sketch: schematic first, to scale once complete", () => {
  it("is a dashed schematic with symbols only while a dimension is missing", () => {
    const { container } = sketch({ dims: { ...ROLLED_I, tf: null } });
    expect(screen.getByText(SCHEMATIC_CAPTION)).toBeInTheDocument();
    expect(svg(container)).toHaveClass("sk-schematic");
    expect(container.querySelector(".sk-dashed")).toBeInTheDocument();
    // symbol labels only: not one typed number is printed, not even h = 200, which was typed
    expect(dim(container, "h")).toHaveTextContent(/^h$/);
    expect(dim(container, "b")).toHaveTextContent(/^b$/);
    expect(container.textContent).not.toMatch(/\d/);
    expect(svg(container)).toHaveAttribute("aria-label", expect.stringContaining("Schematic, not to scale"));
  });

  it("is an empty schematic when nothing is typed, and never fills a field", () => {
    const { container } = sketch({ dims: EMPTY_DIMS });
    expect(screen.getByText(SCHEMATIC_CAPTION)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
    expect(svg(container)).toHaveAttribute("aria-label", expect.stringContaining("No dimensions typed yet"));
  });

  it("is solid and to scale when complete, and the labels show the typed values", () => {
    const { container } = sketch();
    expect(screen.queryByText(SCHEMATIC_CAPTION)).not.toBeInTheDocument();
    expect(svg(container)).toHaveClass("sk-scaled");
    expect(container.querySelector(".sk-dashed")).not.toBeInTheDocument();
    expect(dim(container, "h")).toHaveTextContent("h = 200");
    expect(dim(container, "b")).toHaveTextContent("b = 100");
    expect(dim(container, "tw")).toHaveTextContent("tw = 5.6");
    expect(dim(container, "tf")).toHaveTextContent("tf = 8.5");
    expect(dim(container, "r")).toHaveTextContent("r = 12");
    expect(screen.getByText(/Drawn to scale/)).toBeInTheDocument();
  });

  it("uses one scale in both directions", () => {
    const { container } = sketch();
    const length = (key: string, axis: "x" | "y") => {
      const line = dim(container, key).querySelector(".sk-dim-line") as SVGLineElement;
      return Math.abs(Number(line.getAttribute(`${axis}2`)) - Number(line.getAttribute(`${axis}1`)));
    };
    // h = 200 is drawn twice as long as b = 100, vertically against horizontally
    expect(length("h", "y") / length("b", "x")).toBeCloseTo(2, 2);
  });

  it("describes the shape and the typed dimensions for a screen reader", () => {
    const { container } = sketch();
    const label = svg(container).getAttribute("aria-label") ?? "";
    expect(svg(container)).toHaveAttribute("role", "img");
    expect(label).toMatch(/I-section sketch, rolled/);
    for (const text of ["h = 200 mm", "b = 100 mm", "t w = 5.6 mm", "t f = 8.5 mm", "r = 12 mm"]) {
      expect(label).toContain(text);
    }
  });

  it("uses the colour tokens from the stylesheet, not fixed colours, so dark mode works", () => {
    const { container } = sketch();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
    expect(container.querySelector('[style*="color"]')).toBeNull();
  });
});

describe("the engine's c values", () => {
  it("are shown only when the engine gave them", () => {
    const without = sketch();
    expect(band(without.container, "c_w")).toHaveTextContent(/^c_?w$/);
    expect(without.container.textContent).not.toMatch(/159|35\.2/);
    without.unmount();

    const { container } = sketch({ cValues: { web: 159, flange: 35.2 } });
    expect(band(container, "c_w")).toHaveTextContent("cw = 159");
    expect(band(container, "c_f")).toHaveTextContent("cf = 35.2");
    expect(screen.getByText(/as the engine derived them/)).toBeInTheDocument();
  });

  it("are not shown on the schematic, even if the engine has an older answer", () => {
    const { container } = sketch({ dims: { ...ROLLED_I, h: null }, cValues: { web: 159, flange: 35.2 } });
    expect(container.textContent).not.toMatch(/159|35\.2/);
  });

  it("draw a tinted band on each plate with its symbol", () => {
    const { container } = sketch();
    expect(band(container, "c_w")?.querySelector("rect")).toBeInTheDocument();
    expect(band(container, "c_f")?.querySelector("rect")).toBeInTheDocument();
  });
});

describe("geometry that cannot exist", () => {
  it("shows a plain message naming the dimensions, and the sketch stays a schematic", () => {
    const { container } = sketch({ dims: { ...ROLLED_I, tf: 100 }, cValues: { web: 159 } });
    expect(screen.getByRole("status")).toHaveTextContent(/2t.*not less than h/);
    expect(screen.getByText(SCHEMATIC_CAPTION)).toBeInTheDocument();
    expect(svg(container)).toHaveClass("sk-schematic");
    expect(container.textContent).not.toMatch(/159/);
  });

  it.each([
    ["I-section", { ...ROLLED_I, tw: 100 }, /t.*not less than b/],
    ["channel", { ...ROLLED_I, tf: 100 }, /2t.*not less than h/],
    ["T-section", { ...ROLLED_I, tf: 200, cStem: 50 }, /not less than h/],
    ["T-section", { ...ROLLED_I, cStem: 200 }, /c.*stem.*not less than h|c_stem/],
    ["angle", { ...EMPTY_DIMS, h: 75, b: 100, t: 8 }, /longer leg/],
    ["angle", { ...EMPTY_DIMS, h: 100, b: 75, t: 80 }, /t is not less than b/],
    ["rectangular hollow section", { ...EMPTY_DIMS, h: 100, b: 50, t: 25 }, /2t is not less than/],
    ["circular hollow section", { ...EMPTY_DIMS, d: 100, t: 50 }, /2t is not less than d/],
    ["I-section", { ...ROLLED_I, h: -5 }, /positive/],
  ] as [SectionType, SketchDims, RegExp][])("%s: %#", (shape, dims, message) => {
    sketch({ shape, dims });
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });
});

describe("linking with the fields", () => {
  it("lights the dimension line of the highlighted field", () => {
    const { container } = sketch({ highlight: "tw" });
    expect(dim(container, "tw")).toHaveClass("is-active");
    expect(dim(container, "h")).not.toHaveClass("is-active");
  });

  it("tells the dock which line is hovered, and clears it again", async () => {
    const user = userEvent.setup();
    const onHover = vi.fn();
    const { container } = sketch({ onHover });
    await user.hover(dim(container, "b"));
    expect(onHover).toHaveBeenLastCalledWith("b");
    await user.unhover(dim(container, "b"));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("selects the field when a dimension line is clicked", () => {
    const onSelect = vi.fn();
    const { container } = sketch({ onSelect });
    fireEvent.click(dim(container, "h"));
    expect(onSelect).toHaveBeenCalledWith("h");
  });
});

describe("every shape", () => {
  const cases: [SectionType, Fabrication | null, SketchDims, DimKey[]][] = [
    ["I-section", "rolled", ROLLED_I, ["h", "b", "tw", "tf", "r"]],
    ["I-section", "welded", { ...ROLLED_I, r: null, s: 5 }, ["h", "b", "tw", "tf", "s"]],
    ["channel", "rolled", { ...ROLLED_I, h: 200, b: 75, tw: 8.5, tf: 11.5, r: 11.5 }, ["h", "b", "tw", "tf", "r"]],
    ["channel", "welded", { ...ROLLED_I, r: null, s: 4 }, ["h", "b", "tw", "tf", "s"]],
    ["T-section", "rolled", { ...ROLLED_I, h: 100, tw: 6, tf: 8, r: 10, cStem: 80 }, ["h", "b", "tw", "tf", "r", "cStem"]],
    ["T-section", "welded", { ...ROLLED_I, h: 100, tw: 6, tf: 8, r: null, s: 5, cStem: 80 }, ["h", "b", "tw", "tf", "s", "cStem"]],
    ["angle", null, { ...EMPTY_DIMS, h: 100, b: 75, t: 8 }, ["h", "b", "t"]],
    ["rectangular hollow section", null, { ...EMPTY_DIMS, h: 100, b: 50, t: 4 }, ["h", "b", "t"]],
    ["circular hollow section", null, { ...EMPTY_DIMS, d: 100, t: 5 }, ["d", "t"]],
  ];

  it.each(cases)("%s (%s): a dimension line per typed field, in the schematic and to scale", (shape, fabrication, dims, keys) => {
    const complete = sketch({ shape, fabrication, dims });
    for (const key of keys) expect(dim(complete.container, key), key).toBeInTheDocument();
    expect(svg(complete.container)).toHaveClass("sk-scaled");
    complete.unmount();
    const schematic = sketch({ shape, fabrication, dims: EMPTY_DIMS });
    for (const key of keys) expect(dim(schematic.container, key), key).toBeInTheDocument();
    expect(svg(schematic.container)).toHaveClass("sk-schematic");
  });

  it("a welded section has weld triangles of leg s, a rolled one fillets of radius r", () => {
    const rolled = sketch();
    expect(rolled.container.querySelector("path.sk-solid")?.getAttribute("d")).toContain(" A ");
    rolled.unmount();
    const welded = sketch({ fabrication: "welded", dims: { ...ROLLED_I, r: null, s: 5 } });
    expect(welded.container.querySelectorAll("path.sk-solid").length).toBe(5); // outline and four welds
    expect(welded.container.querySelector("path.sk-solid")?.getAttribute("d")).not.toContain(" A ");
  });
});

describe("the corner radii that only the properties use", () => {
  const RHS_DIMS: SketchDims = { ...EMPTY_DIMS, h: 100, b: 50, t: 4 };
  const ANGLE_DIMS: SketchDims = { ...EMPTY_DIMS, h: 100, b: 75, t: 8 };

  it("an RHS is drawn with sharp corners until r_o is typed, then with arcs and a labelled leader", () => {
    const sharp = sketch({ shape: "rectangular hollow section", fabrication: null, dims: RHS_DIMS });
    expect(sharp.container.querySelector("path.sk-solid")?.getAttribute("d")).not.toContain(" A ");
    expect(dim(sharp.container, "rO")).not.toBeInTheDocument();
    sharp.unmount();
    const zero = sketch({ shape: "rectangular hollow section", fabrication: null, dims: { ...RHS_DIMS, rO: 0 } });
    expect(zero.container.querySelector("path.sk-solid")?.getAttribute("d")).not.toContain(" A "); // 0 is sharp
    zero.unmount();
    const { container } = sketch({ shape: "rectangular hollow section", fabrication: null, dims: { ...RHS_DIMS, rO: 10 } });
    const path = container.querySelector("path.sk-solid")?.getAttribute("d") ?? "";
    expect(path.match(/ A /g)).toHaveLength(8); // four outer and four inner corners
    expect(dim(container, "rO")).toHaveTextContent("ro = 10");
  });

  it("the inner radius of an RHS is the outer one less the wall, and 0 when the wall is thicker", () => {
    const arcs = (rO: number) => {
      const { container, unmount } = sketch({
        shape: "rectangular hollow section",
        fabrication: null,
        dims: { ...RHS_DIMS, rO },
      });
      const d = container.querySelector("path.sk-solid")?.getAttribute("d") ?? "";
      unmount();
      return d.match(/ A /g)?.length ?? 0;
    };
    expect(arcs(10)).toBe(8); // r_i = 6
    expect(arcs(4)).toBe(4); // r_i = 4 - 4 = 0: only the outer corners are round
  });

  it("an angle shows its root radius as a leader and an arc, only once typed", () => {
    const without = sketch({ shape: "angle", fabrication: null, dims: ANGLE_DIMS });
    expect(dim(without.container, "r")).not.toBeInTheDocument();
    without.unmount();
    const { container } = sketch({ shape: "angle", fabrication: null, dims: { ...ANGLE_DIMS, r: 10 } });
    expect(container.querySelector("path.sk-solid")?.getAttribute("d")).toContain(" A ");
    expect(dim(container, "r")).toHaveTextContent("r = 10");
  });

  it("the radii are on the typed list read out by a screen reader", () => {
    const { container } = sketch({ shape: "rectangular hollow section", fabrication: null, dims: { ...RHS_DIMS, rO: 10 } });
    expect(svg(container).getAttribute("aria-label")).toContain("r o = 10 mm");
  });

  it("the drawing-feasibility message names a radius that cannot be", () => {
    sketch({ shape: "rectangular hollow section", fabrication: null, dims: { ...RHS_DIMS, rO: 30 } });
    expect(screen.getByRole("status")).toHaveTextContent(/r_o is more than half the smaller of h and b/);
  });

  it("the angle's radius cannot be longer than the free leg", () => {
    sketch({ shape: "angle", fabrication: null, dims: { ...ANGLE_DIMS, r: 70 } });
    expect(screen.getByRole("status")).toHaveTextContent(/r is more than the free length/);
  });
});

describe("the layers", () => {
  it("dimensions off removes every dimension line; flat widths off removes the bands", () => {
    const { container } = sketch({
      layers: { ...DEFAULT_LAYERS, dimensions: false, flat: false },
      cValues: { web: 159, flange: 35.2 },
    });
    expect(container.querySelector("[data-dim]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-band]")).not.toBeInTheDocument();
    expect(container.querySelector("path.sk-solid")).toBeInTheDocument();
  });

  it("axes off removes the axes; fillets off draws sharp corners and drops the r leader", () => {
    const { container } = sketch({ layers: { ...DEFAULT_LAYERS, axes: false, corners: false } });
    expect(container.querySelector(".sk-axes")).not.toBeInTheDocument();
    expect(container.querySelector("path.sk-solid")?.getAttribute("d")).not.toContain(" A ");
    expect(dim(container, "r")).not.toBeInTheDocument();
  });
});

describe("the engine's properties drawn on the section", () => {
  const ALL = { ...DEFAULT_LAYERS, centroid: true, plastic: true, shear: true, principal: true };
  const I = properties as unknown as SectionPropertiesResponse;
  const ANGLE = propertiesAngle as unknown as SectionPropertiesResponse;
  const ANGLE_DIMS: SketchDims = { ...EMPTY_DIMS, h: 100, b: 75, t: 8, r: 10 };
  const layer = (container: HTMLElement, name: string) => container.querySelector(`[data-layer="${name}"]`);

  it("draws nothing from the engine when none was given", () => {
    const { container } = sketch({ layers: ALL, properties: null });
    for (const name of ["centroid", "plastic", "shear", "principal"]) expect(layer(container, name)).toBeNull();
    expect(screen.queryByRole("list", { name: "Legend" })).not.toBeInTheDocument();
  });

  it("draws nothing from the engine on the schematic", () => {
    const { container } = sketch({ layers: ALL, properties: I, dims: { ...ROLLED_I, tf: null } });
    expect(layer(container, "centroid")).toBeNull();
  });

  it("draws each layer only when its checkbox is on, each with a legend entry", () => {
    for (const name of ["centroid", "plastic", "shear"] as const) {
      const { container, unmount } = sketch({ layers: { ...DEFAULT_LAYERS, [name]: true }, properties: I });
      expect(layer(container, name)).toBeInTheDocument();
      expect(document.querySelector(`[data-legend="${name}"]`)).toBeInTheDocument();
      for (const other of ["centroid", "plastic", "shear"].filter((n) => n !== name)) {
        expect(layer(container, other)).toBeNull();
      }
      unmount();
    }
  });

  it("puts the centroid and the shear centre where the engine says, moved to the drawing's axes", () => {
    const { container } = sketch({
      shape: "angle",
      fabrication: null,
      dims: ANGLE_DIMS,
      layers: { ...DEFAULT_LAYERS, centroid: true, shear: true },
      properties: ANGLE,
    });
    // y: engine 19.04 of 75 wide is left of the middle (37.5); z: engine 31.5 of 100 high is below the middle
    const [, x, y] = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(
      layer(container, "centroid")?.getAttribute("transform") ?? "",
    ) as RegExpExecArray;
    expect(Number(x)).toBeLessThan(0);
    expect(Number(y)).toBeGreaterThan(0);
    // the shear centre (t/2, t/2) of the angle is near the heel: further left and lower than the centroid
    const square = layer(container, "shear") as SVGRectElement;
    expect(Number(square.getAttribute("x")) + 4).toBeLessThan(Number(x));
    expect(Number(square.getAttribute("y")) + 4).toBeGreaterThan(Number(y));
  });

  it("the plastic neutral axes are the engine's equal-area lines, y-y horizontal and z-z vertical", () => {
    const { container } = sketch({ layers: { ...DEFAULT_LAYERS, plastic: true }, properties: I });
    const [horizontal, vertical] = [...(layer(container, "plastic")?.querySelectorAll("line") ?? [])];
    expect(horizontal.getAttribute("y1")).toBe(horizontal.getAttribute("y2"));
    expect(vertical.getAttribute("x1")).toBe(vertical.getAttribute("x2"));
    // for the I-section the equal-area lines are the symmetry axes: through the middle of the drawing
    expect(Number(horizontal.getAttribute("y1"))).toBeCloseTo(0, 1);
    expect(Number(vertical.getAttribute("x1"))).toBeCloseTo(0, 1);
  });

  it("draws the principal axes of an angle at the engine's angle, two lines through the centroid", () => {
    const { container } = sketch({
      shape: "angle",
      fabrication: null,
      dims: ANGLE_DIMS,
      layers: { ...DEFAULT_LAYERS, principal: true },
      properties: ANGLE,
    });
    const lines = [...(layer(container, "principal")?.querySelectorAll("line") ?? [])];
    expect(lines).toHaveLength(2);
    const direction = (line: Element) => {
      const dx = Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"));
      const dy = Number(line.getAttribute("y2")) - Number(line.getAttribute("y1"));
      return (Math.atan2(-dy, dx) * 180) / Math.PI; // the drawing has y down
    };
    expect(direction(lines[0])).toBeCloseTo(ANGLE.principal?.angle_deg ?? 0, 1);
    expect(Math.abs(direction(lines[1]) - direction(lines[0]))).toBeCloseTo(90, 1);
    expect(screen.getByText("Principal axes u and v")).toBeInTheDocument();
  });

  it("draws the y-y and z-z axes through the engine's centroid when it has one", () => {
    const { container } = sketch({
      shape: "angle",
      fabrication: null,
      dims: ANGLE_DIMS,
      properties: ANGLE,
    });
    expect(layer(container, "axes")).toBeInTheDocument(); // an angle has no symmetry axis: only the engine can place them
  });
});
