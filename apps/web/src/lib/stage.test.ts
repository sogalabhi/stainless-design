import { describe, expect, it } from "vitest";
import type { BendingResponse, ComparisonPointOut, CompressionResponse, StageFrameOut, TensionResponse } from "../api/types";
import bendingB19 from "../test/fixtures/bending_b19.json";
import bendingTemplate from "../test/fixtures/bending_template.json";
import compressionB15 from "../test/fixtures/compression_b15.json";
import compressionTemplate from "../test/fixtures/compression_template.json";
import tensionFixture from "../test/fixtures/tension.json";
import {
  bendingView,
  compressionView,
  defaultCase,
  hardenedPolygon,
  playIndex,
  profileAt,
  sliderMarks,
  splitProfile,
  stepValue,
  tensionView,
  visibleMarks,
  whatIfFrames,
} from "./stage";

const tension = tensionView(tensionFixture as unknown as TensionResponse);
const compression = compressionView(compressionTemplate as unknown as CompressionResponse);
const slender = compressionView(compressionB15 as unknown as CompressionResponse);
const bending = bendingView(bendingTemplate as unknown as BendingResponse);
const slenderBending = bendingView(bendingB19 as unknown as BendingResponse);

describe("the case shown first", () => {
  it("is the first case that is done, else Tension", () => {
    expect(defaultCase({ tension: "waiting", compression: "done", bending: "done" })).toBe("compression");
    expect(defaultCase({ tension: "done", compression: "done", bending: "done" })).toBe("tension");
    expect(defaultCase({ tension: "waiting", compression: "waiting", bending: "error" })).toBe("tension");
  });
});

describe("the headline of each load case, from the engine's values", () => {
  it("tension: kN and the engine's percentage above A f_y / γ_M0", () => {
    expect(tension.symbol).toBe("N_csm,t,Rd");
    expect(tension.value).toBeCloseTo(233.148, 3);
    expect(tension.refs).toHaveLength(1);
    expect(tension.refs[0].value).toBeCloseTo(190.909, 3);
    expect(tension.why).toContain("22.1 % above A f_y / γ_M0");
    expect(tension.why).toContain("15.0 times the yield strain");
    expect(tension.press).toBe(false);
  });

  it("compression B.16: the web's strain limit and the percentage above yield", () => {
    expect(compression.value).toBeCloseTo(564.427, 3);
    expect(compression.why).toContain("Formula B.16");
    expect(compression.why).toContain("3.41 times yield");
    expect(compression.why).toContain("218.0 N/mm²");
    expect(compression.why).toContain("3.8 % above A f_y / γ_M0");
    expect(compression.governing?.label).toBe("web");
    expect(compression.press).toBe(true);
  });

  it("compression B.15: says below the yield resistance", () => {
    expect(slender.formula).toBe("B.15");
    expect(slender.why).toMatch(/% below A f_y \/ γ_M0/);
    expect(slender.frames.frames.some((f) => f.marks.includes("first_yield"))).toBe(false);
  });

  it("bending B.20: kN m, M_el and M_pl, α from Table B.2 and the held limit", () => {
    expect(bending.unit).toBe("kN m");
    expect(bending.value).toBeCloseTo(50.2993, 3);
    expect(bending.refs.map((ref) => ref.symbol)).toEqual(["M_el", "M_pl"]);
    expect(bending.refs[1].value).toBeCloseTo(42.1145, 3);
    expect(bending.why).toContain("α = 2.0 from Table B.2 (I-section, major axis)");
    expect(bending.why).toContain("held at Ω = 15");
    expect(bending.why).toContain("19.4 % above the plastic moment M_pl");
    expect(bending.uniform).toBe(false);
  });

  it("bending B.19: below the elastic moment", () => {
    expect(slenderBending.why).toMatch(/% below the elastic moment M_el/);
  });

  it("reads a step of the engine's working by its symbol", () => {
    expect(stepValue(tension.trace, "C₁ε_u/ε_y")).toBeGreaterThan(15);
    expect(stepValue(tension.trace, "nope")).toBeNull();
  });
});

