import { describe, expect, it } from "vitest";
import {
  asksForAxis,
  bendingRequest,
  defaultBendingForm,
  missingBendingItems,
  withBendingStress,
  type BendingFormState,
} from "./bending";
import { defaultDeformationForm, withSectionType, type DeformationFormState } from "./geometry";
import { countByGroup } from "./inputs";
import { defaultTensionForm } from "./tension";

const material = { designation: "1.4301", elastic_modulus: 200000 };

/** A rolled I-section with every shared input given and the compression k_σ typed (4.0 and 0.43). */
const i: DeformationFormState = {
  ...withSectionType(defaultDeformationForm, "I-section"),
  fabrication: "rolled",
  h: 200,
  b: 100,
  tw: 5.6,
  tf: 8.5,
  r: 12,
  kSigma: { web: 4.0, flange: 0.43, stem: null, leg: null },
  poissonRatio: 0.3,
  omega: 15,
};
const section = { ...defaultTensionForm, area: 2848, gammaM0: 1.1 };
const full: BendingFormState = {
  ...defaultBendingForm,
  axis: "major",
  wEl: 194300,
  wPl: 220600,
  lambdaLT: 0.15,
  kSigma: { web: 23.9, flange: 0.43, stem: null, leg: null },
};
const fields = (items: { field: string }[]) => items.map((item) => item.field);

describe("nothing in the Bending group is pre-filled", () => {
  it("everything starts empty, and the bending k_σ are separate from the compression ones", () => {
    expect(defaultBendingForm).toEqual({
      axis: null,
      wEl: null,
      wPl: null,
      lambdaLT: null,
      kSigma: { web: null, flange: null, stem: null, leg: null },
      plateKSigma: {},
      sigmaCr: null,
    });
    expect(Object.keys(defaultBendingForm)).not.toContain("alpha"); // α is Table B.2, looked up by the engine
  });

  it("a circular hollow section is asked no axis", () => {
    expect(asksForAxis("circular hollow section")).toBe(false);
    expect(asksForAxis(null)).toBe(false);
    for (const type of ["I-section", "channel", "T-section", "angle", "rectangular hollow section"] as const) {
      expect(asksForAxis(type)).toBe(true);
    }
  });
});

describe("what the Bending tab waits for", () => {
  it("with the shared inputs given: the axis, W_el, W_pl, λ_LT and one bending k_σ per plate role", () => {
    const items = missingBendingItems("I-section", i, defaultBendingForm, section);
    expect(fields(items)).toEqual(["axis", "wEl", "wPl", "lambdaLT", "kSigmaB-web", "kSigmaB-flange"]);
    expect(items.every((item) => item.group === "bending")).toBe(true);
    expect(items.map((item) => item.label)).toContain("k_σ of the web in bending");
  });

  it("does not ask for the compression k_σ, nor for the area A", () => {
    const noCompression = { ...i, kSigma: { web: null, flange: null, stem: null, leg: null } };
    const items = missingBendingItems("I-section", noCompression, full, section);
    expect(items).toEqual([]);
    const noArea = missingBendingItems("I-section", i, full, { ...section, area: null });
    expect(noArea).toEqual([]);
  });

  it("asks for γM0 (in the Section group) and for the shared B.5 inputs, in their own groups", () => {
    const items = missingBendingItems("I-section", { ...i, omega: null, h: null }, full, defaultTensionForm);
    expect(items.find((item) => item.field === "gammaM0")?.group).toBe("section");
    expect(items.find((item) => item.field === "omega")?.group).toBe("deformation");
    expect(items.find((item) => item.field === "h")?.group).toBe("section");
    expect(fields(items)).not.toContain("area");
  });

  it("waits for the section type first, and asks for W_el, W_pl and λ_LT meanwhile", () => {
    const items = missingBendingItems(null, defaultDeformationForm, defaultBendingForm, section);
    expect(items[0]).toEqual({ label: "the section type", group: "section", field: "sectionType" });
    expect(fields(items)).toEqual(expect.arrayContaining(["wEl", "wPl", "lambdaLT"]));
    expect(fields(items)).not.toContain("axis");
  });

  it("a circular hollow section needs no axis and no k_σ", () => {
    const chs: DeformationFormState = {
      ...withSectionType(defaultDeformationForm, "circular hollow section"),
      d: 100,
      t: 3,
      poissonRatio: 0.3,
      omega: 15,
    };
    const bare = { ...defaultBendingForm, wEl: 33762, wPl: 45167, lambdaLT: 0.1 };
    expect(missingBendingItems("circular hollow section", chs, bare, section)).toEqual([]);
  });

  it("the plates entered one by one each get their own bending k_σ field", () => {
    const manual: DeformationFormState = {
      ...i,
      kind: "plates",
      plates: [
        { id: 1, label: "web", width: 159, thickness: 5.6, kSigma: 4 },
        { id: 2, label: "flange", width: 35.2, thickness: 8.5, kSigma: 0.43 },
      ],
    };
    const items = missingBendingItems("I-section", manual, { ...full, plateKSigma: { 1: 23.9 } }, section);
    expect(fields(items)).toEqual(["plate-2-kSigmaB"]);
    expect(items[0].label).toBe("k_σ of flange in bending");
  });

  it("a typed critical stress is asked again for bending", () => {
    const typed: DeformationFormState = { ...i, kind: "sigma_cr", sigmaCr: 500 };
    const items = missingBendingItems("I-section", typed, { ...full, sigmaCr: null }, section);
    expect(fields(items)).toEqual(["sigmaCrBending"]);
  });

  it("feeds a Bending count in the dock (the group counts what is empty)", () => {
    const counts = countByGroup(missingBendingItems("I-section", i, defaultBendingForm, section));
    expect(counts.bending).toBe(6);
  });
});

