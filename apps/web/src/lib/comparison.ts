import type { ComparisonPointOut, ComparisonRequest, SectionType } from "../api/types";
import type { DeformationFormState } from "./geometry";
import { deformationRequest, dimsOf } from "./geometry";
import type { Fabrication, SketchDims } from "./sectionTemplates";
import { templateLayout, type TemplateLayout } from "./templateScene";

/** A tube, or each plate drawn as its own slab (the plates carry no layout, so none is assumed). */
export type SceneSection =
  | { kind: "chs"; d: number; t: number }
  | { kind: "plates"; plates: { label: string; width: number; thickness: number }[] }
  // a section template from the typed dimensions (thicknesses scaled): its outline is drawn from
  // `dims`, and `plates` says where each plate role stands (for the wave of the governing plate)
  | ({ kind: "template"; shape: SectionType; fabrication: Fabrication | null; dims: SketchDims } & TemplateLayout);

/** The request, or null while something is missing or the section has no thickness to change. */
export function comparisonRequest(
  material: ComparisonRequest["material"],
  form: DeformationFormState,
): ComparisonRequest | null {
  if (form.kind === "sigma_cr") return null;
  return deformationRequest(material, form);
}

/** The user's section with every thickness multiplied by `factor`, or null if still incomplete. */
export function sceneSection(form: DeformationFormState, factor: number): SceneSection | null {
  if (form.kind === "chs") {
    if (form.d === null || form.t === null) return null;
    return { kind: "chs", d: form.d, t: form.t * factor };
  }
  if (form.kind === "template" && form.shape !== null) {
    // the thickness factor multiplies t_w, t_f and t, as the engine does (h, b, r, s, d stay)
    const typed = dimsOf(form);
    const scaled = (value: number | null) => (value === null ? null : value * factor);
    const dims = { ...typed, tw: scaled(typed.tw), tf: scaled(typed.tf), t: scaled(typed.t) };
    const layout = templateLayout(form.shape, dims);
    return layout === null
      ? null
      : { kind: "template", shape: form.shape, fabrication: form.fabrication, dims, ...layout };
  }
  if (form.kind === "plates") {
    const plates = [];
    for (const row of form.plates) {
      if (row.width === null || row.thickness === null) return null;
      plates.push({ label: row.label || "plate", width: row.width, thickness: row.thickness * factor });
    }
    return { kind: "plates", plates };
  }
  return null;
}

/** The index of the sweep point whose thickness factor is closest (on a log scale) to `factor`. */
export function nearestPoint(points: ComparisonPointOut[], factor: number): number {
  let best = 0;
  let bestGap = Infinity;
  points.forEach((point, index) => {
    const gap = Math.abs(Math.log(point.factor / factor));
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}

/**
 * How strongly to draw the local buckling waves, from 0 (flat) to 1.3. It is only for the
 * picture: flat while the section can still reach yield (slenderness up to the branch change
 * of B.6 / B.7), full at the upper limit of the method, and larger beyond it.
 */
export function wrinkleAmount(slenderness: number, switchAt: number, upper: number): number {
  const span = upper - switchAt;
  if (span <= 0) return 0;
  return Math.min(1.3, Math.max(0, (slenderness - switchAt) / span));
}

export type Zone = ComparisonPointOut["zone"];

export const ZONE_LABEL: Record<Zone, string> = {
  stocky: "Stocky",
  slender: "Slender",
  not_allowed: "Not allowed",
};

/** The server's figure with one more trace on top, for the slider position (drawn here, live). */
export function withTrace(
  figure: Record<string, unknown>,
  trace: Record<string, unknown>,
): Record<string, unknown> {
  return { ...figure, data: [...((figure.data as unknown[] | undefined) ?? []), trace] };
}