describe("the slider", () => {
  const frames = bending.frames.frames;

  it("marks unloaded, first yield, where it passes M_pl, and the limit", () => {
    const marks = sliderMarks(frames, true);
    expect(marks.map((m) => m.kind)).toEqual(["unloaded", "first_yield", "passes_mpl", "limit"]);
    expect(marks[3].label).toContain("held at Ω");
    expect(frames[marks[1].index].ratio).toBe(1);
  });

  it("drops a middle mark that would sit too close to the one before or to the limit", () => {
    const marks = sliderMarks(frames, false);
    const shown = visibleMarks(marks, frames.length, 0.14, 0.2);
    expect(shown[0].kind).toBe("unloaded");
    expect(shown[shown.length - 1].kind).toBe("limit");
    expect(shown.some((m) => m.kind === "passes_mpl")).toBe(true);
    expect(visibleMarks(marks, frames.length, 0.9, 0.2).map((m) => m.kind)).toEqual(["unloaded", "limit"]);
  });

  it("the animation starts at the first frame and ends on the last, always on a frame", () => {
    expect(playIndex(frames, 0)).toBe(0);
    expect(playIndex(frames, 1)).toBe(frames.length - 1);
    let previous = 0;
    for (let u = 0; u <= 1; u += 0.05) {
      const index = playIndex(frames, u);
      expect(index).toBeGreaterThanOrEqual(previous);
      expect(Number.isInteger(index)).toBe(true);
      previous = index;
    }
  });

  it("spends half the time below twice the yield strain", () => {
    expect(frames[playIndex(frames, 0.5)].ratio).toBeLessThanOrEqual(2);
    expect(frames[playIndex(frames, 0.5)].ratio).toBeGreaterThan(1.8);
  });

  it("reduced motion jumps in a few equal stops", () => {
    const seen = new Set<number>();
    for (let u = 0; u <= 1; u += 0.01) seen.add(playIndex(frames, u, 6));
    expect(seen.size).toBeLessThanOrEqual(7);
  });
});

describe("the what-if frames", () => {
  const point: ComparisonPointOut = {
    factor: 0.73,
    slenderness: 1.0,
    zone: "slender",
    strain_ratio: 1.5,
    strain: 0.001575,
    stress: 211.8,
    governing_label: "web",
  };

  it("keeps the engine's frames below the sweep point's limit and ends on the point itself", () => {
    const out = whatIfFrames(compression.frames, point);
    expect(out).not.toBeNull();
    const list = out!.frames;
    expect(list[list.length - 1]).toMatchObject({ ratio: 1.5, stress: 211.8, marks: ["limit"], stress_over_yield: null });
    expect(list.slice(0, -1).every((f) => f.ratio < 1.5)).toBe(true);
    expect(list.slice(0, -1).every((f) => !f.marks.includes("limit"))).toBe(true);
    expect(list[list.length - 1].strain_profile).toEqual([1.5, 1.5]);
  });

  it("is null beyond the method's limit", () => {
    expect(whatIfFrames(compression.frames, { ...point, strain_ratio: null, strain: null, stress: null, zone: "not_allowed" })).toBeNull();
  });
});

describe("reading the engine's polylines", () => {
  const frame = bending.frames.frames[bending.frames.frames.length - 1] as StageFrameOut;

  it("reads the stress along the polyline and keeps the corners exact", () => {
    expect(profileAt(frame.depth, frame.stress_profile, 1)).toBeCloseTo(frame.stress, 9);
    expect(profileAt(frame.depth, frame.stress_profile, 0)).toBeCloseTo(0, 9);
    expect(profileAt(frame.depth, frame.stress_profile, frame.depth[2])).toBeCloseTo(bending.frames.yield_stress, 6);
    expect(profileAt(frame.depth, frame.stress_profile, -5)).toBe(frame.stress_profile[0]);
  });

  it("splits a profile where it crosses zero, one part per sign", () => {
    const parts = splitProfile(frame.depth, frame.stress_profile);
    expect(parts.map((p) => p.sign).sort()).toEqual([-1, 1]);
    const top = parts.find((p) => p.sign === 1)!;
    expect(top.points[0]).toEqual([0, 0]);
    expect(top.points[top.points.length - 1][1]).toBe(1);
  });

  it("a uniform profile is one part", () => {
    const uniform = tension.frames.frames[tension.frames.frames.length - 1];
    const parts = splitProfile(uniform.depth, uniform.stress_profile);
    expect(parts).toHaveLength(1);
    expect(parts[0].sign).toBe(-1);
  });

  it("the stress above f_y is a polygon from the line |σ| = f_y to the profile", () => {
    const fy = bending.frames.yield_stress;
    const top = splitProfile(frame.depth, frame.stress_profile).find((p) => p.sign === 1)!;
    const polygon = hardenedPolygon(top, fy);
    expect(polygon[0][0]).toBe(fy);
    expect(polygon[polygon.length - 1][0]).toBe(fy);
    expect(Math.max(...polygon.map(([v]) => v))).toBeCloseTo(frame.stress, 9);
    // at first yield there is nothing above f_y
    const yieldFrame = bending.frames.frames.find((f) => f.marks.includes("first_yield"))!;
    const part = splitProfile(yieldFrame.depth, yieldFrame.stress_profile)[0];
    expect(hardenedPolygon(part, fy)).toEqual([]);
  });
});
