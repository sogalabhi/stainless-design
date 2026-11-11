import { describe, expect, it } from "vitest";
import bendingTemplate from "../test/fixtures/bending_template.json";
import type { BendingResponse } from "../api/types";
import { bendingView } from "./stage";
import { depthY, frameShapes, stageLayout, strainTicks, stressTicks } from "./stageLayout";
import type { StageSection } from "./stageSection";

const bending = bendingView(bendingTemplate as unknown as BendingResponse);
const frames = bending.frames.frames;
const last = frames[frames.length - 1];
const section = (width: number, height: number): StageSection => ({ shape: "I-section", fabrication: "rolled", dims: {} as never, turned: false, width, height });

describe("the layout of the 2D stage", () => {
  it("is the prototype's layout for a 200 x 100 section", () => {
    const L = stageLayout(section(100, 200), 15, 256.5, 210);
    expect([L.scale, L.cx, L.ex, L.sx, L.gx, L.viewW]).toEqual([1.5, 175, 500, 815, 985, 1100]);
    expect(L.bot - L.top).toBeCloseTo(300);
    expect(L.eu).toBeCloseTo(100 / 15);
    expect(L.su).toBeCloseTo(0.5);
    expect(strainTicks(L.ratioMax)).toEqual([-15, -10, -5, 0, 5, 10, 15]);
    expect(stressTicks(L.stressMax)).toEqual([-300, -200, -100, 0, 100, 200, 300]);
  });

  it("makes room for a wide section and a high stress", () => {
    const L = stageLayout(section(300, 100), 15, 612, 450);
    expect(L.cx).toBeGreaterThan(175);
    expect(L.viewW).toBeGreaterThan(1100);
    expect(L.stressMax).toBe(700);
    expect(stageLayout(null, 20, 100, 210).ratioMax).toBe(20);
  });

  it("puts the compression edge at the top of the depth axis", () => {
    const L = stageLayout(section(100, 200), 15, 256.5, 210);
    expect(depthY(L, 1)).toBe(L.top);
    expect(depthY(L, -1)).toBe(L.bot);
    expect(depthY(L, 0)).toBe(L.mid);
  });

  it("draws a bending frame as a strain bowtie and a hatched stress above f_y", () => {
    const L = stageLayout(section(100, 200), 15, last.stress, 210);
    const shapes = frameShapes(L, last.depth, last.strain_profile, last.stress_profile, 210);
    expect(shapes.strain.map((p) => p.sign).sort()).toEqual([-1, 1]);
    expect(shapes.stress).toHaveLength(2);
    expect(shapes.hardened).toHaveLength(2);
    expect(shapes.hardened[0].line.x).toBeCloseTo(L.sx + shapes.hardened[0].sign * 210 * L.su);
    expect(shapes.hardened[0].path).toMatch(/^M.*Z$/);
  });

  it("draws nothing at zero strain and no hatching at first yield", () => {
    const L = stageLayout(section(100, 200), 15, last.stress, 210);
    const zero = frames[0];
    expect(frameShapes(L, zero.depth, zero.strain_profile, zero.stress_profile, 210).strain).toEqual([]);
    const y = frames.find((f) => f.marks.includes("first_yield"))!;
    expect(frameShapes(L, y.depth, y.strain_profile, y.stress_profile, 210).hardened).toEqual([]);
  });
});
