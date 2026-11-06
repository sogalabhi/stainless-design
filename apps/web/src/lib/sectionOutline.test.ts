import { describe, expect, it } from "vitest";
import { pathData, pathPolygons, sectionOutline } from "./sectionOutline";
import { EMPTY_DIMS } from "./sectionTemplates";

const iDims = { ...EMPTY_DIMS, h: 200, b: 100, tw: 6, tf: 10, r: 12, s: 5 };

function bounds(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

describe("the section outline (one source for the sketch and the 3D view)", () => {
  it("a rolled I-section has four fillets of radius r and no welds", () => {
    const outline = sectionOutline("I-section", "rolled", iDims);
    expect(outline.corner).toBe(12);
    expect(outline.welds).toHaveLength(0);
    expect(outline.paths[0].filter((cmd) => cmd.op === "A")).toHaveLength(4);
    expect(pathData(outline.paths)).toContain(" A 12 12 0 0 0 ");
  });

  it("a welded I-section is sharp with four weld triangles of leg s", () => {
    const outline = sectionOutline("I-section", "welded", iDims);
    expect(outline.corner).toBe(5);
    expect(outline.welds).toHaveLength(4);
    expect(pathData(outline.paths)).not.toContain(" A ");
    const [weld] = pathPolygons(outline.welds);
    expect(weld).toEqual([
      [3, 90],
      [8, 90],
      [3, 85],
    ]);
  });

  it("clamps a corner to the room the shape leaves, and draws it sharp with the corners layer off", () => {
    expect(sectionOutline("I-section", "rolled", { ...iDims, r: 500 }).corner).toBe(47);
    expect(sectionOutline("I-section", "rolled", iDims, { corners: false }).corner).toBe(0);
    expect(sectionOutline("angle", null, { ...EMPTY_DIMS, h: 100, b: 80, t: 8, r: null }).corner).toBe(0);
  });

  it("turns y up and samples the fillets: the polygon keeps the bounding box and passes through the arc", () => {
    const [loop] = pathPolygons(sectionOutline("I-section", "rolled", iDims).paths, 8);
    expect(bounds(loop)).toEqual([-50, -100, 50, 100]);
    // 12 corners, each fillet replaced by its 8 segments (9 points instead of 2)
    expect(loop).toHaveLength(12 - 4 + 4 * 9);
    // the fillet at the upper right of the web, centre (3 + 12, 90 - 12), radius 12
    const onArc = loop.filter(([x, y]) => x > 3 && x < 15 && y > 78 && y < 90);
    expect(onArc.length).toBeGreaterThan(0);
    for (const [x, y] of onArc) expect(Math.hypot(x - 15, y - 78)).toBeCloseTo(12, 6);
  });

  it("the T-section has its flange on top once y is up", () => {
    const [loop] = pathPolygons(sectionOutline("T-section", "rolled", { ...iDims, cStem: 150 }).paths);
    const top = loop.filter(([, y]) => y === 100).map(([x]) => x);
    expect(Math.min(...top)).toBe(-50);
    expect(Math.max(...top)).toBe(50);
  });

  it("a hollow section has a hole; a tube's polygons lie on its two circles", () => {
    const rhs = pathPolygons(sectionOutline("rectangular hollow section", null, { ...EMPTY_DIMS, h: 120, b: 80, t: 5, rO: 10 }).paths);
    expect(rhs).toHaveLength(2);
    expect(bounds(rhs[1])).toEqual([-35, -55, 35, 55]);
    const [outer, inner] = pathPolygons(sectionOutline("circular hollow section", null, { ...EMPTY_DIMS, d: 100, t: 4 }).paths, 16);
    expect(outer).toHaveLength(64);
    for (const [x, y] of outer) expect(Math.hypot(x, y)).toBeCloseTo(50, 9);
    for (const [x, y] of inner) expect(Math.hypot(x, y)).toBeCloseTo(46, 9);
  });

  it("writes level and plumb lines as H and V, as the sketch always has", () => {
    expect(pathData(sectionOutline("I-section", "welded", iDims).paths)).toBe(
      "M -50 -100 H 50 V -90 H 3 V 90 H 50 V 100 H -50 V 90 H -3 V -90 H -50 Z",
    );
  });
});
