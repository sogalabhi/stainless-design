import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultDeformationForm, missingDeformationItems, missingPropertyItems, propertiesRequest, withSectionType } from "./geometry";
import { DEFAULT_LAYERS, loadLayers, saveLayers } from "./layers";
import { propertyFields, propertyOnlyFields, sectionFields } from "./sectionTemplates";

const rolledI = {
  ...withSectionType(defaultDeformationForm, "I-section"),
  fabrication: "rolled" as const,
  h: 200,
  b: 100,
  tw: 5.6,
  tf: 8.5,
  r: 12,
};

describe("what the section properties need", () => {
  it("nothing is asked for before the section type is chosen", () => {
    expect(missingPropertyItems(defaultDeformationForm).map((i) => i.field)).toEqual(["sectionType"]);
    expect(propertiesRequest(defaultDeformationForm)).toBeNull();
  });

  it("an I-section needs its fabrication and dimensions, and nothing about k_σ, ν or Ω", () => {
    const empty = withSectionType(defaultDeformationForm, "I-section");
    expect(missingPropertyItems(empty).map((i) => i.field)).toEqual(["fabrication", "h", "b", "tw", "tf"]);
    expect(propertiesRequest(rolledI)).toEqual({
      shape: "I-section",
      fabrication: "rolled",
      h: 200,
      b: 100,
      t_w: 5.6,
      t_f: 8.5,
      r: 12,
    });
  });

  it("a welded section sends s, not r", () => {
    const welded = { ...rolledI, fabrication: "welded" as const, s: 5 };
    expect(propertiesRequest(welded)).toMatchObject({ fabrication: "welded", s: 5 });
    expect(propertiesRequest(welded)).not.toHaveProperty("r");
  });

  it("a T-section does not need the stem width c_stem", () => {
    const t = { ...withSectionType(defaultDeformationForm, "T-section"), fabrication: "rolled" as const, h: 100, b: 100, tw: 6, tf: 8, r: 10 };
    expect(missingPropertyItems(t)).toEqual([]);
    expect(propertiesRequest(t)).not.toHaveProperty("c_stem");
    // but B.5 does: it is a plate width for B.9
    expect(missingDeformationItems(t).map((i) => i.field)).toContain("cStem");
  });

  it("an RHS needs r_o and an angle needs r, but B.5 needs neither", () => {
    const rhs = { ...withSectionType(defaultDeformationForm, "rectangular hollow section"), h: 100, b: 50, t: 4 };
    expect(missingPropertyItems(rhs).map((i) => i.field)).toEqual(["rO"]);
    expect(missingDeformationItems(rhs).map((i) => i.field)).not.toContain("rO");
    expect(propertiesRequest({ ...rhs, rO: 0 })).toEqual({ shape: "rectangular hollow section", h: 100, b: 50, t: 4, r_o: 0 });

    const angle = { ...withSectionType(defaultDeformationForm, "angle"), h: 100, b: 75, t: 8 };
    expect(missingPropertyItems(angle).map((i) => i.field)).toEqual(["r"]);
    expect(missingDeformationItems(angle).map((i) => i.field)).not.toContain("r");
    expect(propertiesRequest({ ...angle, r: 0 })).toEqual({ shape: "angle", h: 100, b: 75, t: 8, r: 0 });
  });

  it("0 is a given radius, not a missing one", () => {
    const rhs = { ...withSectionType(defaultDeformationForm, "rectangular hollow section"), h: 100, b: 50, t: 4, rO: 0 };
    expect(missingPropertyItems(rhs)).toEqual([]);
  });

  it("a circular hollow section needs d and t", () => {
    const chs = withSectionType(defaultDeformationForm, "circular hollow section");
    expect(missingPropertyItems(chs).map((i) => i.field)).toEqual(["d", "t"]);
    expect(propertiesRequest({ ...chs, d: 100, t: 5 })).toEqual({ shape: "circular hollow section", d: 100, t: 5 });
  });

  it("the routes with no section dimensions have no properties", () => {
    const plates = { ...rolledI, kind: "plates" as const };
    expect(missingPropertyItems(plates).map((i) => i.field)).toEqual(["sectionType"]);
  });

  it("the extra radii are fields of the section, listed after the dimensions", () => {
    expect(propertyOnlyFields("rectangular hollow section").map((f) => f.key)).toEqual(["rO"]);
    expect(propertyOnlyFields("angle").map((f) => f.key)).toEqual(["r"]);
    expect(propertyOnlyFields("I-section")).toEqual([]);
    expect(sectionFields("rectangular hollow section", null).map((f) => f.key)).toEqual(["h", "b", "t", "rO"]);
    expect(propertyFields("T-section", "rolled").map((f) => f.key)).toEqual(["h", "b", "tw", "tf", "r"]);
    for (const field of [...propertyOnlyFields("angle"), ...propertyOnlyFields("rectangular hollow section")]) {
      expect(field.forPropertiesOnly).toBe(true);
      expect(field.hint).toMatch(/0 for/);
    }
  });
});

describe("the remembered layers", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("start as dimensions, flat widths, axes and fillets", () => {
    expect(loadLayers()).toEqual(DEFAULT_LAYERS);
    expect(DEFAULT_LAYERS).toMatchObject({ dimensions: true, flat: true, axes: true, corners: true });
    expect(DEFAULT_LAYERS).toMatchObject({ centroid: false, plastic: false, shear: false, principal: false });
  });

  it("are saved and loaded", () => {
    saveLayers({ ...DEFAULT_LAYERS, centroid: true });
    expect(loadLayers().centroid).toBe(true);
  });

  it("ignore damaged storage", () => {
    window.localStorage.setItem("stainless-csm.geometry-layers", "{not json");
    expect(loadLayers()).toEqual(DEFAULT_LAYERS);
    window.localStorage.setItem("stainless-csm.geometry-layers", JSON.stringify({ centroid: "yes", axes: false }));
    expect(loadLayers()).toEqual({ ...DEFAULT_LAYERS, axes: false });
  });

  it("do not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadLayers()).toEqual(DEFAULT_LAYERS);
    expect(() => saveLayers(DEFAULT_LAYERS)).not.toThrow();
  });
});
