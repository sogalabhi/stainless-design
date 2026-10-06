import type { GradeOut, MaterialInput, StainlessFamily } from "../api/types";

export const CUSTOM = "custom";

/** Every number starts empty. Table 5.1 only fills f_y, f_u and the family when a grade is picked. */
export type MaterialFormState = {
  designation: string; // a Table 5.1 designation, or CUSTOM
  family: StainlessFamily | null;
  fy: number | null;
  fu: number | null;
  elasticModulus: number | null;
  enhanced: boolean;
};

export const defaultMaterialForm: MaterialFormState = {
  designation: CUSTOM,
  family: null,
  fy: null,
  fu: null,
  elasticModulus: null,
  enhanced: false,
};

/** What the user still has to give before the material can be calculated. */
export function missingMaterial(form: MaterialFormState): string[] {
  const missing: string[] = [];
  if (form.fy === null) missing.push("f_y");
  if (form.fu === null) missing.push("f_u");
  if (form.elasticModulus === null) missing.push("E");
  if (form.family === null) missing.push("the family");
  return missing;
}

export function materialInput(form: MaterialFormState): MaterialInput | null {
  if (form.elasticModulus === null) return null;
  if (form.designation !== CUSTOM) {
    return { designation: form.designation, elastic_modulus: form.elasticModulus };
  }
  if (form.family === null || form.fy === null || form.fu === null) return null;
  return {
    family: form.family,
    fy: form.fy,
    fu: form.fu,
    elastic_modulus: form.elasticModulus,
    enhanced: form.enhanced,
  };
}

// Several Table 5.1 grades share the same f_y and f_u (they behave identically in CSM).
// When typed values match more than one, show the most common one.
const PREFERRED = ["1.4307", "1.4404", "1.4462", "1.4003"];

function choose(candidates: GradeOut[], current: string, preferred?: (grade: GradeOut) => boolean) {
  const keep = candidates.find((grade) => grade.designation === current);
  if (keep) return keep;
  const narrowed = preferred ? candidates.filter(preferred) : [];
  const pool = narrowed.length > 0 ? narrowed : candidates;
  for (const designation of PREFERRED) {
    const match = pool.find((grade) => grade.designation === designation);
    if (match) return match;
  }
  return pool[0];
}

function fromGrade(grade: GradeOut, form: MaterialFormState): MaterialFormState {
  return { ...form, designation: grade.designation, family: grade.family, fy: grade.fy, fu: grade.fu };
}

/** Pick a grade: its f_y, f_u and family fill in. Picking Custom keeps the current numbers. */
export function selectGrade(grades: GradeOut[], designation: string, form: MaterialFormState) {
  const grade = grades.find((item) => item.designation === designation);
  return grade ? fromGrade(grade, form) : { ...form, designation: CUSTOM };
}

/** Type f_y: if Table 5.1 has a grade with that f_y, the grade and f_u follow; else Custom. */
export function withFy(
  grades: GradeOut[],
  fy: number | null,
  form: MaterialFormState,
): MaterialFormState {
  const candidates = fy === null ? [] : grades.filter((grade) => grade.fy === fy);
  if (candidates.length === 0) return { ...form, designation: CUSTOM, fy };
  return fromGrade(choose(candidates, form.designation, (g) => g.fu === form.fu), form);
}

/** Type f_u: the same, the other way round. */
export function withFu(
  grades: GradeOut[],
  fu: number | null,
  form: MaterialFormState,
): MaterialFormState {
  const candidates = fu === null ? [] : grades.filter((grade) => grade.fu === fu);
  if (candidates.length === 0) return { ...form, designation: CUSTOM, fu };
  return fromGrade(choose(candidates, form.designation, (g) => g.fy === form.fy), form);
}

/** Other grades with exactly the same f_y, f_u and family as the chosen one. */
export function equivalentGrades(grades: GradeOut[], form: MaterialFormState): string[] {
  if (form.designation === CUSTOM) return [];
  return grades
    .filter(
      (grade) =>
        grade.designation !== form.designation &&
        grade.fy === form.fy &&
        grade.fu === form.fu &&
        grade.family === form.family,
    )
    .map((grade) => grade.designation);
}
