import { describe, expect, it } from "vitest";
import { defaultDeformationForm, type DeformationFormState } from "./geometry";
import { flatWidths, plateByLabel, scaledDims, stageSection } from "./stageSection";

const rolledI: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "template",
  shape: "I-section",
  fabrication: "rolled",
  h: 200,
  b: 100,
  tw: 5.6,
  tf: 8.5,
  r: 12,
};
const rhs: DeformationFormState = { ...defaultDeformationForm, kind: "template", shape: "rectangular hollow section", h: 150, b: 100, t: 5 };
const tube: DeformationFormState = { ...defaultDeformationForm, kind: "chs", shape: "circular hollow section", d: 100, t: 3 };

describe("the section the stage draws", () => {
  it("is the typed outline, upright for compression, tension and major-axis bending", () => {
    const s = stageSection(rolledI, "compression", null)!;
    expect([s.width, s.height, s.turned]).toEqual([100, 200, false]);
    expect(stageSection(rolledI, "bending", "major")!.turned).toBe(false);
  });

  it("is turned a quarter for minor-axis bending, so the depth runs up the page", () => {
    const s = stageSection(rolledI, "bending", "minor")!;
    expect([s.width, s.height, s.turned]).toEqual([200, 100, true]);
    const r = stageSection(rhs, "bending", "minor")!;
    expect([r.width, r.height]).toEqual([150, 100]);
  });

  it("a tube is never turned and is as high as it is wide", () => {
    const s = stageSection(tube, "bending", "minor")!;
    expect([s.width, s.height, s.turned]).toEqual([100, 100, false]);
  });

  it("has no section when no dimensions were given", () => {
    expect(stageSection({ ...defaultDeformationForm, kind: "plates" }, "compression", null)).toBeNull();
    expect(stageSection({ ...defaultDeformationForm, kind: "sigma_cr" }, "compression", null)).toBeNull();
    expect(stageSection({ ...rolledI, tw: null }, "compression", null)).toBeNull();
  });

  it("scales only the thicknesses for the what-if", () => {
    const s = stageSection(rolledI, "compression", null, 0.5)!;
    expect([s.dims.h, s.dims.b, s.dims.tw, s.dims.tf, s.dims.r]).toEqual([200, 100, 2.8, 4.25, 12]);
    expect(scaledDims(rolledI as never, 2).t).toBeNull();
  });

  it("reads flat widths and governing plates from the engine's plate list", () => {
    const plates = [
      { label: "web", width: 159, role: "web", governing: true },
      { label: "flange", width: 35.2, role: "flange", governing: false },
    ] as never;
    expect(flatWidths(plates)).toEqual({ web: 159, flange: 35.2 });
    expect(plateByLabel(plates, "flange")?.role).toBe("flange");
    expect(plateByLabel(plates, null)).toBeNull();
  });
});