describe("the bending request", () => {
  it("is null while anything is missing", () => {
    expect(bendingRequest(material, "I-section", i, defaultBendingForm, section)).toBeNull();
    expect(bendingRequest(material, null, i, full, section)).toBeNull();
    expect(bendingRequest(material, "I-section", i, { ...full, lambdaLT: null }, section)).toBeNull();
    expect(bendingRequest(material, "I-section", i, full, { ...section, gammaM0: null })).toBeNull();
  });

  it("carries the bending k_σ in the geometry, never the compression ones", () => {
    const request = bendingRequest(material, "I-section", i, full, section);
    expect(request).toMatchObject({
      section_type: "I-section",
      axis: "major",
      w_el: 194300,
      w_pl: 220600,
      gamma_m0: 1.1,
      lambda_lt: 0.15,
      omega: 15,
      poisson_ratio: 0.3,
    });
    expect(request?.geometry.kind).toBe("template");
    expect(request?.geometry.k_sigma).toMatchObject({ web: 23.9, flange: 0.43 });
    expect(request?.geometry.k_sigma?.web).not.toBe(4.0);
    expect(request).not.toHaveProperty("area");
  });

  it("sends the bending k_σ of each manual plate and a null axis for a tube", () => {
    const manual: DeformationFormState = {
      ...i,
      kind: "plates",
      plates: [{ id: 7, label: "web", width: 159, thickness: 5.6, kSigma: 4 }],
    };
    const request = bendingRequest(material, "I-section", manual, { ...full, plateKSigma: { 7: 23.9 } }, section);
    expect(request?.geometry.plates).toEqual([{ label: "web", width: 159, thickness: 5.6, k_sigma: 23.9 }]);

    const chs: DeformationFormState = {
      ...withSectionType(defaultDeformationForm, "circular hollow section"),
      d: 100,
      t: 3,
      poissonRatio: 0.3,
      omega: 15,
    };
    const tube = bendingRequest(material, "circular hollow section", chs, { ...full, axis: "minor" }, section);
    expect(tube?.axis).toBeNull();
  });

  it("swaps only the stress pattern: withBendingStress keeps the section and the shared inputs", () => {
    const swapped = withBendingStress(i, full);
    expect(swapped.kSigma).toEqual(full.kSigma);
    expect(swapped.h).toBe(200);
    expect(swapped.omega).toBe(15);
    expect(i.kSigma.web).toBe(4.0); // the compression form is untouched
  });
});
