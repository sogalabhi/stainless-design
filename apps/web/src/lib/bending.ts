import type { BendingAxisKey, BendingRequest, DeformationRequest, SectionType } from "../api/types";
import {
  CIRCULAR,
  deformationRequest,
  missingDeformationItems,
  type DeformationFormState,
} from "./geometry";
import type { MissingItem } from "./inputs";
import { plateRoles, type PlateRoleKey } from "./sectionTemplates";
import type { TensionFormState } from "./tension";

/**
 * The Bending group of the dock (B.6.3.1(1), B.6.3.2). Every value outside Annex B starts empty:
 * W_el and W_pl about the chosen axis, λ_LT, and the plate buckling factors of the *bending* stress
 * pattern. Those k_σ are separate from the compression ones (a web in pure bending is held back less
 * than one in uniform compression), so the compression fields stay as they are.
 */
export type BendingFormState = {
  axis: BendingAxisKey | null; // y-y is major, z-z is minor; a circular hollow section needs no choice
  wEl: number | null; // mm3, about the axis of bending
  wPl: number | null; // mm3
  lambdaLT: number | null;
  kSigma: Record<PlateRoleKey, number | null>; // one per plate role (section template route)
  plateKSigma: Record<number, number | null>; // one per plate of the manual route, by row id
  sigmaCr: number | null; // a typed σ_cr,cs for bending (typed-stress route)
};

export const defaultBendingForm: BendingFormState = {
  axis: null,
  wEl: null,
  wPl: null,
  lambdaLT: null,
  kSigma: { web: null, flange: null, stem: null, leg: null },
  plateKSigma: {},
  sigmaCr: null,
};

/** A circular hollow section bends alike about every axis (Table B.2: any), so it is asked no axis. */
export function asksForAxis(sectionType: SectionType | null): boolean {
  return sectionType !== null && sectionType !== CIRCULAR;
}

/**
 * The B.5 form of the section in bending: the same section, but with the bending k_σ (or the typed
 * bending σ_cr,cs) in place of the compression ones. Everything else is shared.
 */
export function withBendingStress(
  deformation: DeformationFormState,
  bending: BendingFormState,
): DeformationFormState {
  return {
    ...deformation,
    kSigma: bending.kSigma,
    sigmaCr: bending.sigmaCr,
    plates: deformation.plates.map((row) => ({ ...row, kSigma: bending.plateKSigma[row.id] ?? null })),
  };
}

/** What the Bending tab still waits for: the shared B.5 inputs, γM0, and the bending inputs. */
export function missingBendingItems(
  sectionType: SectionType | null,
  deformation: DeformationFormState,
  bending: BendingFormState,
  section: TensionFormState,
): MissingItem[] {
  const own = (label: string, field: string): MissingItem => ({ label, group: "bending", field });
  const missing: MissingItem[] = missingDeformationItems(deformation, false);
  if (section.gammaM0 === null) missing.push({ label: "γM0", group: "section", field: "gammaM0" });
  if (asksForAxis(sectionType) && bending.axis === null) missing.push(own("the axis of bending", "axis"));
  if (bending.wEl === null) missing.push(own("W_el", "wEl"));
  if (bending.wPl === null) missing.push(own("W_pl", "wPl"));
  if (bending.lambdaLT === null) missing.push(own("λ_LT", "lambdaLT"));
  if (deformation.kind === "template") {
    for (const plate of plateRoles(deformation.shape, deformation.fabrication)) {
      if (bending.kSigma[plate.role] === null) {
        missing.push(own(`k_σ of the ${plate.name.toLowerCase()} in bending`, `kSigmaB-${plate.role}`));
      }
    }
  }
  if (deformation.kind === "plates") {
    for (const row of deformation.plates) {
      if ((bending.plateKSigma[row.id] ?? null) === null) {
        missing.push(own(`k_σ of ${row.label || "the plate"} in bending`, `plate-${row.id}-kSigmaB`));
      }
    }
  }
  if (deformation.kind === "sigma_cr" && bending.sigmaCr === null) {
    missing.push(own("σ_cr,cs in bending", "sigmaCrBending"));
  }
  return missing;
}

/** The API request, or null while something is still missing. */
export function bendingRequest(
  material: DeformationRequest["material"],
  sectionType: SectionType | null,
  deformation: DeformationFormState,
  bending: BendingFormState,
  section: TensionFormState,
): BendingRequest | null {
  if (sectionType === null || missingBendingItems(sectionType, deformation, bending, section).length > 0) {
    return null;
  }
  const geometry = deformationRequest(material, withBendingStress(deformation, bending));
  if (geometry === null || bending.wEl === null || bending.wPl === null) return null;
  if (bending.lambdaLT === null || section.gammaM0 === null) return null;
  return {
    material,
    section_type: sectionType,
    axis: asksForAxis(sectionType) ? bending.axis : null,
    geometry: geometry.geometry,
    omega: geometry.omega,
    poisson_ratio: geometry.poisson_ratio,
    w_el: bending.wEl,
    w_pl: bending.wPl,
    gamma_m0: section.gammaM0,
    lambda_lt: bending.lambdaLT,
  };
}
