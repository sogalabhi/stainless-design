import type { DeformationRequest, FamilyKey, GeometryInput, GeometryKindKey } from "../api/types";

export type PlateRow = {
  id: number;
  label: string;
  width: number | null;
  thickness: number | null;
  kSigma: number | null;
};

/** Every number starts empty: nothing is assumed. */
export type DeformationFormState = {
  kind: GeometryKindKey;
  d: number | null; // circular hollow section
  t: number | null;
  plates: PlateRow[];
  sigmaCr: number | null;
  family: FamilyKey | null;
  poissonRatio: number | null;
  omega: number | null;
};

export const defaultDeformationForm: DeformationFormState = {
  kind: "chs",
  d: null,
  t: null,
  plates: [{ id: 1, label: "plate 1", width: null, thickness: null, kSigma: null }],
  sigmaCr: null,
  family: null,
  poissonRatio: null,
  omega: null,
};

export const GEOMETRY_KINDS: { value: GeometryKindKey; label: string }[] = [
  { value: "chs", label: "Circular hollow section" },
  { value: "plates", label: "Flat plates (enter each plate)" },
  { value: "sigma_cr", label: "Critical stress (numerical value)" },
];

/** What the user still has to give before B.5 can be calculated. */
export function missingDeformation(form: DeformationFormState): string[] {
  const missing: string[] = [];
  if (form.omega === null) missing.push("Ω");
  if (form.kind === "chs") {
    if (form.d === null) missing.push("the diameter d");
    if (form.t === null) missing.push("the thickness t");
  }
  if (form.kind !== "sigma_cr" && form.poissonRatio === null) missing.push("ν");
  if (form.kind === "plates") {
    form.plates.forEach((row) => {
      const gaps = [
        row.width === null ? "b̄" : null,
        row.thickness === null ? "t" : null,
        row.kSigma === null ? "k_σ" : null,
      ].filter((gap) => gap !== null);
      if (gaps.length > 0) missing.push(`${gaps.join(", ")} of ${row.label || "the plate"}`);
    });
  }
  if (form.kind === "sigma_cr") {
    if (form.sigmaCr === null) missing.push("σ_cr,cs");
    if (form.family === null) missing.push("the section family");
  }
  return missing;
}

function geometryInput(form: DeformationFormState): GeometryInput {
  switch (form.kind) {
    case "chs":
      return { kind: "chs", d: form.d, t: form.t };
    case "plates":
      return {
        kind: "plates",
        plates: form.plates.map((row) => ({
          label: row.label,
          width: row.width ?? 0,
          thickness: row.thickness ?? 0,
          k_sigma: row.kSigma ?? 0,
        })),
      };
    case "sigma_cr":
      return { kind: "sigma_cr", sigma_cr_cs: form.sigmaCr, family: form.family };
  }
}

/** The API request, or null while something is still missing. */
export function deformationRequest(
  material: DeformationRequest["material"],
  form: DeformationFormState,
): DeformationRequest | null {
  if (missingDeformation(form).length > 0) return null;
  return {
    material,
    geometry: geometryInput(form),
    omega: form.omega ?? 0,
    poisson_ratio: form.poissonRatio,
  };
}
