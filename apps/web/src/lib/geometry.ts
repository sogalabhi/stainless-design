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

/** A point of the custom section's line model (mm). `id` is the number the links refer to. */
export type NodeRow = { uid: number; id: number | null; x: number | null; y: number | null };

/** A flat plate between two nodes: its flat width b̄ is the distance between them. */
export type LinkRow = {
  uid: number;
  label: string;
  from: number | null;
  to: number | null;
  thickness: number | null;
  kSigma: number | null;
};

/**
 * The plates of the custom route, from the nodes and the links: b̄ of a link is the length between its
 * two nodes. A link with a missing or unknown node has no width yet. The link's uid is the plate's id.
 */
export function platesFromLinks(nodes: NodeRow[], links: LinkRow[]): PlateRow[] {
  const at = (id: number | null) => nodes.find((n) => n.id !== null && n.id === id);
  return links.map((link) => {
    const a = at(link.from);
    const b = at(link.to);
    const ok = a && b && a.x !== null && a.y !== null && b.x !== null && b.y !== null;
    const width = ok ? Math.hypot(b.x! - a.x!, b.y! - a.y!) : null;
    return {
      id: link.uid,
      label: link.label.trim() || `link ${link.uid}`,
      width: width !== null && width > 0 ? Math.round(width * 1000) / 1000 : null,
      thickness: link.thickness,
      kSigma: link.kSigma,
    };
  });
}

/** Every number starts empty: nothing is assumed. */
export type DeformationFormState = {
  kind: GeometryKindKey | null; // null until the section type is chosen: the type sets the route
  custom: boolean; // Section group: a custom section of flat plates typed in a table, not a template
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
  plates: PlateRow[]; // custom route: derived from `nodes` and `links`
  nodes: NodeRow[];
  links: LinkRow[];
  sigmaCr: number | null;
  family: FamilyKey | null;
  poissonRatio: number | null;
  omega: number | null;
};

export const defaultDeformationForm: DeformationFormState = {
  kind: null,
  custom: false,
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
  plates: [{ id: 1, label: "link 1", width: null, thickness: null, kSigma: null }],
  nodes: [{ uid: 1, id: 1, x: null, y: null }],
  links: [{ uid: 1, label: "link 1", from: null, to: null, thickness: null, kSigma: null }],
  sigmaCr: null,
  family: null,
  poissonRatio: null,
  omega: null,
};

export const CIRCULAR: SectionType = "circular hollow section";

/**
 * The route the section geometry gives: a circular hollow section uses B.10 and B.11 (diameter and
 * thickness); every other type is a template (8.2.2(5)) or, when the user chose Custom, the flat plates
 * typed in the table.
 */
export function geometryKind(form: DeformationFormState, type: SectionType | null = form.shape): GeometryKindKey {
  if (type === CIRCULAR) return "chs";
  return form.custom ? "plates" : "template";
}

/** The section type picks the route and the family. A typed critical stress stays a typed critical stress. */
export function withSectionType(form: DeformationFormState, type: SectionType): DeformationFormState {
  const circular = type === CIRCULAR;
  const kind = form.kind === "sigma_cr" ? "sigma_cr" : geometryKind(form, type);
  return { ...form, shape: type, kind, family: circular ? "circular_hollow" : "flat_plates" };
}

/** Template or Custom, chosen in the Section group. */
export function withCustom(form: DeformationFormState, custom: boolean): DeformationFormState {
  const next = { ...form, custom };
  return form.kind === null || form.kind === "sigma_cr" ? next : { ...next, kind: geometryKind(next) };
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

/**
 * What the user still has to give before B.5 can be calculated. `withStressPattern: false` leaves out
 * the inputs that belong to one stress pattern (k_σ of each plate, a typed σ_cr,cs); bending asks for
 * its own and keeps everything else (the section, ν, Ω, the plate widths and thicknesses).
 */
export function missingDeformationItems(form: DeformationFormState, withStressPattern = true): MissingItem[] {
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
  if (form.kind === "template" && withStressPattern) {
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
        withStressPattern && row.kSigma === null ? { symbol: "k_σ", key: "kSigma" } : null,
      ].filter((gap) => gap !== null);
      if (gaps.length > 0) {
        missing.push(
          sectionItem(
            `${gaps.map((gap) => gap.symbol).join(", ")} of ${row.label || "the plate"}`,
            `plate-${row.id}-${gaps[0].key}`,
          ),
        );
      }
    });
  }
  if (withStressPattern && form.kind === "sigma_cr" && form.sigmaCr === null) {
    missing.push(item("σ_cr,cs", "sigmaCr"));
  }
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
