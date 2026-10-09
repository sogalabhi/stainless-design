import { describe, expect, it } from "vitest";
import { defaultDeformationForm, withSectionType } from "./geometry";
import { sceneSection } from "./comparison";
import {
  EMPTY_DIMS,
  dimensionFields,
  drawable,
  feasibility,
  needsFabrication,
  plateRoles,
} from "./sectionTemplates";
import { templateLayout } from "./templateScene";

describe("the field and plate lists (static text and keys, no maths)", () => {
  it("only I-sections, channels and T-sections have a fabrication", () => {
    expect(needsFabrication("I-section")).toBe(true);
    expect(needsFabrication("channel")).toBe(true);
    expect(needsFabrication("T-section")).toBe(true);
    expect(needsFabrication("angle")).toBe(false);
    expect(needsFabrication("rectangular hollow section")).toBe(false);
    expect(needsFabrication("circular hollow section")).toBe(false);
    expect(needsFabrication(null)).toBe(false);
  });

  it("lists the dimensions of each shape, r when rolled and s when welded", () => {
    const keys = (type: Parameters<typeof dimensionFields>[0], fab: Parameters<typeof dimensionFields>[1] = null) =>
      dimensionFields(type, fab).map((field) => field.key);
    expect(keys("I-section", "rolled")).toEqual(["h", "b", "tw", "tf", "r"]);
    expect(keys("I-section", "welded")).toEqual(["h", "b", "tw", "tf", "s"]);
    expect(keys("channel", "rolled")).toEqual(["h", "b", "tw", "tf", "r"]);
    expect(keys("T-section", "welded")).toEqual(["h", "b", "tw", "tf", "s", "cStem"]);
    expect(keys("angle")).toEqual(["h", "b", "t"]);
    expect(keys("rectangular hollow section")).toEqual(["h", "b", "t"]);
    expect(keys("circular hollow section")).toEqual(["d", "t"]);
    expect(keys(null)).toEqual([]);
  });

  it("every dimension field is in millimetres", () => {
    for (const field of dimensionFields("T-section", "rolled")) {
      expect(field.unit).toBe("mm");
    }
  });

  it("lists the plates of each shape: internal or outstand, and the c rule as text", () => {
    const roles = (type: Parameters<typeof plateRoles>[0], fab: Parameters<typeof plateRoles>[1] = null) =>
      plateRoles(type, fab).map((plate) => `${plate.role}:${plate.kind}`);
    expect(roles("I-section", "rolled")).toEqual(["web:internal", "flange:outstand"]);
    expect(roles("channel", "welded")).toEqual(["web:internal", "flange:outstand"]);
    expect(roles("T-section", "rolled")).toEqual(["flange:outstand", "stem:outstand"]);
    expect(roles("angle")).toEqual(["leg:outstand"]);
    expect(roles("rectangular hollow section")).toEqual(["web:internal", "flange:internal"]);
    expect(roles("circular hollow section")).toEqual([]);
    expect(plateRoles("I-section", "rolled")[0].formula).toBe("c = h − 2t_f − 2r");
    expect(plateRoles("I-section", "welded")[0].formula).toBe("c = h − 2t_f − 2s");
    expect(plateRoles("rectangular hollow section", null)[0].formula).toContain("3t");
  });
});

describe("drawing feasibility (the engine repeats it and is the authority)", () => {
  const i = { ...EMPTY_DIMS, h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 };

  it("is incomplete until every dimension, and the fabrication, is given", () => {
    expect(feasibility("I-section", "rolled", { ...i, r: null })).toEqual({ complete: false, message: null });
    expect(feasibility("I-section", null, i).complete).toBe(false);
    expect(feasibility(null, null, i).complete).toBe(false);
    expect(drawable(feasibility("I-section", "rolled", i))).toBe(true);
  });

  it("names the dimensions involved", () => {
    expect(feasibility("I-section", "rolled", { ...i, tf: 100 }).message).toMatch(/2t_f.*h/);
    expect(feasibility("I-section", "rolled", { ...i, tw: 100 }).message).toMatch(/t_w.*b/);
    expect(feasibility("I-section", "rolled", { ...i, h: 0 }).message).toMatch(/h:.*positive/);
    expect(drawable(feasibility("I-section", "rolled", { ...i, tf: 100 }))).toBe(false);
  });

  it("r and s may be zero, but not negative", () => {
    expect(feasibility("I-section", "rolled", { ...i, r: 0 }).message).toBeNull();
    expect(feasibility("I-section", "rolled", { ...i, r: -1 }).message).toMatch(/r:/);
  });

  it("does not compute c: a flat width that comes out zero is the engine's to refuse", () => {
    // c_w = 200 - 17 - 190 is negative, but only the engine knows that
    expect(feasibility("I-section", "rolled", { ...i, r: 95 }).message).toBeNull();
  });
});

describe("the assembled section for the 3D view", () => {
  const dims = { ...EMPTY_DIMS, h: 200, b: 100, tw: 6, tf: 10, t: 4 };

  it("puts the flanges and the web in place from the typed dimensions", () => {
    const layout = templateLayout("I-section", dims)!;
    expect(layout.width).toBe(100);
    expect(layout.depth).toBe(200);
    expect(layout.plates.map((p) => [p.role, p.along, p.cx, p.cz, p.width, p.thickness])).toEqual([
      ["flange", "x", 0, 95, 100, 10],
      ["flange", "x", 0, -95, 100, 10],
      ["web", "z", 0, 0, 180, 6],
    ]);
  });

  it("assembles every shape, and nothing while a dimension is missing", () => {
    expect(templateLayout("channel", dims)!.plates).toHaveLength(3);
    expect(templateLayout("T-section", dims)!.plates.map((p) => p.role)).toEqual(["flange", "stem"]);
    expect(templateLayout("angle", dims)!.plates.map((p) => p.role)).toEqual(["leg", "leg"]);
    expect(templateLayout("rectangular hollow section", dims)!.plates).toHaveLength(4);
    expect(templateLayout("I-section", { ...dims, tf: null })).toBeNull();
    expect(templateLayout("angle", { ...dims, t: null })).toBeNull();
    expect(templateLayout("circular hollow section", dims)).toBeNull();
  });

  it("the thickness factor multiplies t_w, t_f and t and keeps h and b", () => {
    const form = {
      ...withSectionType(defaultDeformationForm, "I-section"),
      fabrication: "rolled" as const,
      ...dims,
      r: 12,
    };
    const scene = sceneSection(form, 2)!;
    expect(scene.kind).toBe("template");
    if (scene.kind !== "template") return;
    expect(scene.width).toBe(100);
    expect(scene.depth).toBe(200);
    const flange = scene.plates.find((p) => p.role === "flange")!;
    const web = scene.plates.find((p) => p.role === "web")!;
    expect(flange.thickness).toBe(20);
    expect(web.thickness).toBe(12);
    expect(web.width).toBe(200 - 40); // the web is what is left between the thicker flanges
    expect(sceneSection({ ...form, tf: null }, 2)).toBeNull();
  });
});
