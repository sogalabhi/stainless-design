import { describe, expect, it } from "vitest";
import { defaultDeformationForm, deformationRequest, missingDeformationItems, withSectionType } from "./geometry";
import { countByGroup, uniqueItems } from "./inputs";
import { defaultMaterialForm, missingMaterialItems } from "./material";
import { defaultTensionForm, missingTensionItems } from "./tension";

describe("nothing is pre-filled", () => {
  it("every required material field is missing at the start, each in the Material group", () => {
    const items = missingMaterialItems(defaultMaterialForm);
    expect(items.map((item) => item.field)).toEqual(["fy", "fu", "E", "family"]);
    expect(items.every((item) => item.group === "material")).toBe(true);
  });

  it("tension asks for A and γM0 in the Section group, and does not ask for a section type", () => {
    const items = missingTensionItems(defaultTensionForm);
    expect(items.map((item) => item.field)).toEqual(["area", "gammaM0"]);
    expect(items.every((item) => item.group === "section")).toBe(true);
  });

  it("deformation has no route until the section type is chosen", () => {
    expect(defaultDeformationForm.kind).toBeNull();
    const items = missingDeformationItems(defaultDeformationForm);
    expect(items[0]).toEqual({ label: "the section type", group: "section", field: "sectionType" });
  });
});

describe("the section type picks the B.5 route", () => {
  it("a circular hollow section uses the tube formulas (B.10, B.11), with d and t in the Section group", () => {
    const form = withSectionType(defaultDeformationForm, "circular hollow section");
    expect(form.kind).toBe("chs");
    expect(form.family).toBe("circular_hollow");
    const items = missingDeformationItems(form);
    expect(items.map((item) => item.field)).toEqual(["d", "t", "omega", "nu"]);
    expect(items.filter((item) => item.group === "section").map((item) => item.field)).toEqual(["d", "t"]);
  });

  it.each(["I-section", "channel", "T-section", "angle", "rectangular hollow section"] as const)(
    "%s is a section template (8.2.2(5)), flat widths derived by the engine",
    (type) => {
      const form = withSectionType(defaultDeformationForm, type);
      expect(form.kind).toBe("template");
      expect(form.shape).toBe(type);
      expect(form.family).toBe("flat_plates");
    },
  );

  it("the plates entered one by one stay chosen when the section type changes", () => {
    const manual = { ...withSectionType(defaultDeformationForm, "I-section"), kind: "plates" as const };
    expect(withSectionType(manual, "channel").kind).toBe("plates");
    expect(withSectionType(manual, "circular hollow section").kind).toBe("chs");
  });

  it("each empty plate field of the manual route links to its own input", () => {
    const form = { ...withSectionType(defaultDeformationForm, "I-section"), kind: "plates" as const };
    const fields = missingDeformationItems(form).map((item) => item.field);
    expect(fields).toContain("plate-1-width");
  });

  it("a typed critical stress stays typed when the section type changes, with the family from the type", () => {
    const typed = { ...defaultDeformationForm, kind: "sigma_cr" as const, sigmaCr: 500 };
    const form = withSectionType(typed, "circular hollow section");
    expect(form.kind).toBe("sigma_cr");
    expect(form.family).toBe("circular_hollow");
  });

  it("a typed critical stress without a section type is still waiting for the type", () => {
    const typed = { ...defaultDeformationForm, kind: "sigma_cr" as const, sigmaCr: 500, omega: 15 };
    expect(missingDeformationItems(typed).map((item) => item.field)).toEqual(["sectionType"]);
  });
});

describe("the section template asks for every dimension, in the Section group", () => {
  const fieldsOf = (form: Parameters<typeof missingDeformationItems>[0], group: string) =>
    missingDeformationItems(form)
      .filter((item) => item.group === group)
      .map((item) => item.field);

  it("an I-section needs rolled or welded, h, b, t_w, t_f, and r (rolled) or s (welded)", () => {
    const form = withSectionType(defaultDeformationForm, "I-section");
    expect(fieldsOf(form, "section")).toEqual(["fabrication", "h", "b", "tw", "tf"]);
    const rolled = { ...form, fabrication: "rolled" as const };
    expect(fieldsOf(rolled, "section")).toEqual(["h", "b", "tw", "tf", "r"]);
    expect(fieldsOf({ ...form, fabrication: "welded" as const }, "section")).toEqual(["h", "b", "tw", "tf", "s"]);
  });

  it("each shape asks for its own dimensions", () => {
    const need = (type: Parameters<typeof withSectionType>[1], patch = {}) =>
      fieldsOf({ ...withSectionType(defaultDeformationForm, type), ...patch }, "section");
    expect(need("channel", { fabrication: "rolled" })).toEqual(["h", "b", "tw", "tf", "r"]);
    expect(need("T-section", { fabrication: "rolled" })).toEqual(["h", "b", "tw", "tf", "r", "cStem"]);
    expect(need("angle")).toEqual(["h", "b", "t"]);
    expect(need("rectangular hollow section")).toEqual(["h", "b", "t"]);
  });

  it("asks for one k_σ per plate role of the shape, in the Deformation group, with an own link", () => {
    const fk = (type: Parameters<typeof withSectionType>[1], patch = {}) =>
      fieldsOf({ ...withSectionType(defaultDeformationForm, type), ...patch }, "deformation");
    expect(fk("I-section", { fabrication: "rolled" })).toEqual(["omega", "nu", "kSigma-web", "kSigma-flange"]);
    expect(fk("T-section", { fabrication: "welded" })).toEqual(["omega", "nu", "kSigma-flange", "kSigma-stem"]);
    expect(fk("angle")).toEqual(["omega", "nu", "kSigma-leg"]);
    expect(fk("rectangular hollow section")).toEqual(["omega", "nu", "kSigma-web", "kSigma-flange"]);
  });

  it("sends nothing until everything is given, then the dimensions the shape uses and one k_σ per role", () => {
    const material = { designation: "1.4307", elastic_modulus: 200000 };
    const form = {
      ...withSectionType(defaultDeformationForm, "I-section"),
      fabrication: "rolled" as const,
      h: 200,
      b: 100,
      tw: 5.6,
      tf: 8.5,
      r: 12,
      s: 99, // typed earlier, then rolled was chosen: s must not be sent
      kSigma: { web: 4, flange: 0.43, stem: null, leg: null },
      poissonRatio: 0.3,
      omega: 15,
    };
    expect(deformationRequest(material, { ...form, tf: null })).toBeNull();
    expect(deformationRequest(material, form)).toEqual({
      material,
      geometry: {
        kind: "template",
        shape: "I-section",
        fabrication: "rolled",
        h: 200,
        b: 100,
        t_w: 5.6,
        t_f: 8.5,
        r: 12,
        k_sigma: { web: 4, flange: 0.43 },
      },
      omega: 15,
      poisson_ratio: 0.3,
    });
  });
});

describe("dock bookkeeping", () => {
  it("counts the empty fields per group", () => {
    const items = [
      ...missingMaterialItems(defaultMaterialForm),
      ...missingTensionItems(defaultTensionForm),
      ...missingDeformationItems(defaultDeformationForm),
    ];
    const counts = countByGroup(uniqueItems(items));
    expect(counts.material).toBe(4);
    expect(counts.section).toBe(3); // A, γM0 and the section type, the type asked for once
    expect(counts.deformation).toBe(2); // Ω and ν
  });

  it("lists an input once even when two tabs both wait for it", () => {
    const item = { label: "γM0", group: "section" as const, field: "gammaM0" };
    expect(uniqueItems([item, item])).toEqual([item]);
  });
});
