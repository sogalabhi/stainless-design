import type {
  DeformationRequest,
  FamilyKey,
  GeometryInput,
  GeometryKindKey,
  SectionPropertiesRequest,
  SectionType,
} from "../api/types";
import type { MissingItem } from "./inputs";
import {
  dimensionFields,
  needsFabrication,
  plateRoles,
  propertyFields,
  type Fabrication,
  type PlateRoleKey,
  type SketchDims,
} from "./sectionTemplates";

export type PlateRow = {
  id: number;
  label: string;
  width: number | null;
  thickness: number | null;
  kSigma: number | null;
};

/** Every number starts empty: nothing is assumed. */
export type DeformationFormState = {
  kind: GeometryKindKey | null; // null until the section type is chosen: the type sets the route
  shape: SectionType | null; // the section type, which the template route sends to the engine
  fabrication: Fabrication | null; // I-section, channel and T-section: a choice the user makes
  // the section dimensions (mm), typed in the Section group
  d: number | null; // circular hollow section
  t: number | null; // wall thickness: angle, rectangular and circular hollow sections
  h: number | null;
  b: number | null;
  tw: number | null;
  tf: number | null;
  r: number | null;
  s: number | null;
  cStem: number | null;
  rO: number | null; // RHS outer corner radius: section properties and drawing only, never c
  kSigma: Record<PlateRoleKey, number | null>; // one input per plate role (template route)
  plates: PlateRow[];
  sigmaCr: number | null;
  family: FamilyKey | null;
  poissonRatio: number | null;
  omega: number | null;
};

export const defaultDeformationForm: DeformationFormState = {
  kind: null,
  shape: null,
  fabrication: null,
  d: null,
  t: null,
  h: null,
  b: null,
  tw: null,
  tf: null,
  r: null,
  s: null,
  cStem: null,
  rO: null,
  kSigma: { web: null, flange: null, stem: null, leg: null },
  plates: [{ id: 1, label: "plate 1", width: null, thickness: null, kSigma: null }],
  sigmaCr: null,
  family: null,
  poissonRatio: null,
  omega: null,
};

export const CIRCULAR: SectionType = "circular hollow section";

/**
 * The section type picks the B.5 route: a circular hollow section uses B.10 and B.11 (diameter and
 * thickness), every other type is a section template (8.2.2(5)) unless the user chose to enter the
 * flat plates one by one. A typed critical stress stays a typed critical stress.
 */
export function withSectionType(form: DeformationFormState, type: SectionType): DeformationFormState {
  const circular = type === CIRCULAR;
  const kind =
    form.kind === "sigma_cr" ? "sigma_cr" : circular ? "chs" : form.kind === "plates" ? "plates" : "template";
  return { ...form, shape: type, kind, family: circular ? "circular_hollow" : "flat_plates" };
}

/** The typed dimensions as the sketch and the field list read them. */
export function dimsOf(form: DeformationFormState): SketchDims {
  return {
    h: form.h,
    b: form.b,
    tw: form.tw,
    tf: form.tf,
    t: form.t,
    d: form.d,
    r: form.r,
    s: form.s,
    cStem: form.cStem,
    rO: form.rO,
  };
}

/** Whether the section dimensions are asked for: the template route and the tube route. */
export function usesDimensions(form: DeformationFormState): boolean {
  return form.kind === "template" || form.kind === "chs";
}

