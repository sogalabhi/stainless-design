import type { GradeOut, SectionType } from "../api/types";
import { defaultBendingForm, type BendingFormState } from "./bending";
import { defaultDeformationForm, platesFromLinks, withSectionType, type DeformationFormState } from "./geometry";
import { defaultMaterialForm, selectGrade, type MaterialFormState } from "./material";
import type { TensionFormState } from "./tension";

/**
 * The worked example behind the "Load example" button. Nothing here is a default: every input starts
 * empty, and these values are only used when the user clicks the button. Each one has its source in
 * EXAMPLE_SOURCES, shown in the dock while the example is loaded.
 */
export const EXAMPLE = {
  grade: "1.4301", // f_y, f_u and the family come from Table 5.1 through selectGrade
  elasticModulus: 200000, // N/mm2
  sectionType: "I-section" as SectionType,
  area: 4560, // mm2, the sum of length x thickness of the links below
  gammaM0: 1.1,
  poissonRatio: 0.3,
  omega: 15,
  // Custom geometry, as two tables pasted from Excel: nodes (x, y in mm) and the links between them.
  // An I-section with unequal flanges in the line model: web 280 x 6, top flange 94 x 10 (two outstands
  // of 47), bottom flange 194 x 10 (two outstands of 97). The length of a link is its flat width b̄.
  nodes: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 280 },
    { id: 3, x: -47, y: 280 },
    { id: 4, x: 47, y: 280 },
    { id: 5, x: -97, y: 0 },
    { id: 6, x: 97, y: 0 },
  ],
  // k_sigma is for uniform compression: 0.43 for an outstand, 4.0 for an internal web (EN 1993-1-5).
  links: [
    { label: "web", from: 1, to: 2, thickness: 6, kSigma: 4.0 },
    { label: "top flange outstand, left", from: 2, to: 3, thickness: 10, kSigma: 0.43 },
    { label: "top flange outstand, right", from: 2, to: 4, thickness: 10, kSigma: 0.43 },
    { label: "bottom flange outstand, left", from: 1, to: 5, thickness: 10, kSigma: 0.43 },
    { label: "bottom flange outstand, right", from: 1, to: 6, thickness: 10, kSigma: 0.43 },
  ],
  // bending about the major axis (the Bending group), top flange in compression
  bending: {
    axis: "major" as const,
    wEl: 369942, // mm3, W_el,y = I_y / 170.7 mm (the top fibre is the furthest from the centroid, 109.3 mm above the bottom)
    wPl: 479133, // mm3, W_pl,y with the plastic neutral axis 56.7 mm above the bottom
    lambdaLT: 0.15,
    plateKSigma: [15.85, 0.43, 0.43, 0.43, 0.43], // same order as the links; the web has psi = -0.640
  },
};

/** Where each example value comes from, as shown to the user. */
export const EXAMPLE_SOURCES: string[] = [
  "E = 200 000 N/mm² and ν = 0.3: EN 1993-1-4, 5.1.5",
  "γM0 = 1.10: EN 1993-1-4, 8.1 NOTE (a National Annex may give another value)",
  "Grade 1.4301 (f_y, f_u, family): EN 1993-1-4, Table 5.1",
  "Ω = 15: EN 1993-1-4, 7.4.3.5(3) NOTE (15 unless the National Annex gives a different value)",
  "k_σ = 4.0 (internal web) and 0.43 (outstand flange): EN 1993-1-5, uniform compression; outside EN 1993-1-4, example only",
  "Bending: the major axis y-y is a choice (Table B.2 then gives α). W_el,y = 369 942 mm³ (the smaller of the two, at the top fibre) and W_pl,y = 479 133 mm³ are computed from the nodes and links with the top flange in compression. Example only.",
  "λ_LT = 0.15: example only. Member design (8.3) is outside Annex B",
  "k_σ for bending: 0.43 for each flange outstand and 15.85 for the web, which has ψ = −0.640 (EN 1993-1-5, Table 4.1: 7.81 − 6.29ψ + 9.78ψ²); outside EN 1993-1-4, example only",
  "Section: a custom I-section with unequal flanges, entered as 6 nodes and 5 links in the two tables (web 280 × 6, top flange outstands 47 × 10, bottom flange outstands 97 × 10). The length of each link is its flat width b̄; A = 4560 mm² is Σ b̄·t. Example only.",
];

export type ExampleState = {
  materialForm: MaterialFormState;
  sectionType: SectionType;
  tensionForm: TensionFormState;
  deformationForm: DeformationFormState;
  bendingForm: BendingFormState;
};

/** Every input of the example. The grade goes through selectGrade, exactly as the grade dropdown does. */
export function exampleState(grades: GradeOut[]): ExampleState {
  const materialForm: MaterialFormState = {
    ...selectGrade(grades, EXAMPLE.grade, defaultMaterialForm),
    elasticModulus: EXAMPLE.elasticModulus,
  };
  const deformationForm: DeformationFormState = withSectionType(
    {
      ...defaultDeformationForm,
      custom: true,
      nodes: EXAMPLE.nodes.map((node, index) => ({ uid: index + 1, ...node })),
      links: EXAMPLE.links.map((link, index) => ({ uid: index + 1, ...link })),
      plates: platesFromLinks(
        EXAMPLE.nodes.map((node, index) => ({ uid: index + 1, ...node })),
        EXAMPLE.links.map((link, index) => ({ uid: index + 1, ...link })),
      ),
      poissonRatio: EXAMPLE.poissonRatio,
      omega: EXAMPLE.omega,
    },
    EXAMPLE.sectionType,
  );
  return {
    materialForm,
    sectionType: EXAMPLE.sectionType,
    tensionForm: { area: EXAMPLE.area, hasHoles: false, gammaM0: EXAMPLE.gammaM0 },
    deformationForm,
    bendingForm: {
      ...defaultBendingForm,
      axis: EXAMPLE.bending.axis,
      wEl: EXAMPLE.bending.wEl,
      wPl: EXAMPLE.bending.wPl,
      lambdaLT: EXAMPLE.bending.lambdaLT,
      plateKSigma: Object.fromEntries(EXAMPLE.bending.plateKSigma.map((value, index) => [index + 1, value])),
    },
  };
}
