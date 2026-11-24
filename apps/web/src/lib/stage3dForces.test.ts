import { describe, expect, it } from "vitest";
import type { BendingResponse } from "../api/types";
import bendingForces from "../test/fixtures/bending_forces.json";
import { bendingView } from "./stage";
import { clipSolidsToBand, partForce, partRange, resultantArrows, stageParts } from "./stage3dForces";

const view = bendingView(bendingForces as unknown as BendingResponse);
const frames = view.frames.frames;
const last = frames[frames.length - 1];
const firstYield = frames.find((f) => f.marks.includes("first_yield"))!;
const body = { width: 100, height: 200, halfDepth: 100 };

describe("the resultants on the cut face", () => {
  const r = last.resultants!;
  it("stand at their distances from the neutral axis, one scale for the whole slider", () => {
    const arrows = resultantArrows(body, r, r.force_compression, false)!;
    expect(arrows.compression.y).toBeCloseTo(r.distance_compression);
    expect(arrows.tension.y).toBeCloseTo(-r.distance_tension);
    expect(arrows.compression.length).toBeCloseTo(0.55 * 200); // the largest force of the slider
    const half = resultantArrows(body, r, 2 * r.force_compression, false)!;
    expect(half.compression.length).toBeCloseTo(0.55 * 100);
  });

  it("turn over for hogging: compression below the axis", () => {
    const arrows = resultantArrows(body, r, r.force_compression, true)!;
    expect(arrows.compression.y).toBeCloseTo(-r.distance_compression);
    expect(arrows.tension.y).toBeCloseTo(r.distance_tension);
  });

  it("are not drawn without a force or a scale", () => {
    expect(resultantArrows(body, frames[0].resultants!, r.force_compression, false)).toBeNull();
    expect(resultantArrows(body, r, 0, false)).toBeNull();
  });
});

describe("the stress volume in parts", () => {
  it("is the core only at first yield", () => {
    const parts = stageParts(body, firstYield);
    expect(parts.map((p) => p.layer)).toEqual(["core", "core"]);
    expect(parts.map((p) => p.side).sort()).toEqual(["compression", "tension"]);
  });

  it("past yield splits each edge into the yielded zone and the hardening, beyond the elastic core", () => {
    const parts = stageParts(body, last);
    expect(parts.map((p) => p.layer).sort()).toEqual(["core", "core", "hardening", "hardening", "yielded", "yielded"]);
    const corner = last.depth.find((d) => d > 0 && d < 1)!;
    const core = parts.find((p) => p.layer === "core" && p.side === "compression")!;
    expect(core.band[0]).toBeCloseTo(0);
    expect(core.band[1]).toBeCloseTo(corner * 100);
    const yielded = parts.find((p) => p.layer === "yielded" && p.side === "compression")!;
    expect(yielded.band).toEqual([corner * 100, 100]);
  });

  it("gives every part the engine's force", () => {
    const r = last.resultants!;
    for (const part of stageParts(body, last)) expect(partForce(r, part)).not.toBeNull();
    expect(stageParts(body, last).filter((p) => p.side === "compression").reduce((sum, p) => sum + (partForce(r, p) ?? 0), 0)).toBeCloseTo(r.force_compression, 3);
  });

  it("stacks the hardening on the yielded volume at f_y", () => {
    expect(partRange("core", 150, 210)).toEqual([0, 150]);
    expect(partRange("yielded", 250, 210)).toEqual([0, 210]);
    expect(partRange("hardening", 250, 210)).toEqual([210, 250]);
    expect(partRange("hardening", 180, 210)).toEqual([180, 180]);
  });
});

describe("the section cut to a band of the depth", () => {
  const rect = [{ outer: [[-5, -10], [5, -10], [5, 10], [-5, 10]] as [number, number][] }];
  it("keeps the fibres inside the band", () => {
    const [cut] = clipSolidsToBand(rect, 2, 6);
    const ys = cut.outer.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(2);
    expect(Math.max(...ys)).toBeCloseTo(6);
    expect(cut.outer).toHaveLength(4);
  });
  it("is empty outside the section, and keeps a hole that lies inside the band", () => {
    expect(clipSolidsToBand(rect, 11, 12)).toEqual([]);
    const ring = [{ outer: rect[0].outer, holes: [[[-2, -3], [-2, 3], [2, 3], [2, -3]] as [number, number][]] }];
    expect(clipSolidsToBand(ring, -5, 5)[0].holes).toHaveLength(1);
    expect(clipSolidsToBand(ring, 5, 9)[0].holes).toBeUndefined();
  });
});

import { fibreLines } from "./stage3dForces";

describe("the card of a fibre on the 3D face", () => {
  it("reads the engine's profiles and fibre grid at the pointer's height", () => {
    const lines = fibreLines(view.frames, last, 100, false, 70, view.frames.yield_stress)!;
    expect(lines[0]).toBe("z = +70.0 mm from the axis");
    expect(lines[1]).toMatch(/^ε = [\d.]+ ε_y, compression$/);
    expect(lines.some((l) => /^section width here = [\d.]+ mm$/.test(l))).toBe(true);
    expect(lines.some((l) => /^force from the upper edge = [\d.]+ kN$/.test(l))).toBe(true);
  });
  it("has nothing off the section, and no force lines without the engine's grid", () => {
    expect(fibreLines(view.frames, last, 100, false, 120, 210)).toBeNull();
    const bare = fibreLines({ fibre_depth: [], fibre_width: [] }, { ...last, fibre_force: null }, 100, false, 50, 210)!;
    expect(bare).toHaveLength(3);
  });
});

import bendingCustom from "../test/fixtures/bending_custom.json";

describe("an unsymmetric section: the neutral axis is not at mid-depth", () => {
  const custom = bendingView(bendingCustom as unknown as BendingResponse);
  const f = custom.frames.frames;
  const end = f[f.length - 1];
  const b = { width: 194, height: 290, halfDepth: 145 };
  const nd = end.neutral_depth ?? 0;

  it("splits the volume into parts at the neutral axis, with the core up to each yield corner", () => {
    const parts = stageParts(b, end);
    const axis = nd * b.halfDepth;
    expect(nd).not.toBe(0);
    const core = parts.filter((p) => p.layer === "core");
    expect(core).toHaveLength(2);
    expect(core.some((p) => p.band[0] === axis || p.band[1] === axis)).toBe(true);
    const r = end.resultants!;
    for (const part of parts) expect(partForce(r, part)).not.toBeNull();
    expect(parts.filter((p) => p.side === "compression").reduce((sum, p) => sum + (partForce(r, p) ?? 0), 0)).toBeCloseTo(r.force_compression, 3);
    expect(parts.filter((p) => p.side === "tension").reduce((sum, p) => sum + (partForce(r, p) ?? 0), 0)).toBeCloseTo(r.force_tension, 3);
  });

  it("stands the forces at their distances from the moved axis", () => {
    const r = end.resultants!;
    const arrows = resultantArrows(b, r, r.force_compression, false, nd)!;
    expect(arrows.compression.y).toBeCloseTo(nd * 145 + r.distance_compression);
    expect(arrows.tension.y).toBeCloseTo(nd * 145 - r.distance_tension);
    const turned = resultantArrows(b, r, r.force_compression, true, nd)!;
    expect(turned.compression.y).toBeCloseTo(-arrows.compression.y);
  });

  it("measures the card's distance from the neutral axis, not from mid-depth", () => {
    const axis = nd * 145;
    const lines = fibreLines(custom.frames, end, 145, false, axis + 20, custom.frames.yield_stress)!;
    expect(lines[0]).toBe("z = +20.0 mm from the axis");
  });
});