/** What the user still has to give before B.5 can be calculated. */
export function missingDeformationItems(form: DeformationFormState): MissingItem[] {
  const item = (label: string, field: string): MissingItem => ({ label, group: "deformation", field });
  const sectionItem = (label: string, field: string): MissingItem => ({ label, group: "section", field });
  const missing: MissingItem[] = [];
  // The section type chooses the route and the family, so without it nothing else can be asked.
  if (form.kind === null || (form.kind === "sigma_cr" && form.family === null)) {
    missing.push({ label: "the section type", group: "section", field: "sectionType" });
  }
  // the section dimensions are part of the Section group
  if (form.kind === "chs" || form.kind === "template") {
    if (form.kind === "template" && needsFabrication(form.shape) && form.fabrication === null) {
      missing.push(sectionItem("the fabrication (rolled or welded)", "fabrication"));
    }
    const dims = dimsOf(form);
    for (const field of dimensionFields(form.shape, form.fabrication)) {
      if (dims[field.key] === null) missing.push(sectionItem(field.missingLabel, field.key));
    }
  }
  if (form.omega === null) missing.push(item("Ω", "omega"));
  if (form.kind !== "sigma_cr" && form.poissonRatio === null) missing.push(item("ν", "nu"));
  if (form.kind === "template") {
    for (const plate of plateRoles(form.shape, form.fabrication)) {
      if (form.kSigma[plate.role] === null) {
        missing.push(item(`k_σ of the ${plate.name.toLowerCase()}`, `kSigma-${plate.role}`));
      }
    }
  }
  if (form.kind === "plates") {
    form.plates.forEach((row) => {
      const gaps = [
        row.width === null ? { symbol: "b̄", key: "width" } : null,
        row.thickness === null ? { symbol: "t", key: "thickness" } : null,
        row.kSigma === null ? { symbol: "k_σ", key: "kSigma" } : null,
      ].filter((gap) => gap !== null);
      if (gaps.length > 0) {
        missing.push(
          item(
            `${gaps.map((gap) => gap.symbol).join(", ")} of ${row.label || "the plate"}`,
            `plate-${row.id}-${gaps[0].key}`,
          ),
        );
      }
    });
  }
  if (form.kind === "sigma_cr" && form.sigmaCr === null) missing.push(item("σ_cr,cs", "sigmaCr"));
  return missing;
}

export function missingDeformation(form: DeformationFormState): string[] {
  return missingDeformationItems(form).map((item) => item.label);
}

function geometryInput(form: DeformationFormState): GeometryInput {
  switch (form.kind) {
    case "chs":
      return { kind: "chs", d: form.d, t: form.t };
    case "template": {
      const dims = dimsOf(form);
      const geometry: GeometryInput = { kind: "template", shape: form.shape };
      if (needsFabrication(form.shape)) geometry.fabrication = form.fabrication;
      for (const field of dimensionFields(form.shape, form.fabrication)) {
        const value = dims[field.key];
        if (field.key === "tw") geometry.t_w = value;
        else if (field.key === "tf") geometry.t_f = value;
        else if (field.key === "cStem") geometry.c_stem = value;
        else geometry[field.key as "h" | "b" | "t" | "d" | "r" | "s"] = value;
      }
      const kSigma: NonNullable<GeometryInput["k_sigma"]> = {};
      for (const plate of plateRoles(form.shape, form.fabrication)) kSigma[plate.role] = form.kSigma[plate.role];
      geometry.k_sigma = kSigma;
      return geometry;
    }
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
    case null:
      throw new Error("The section type is not chosen yet.");
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


/**
 * What the section properties still need: the type, how it is made, and every dimension of the
 * outline, including the corner radii that B.5 does not use (r_o of an RHS, r of an angle) but not the
 * T-section's typed c_stem. This list never holds back B.5, B.6.2 or the Explore tab.
 */
export function missingPropertyItems(form: DeformationFormState): MissingItem[] {
  const sectionItem = (label: string, field: string): MissingItem => ({ label, group: "section", field });
  if (form.shape === null || !usesDimensions(form)) {
    return [sectionItem("the section type", "sectionType")];
  }
  const missing: MissingItem[] = [];
  if (needsFabrication(form.shape) && form.fabrication === null) {
    missing.push(sectionItem("the fabrication (rolled or welded)", "fabrication"));
  }
  const dims = dimsOf(form);
  for (const field of propertyFields(form.shape, form.fabrication)) {
    if (dims[field.key] === null) missing.push(sectionItem(field.missingLabel, field.key));
  }
  return missing;
}

/** The section-properties request, or null while something is missing. */
export function propertiesRequest(form: DeformationFormState): SectionPropertiesRequest | null {
  if (form.shape === null || missingPropertyItems(form).length > 0) return null;
  const dims = dimsOf(form);
  const body: SectionPropertiesRequest = { shape: form.shape };
  if (needsFabrication(form.shape)) body.fabrication = form.fabrication;
  for (const field of propertyFields(form.shape, form.fabrication)) {
    const value = dims[field.key];
    if (field.key === "tw") body.t_w = value;
    else if (field.key === "tf") body.t_f = value;
    else if (field.key === "rO") body.r_o = value;
    else body[field.key as "h" | "b" | "t" | "d" | "r" | "s"] = value;
  }
  return body;
}
