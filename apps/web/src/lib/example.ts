import type { GradeOut, SectionType } from "../api/types";
import { defaultBendingForm, type BendingFormState } from "./bending";
import { defaultDeformationForm, withSectionType, type DeformationFormState } from "./geometry";
import { defaultMaterialForm, selectGrade, type MaterialFormState } from "./material";
import type { Fabrication } from "./sectionTemplates";
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
  area: 2848, // mm2
  gammaM0: 1.1,
  poissonRatio: 0.3,
  omega: 15,
  fabrication: "rolled" as Fabrication,
  // the typed section dimensions (mm); the engine derives c of each plate from them (8.2.2(5))
  dimensions: { h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12 },
  kSigma: { web: 4.0, flange: 0.43 },
  // bending about the major axis (the Bending group)
  bending: {
    axis: "major" as const,
    wEl: 194300, // mm3, W_el,y of the section
    wPl: 220600, // mm3, W_pl,y
    lambdaLT: 0.15,
    kSigma: { web: 23.9, flange: 0.43 },
  },
};

/** Where each example value comes from, as shown to the user. */
export const EXAMPLE_SOURCES: string[] = [
  "E = 200 000 N/mm² and ν = 0.3: EN 1993-1-4, 5.1.5",
  "γM0 = 1.10: EN 1993-1-4, 8.1 NOTE (a National Annex may give another value)",
  "Grade 1.4301 (f_y, f_u, family): EN 1993-1-4, Table 5.1",
  "Ω = 15: example only. 7.4.3.5 calls Ω project specific and gives no value",
  "k_σ = 4.0 (internal web) and 0.43 (outstand flange): EN 1993-1-5, uniform compression; outside EN 1993-1-4, example only",
  "Bending: the major axis y-y is a choice (Table B.2 then gives α). W_el,y = 194 300 mm³ and W_pl,y = 220 600 mm³ are the published section-table values of the example I-section; they match the geometry window within 0.5 %. Example only.",
  "λ_LT = 0.15: example only. Member design (8.3) is outside Annex B",
  "k_σ for bending: 23.9 (internal web in pure bending) and 0.43 (flange outstand): EN 1993-1-5; outside EN 1993-1-4, example only",
  "Section: an example rolled I-section, h 200, b 100, t_w 5.6, t_f 8.5, r 12, typed into the Section group; the engine derives the flat widths c from them (web 159, flange outstand 35.2) as 8.2.2(5) draws them. A = 2848 mm² is its area with the fillets. Example only.",
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
      fabrication: EXAMPLE.fabrication,
      ...EXAMPLE.dimensions,
      kSigma: { web: EXAMPLE.kSigma.web, flange: EXAMPLE.kSigma.flange, stem: null, leg: null },
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
      kSigma: { web: EXAMPLE.bending.kSigma.web, flange: EXAMPLE.bending.kSigma.flange, stem: null, leg: null },
    },
  };
}
