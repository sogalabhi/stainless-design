import type { BendingAxisKey, PlateOut, SectionType } from "../api/types";
import { CIRCULAR, dimsOf, usesDimensions, type DeformationFormState } from "./geometry";
import {
  CHS,
  drawable,
  feasibility,
  type Fabrication,
  type PlateRoleKey,
  type SketchDims,
} from "./sectionTemplates";
import { isTurned, type StageCase } from "./stage";
import type { Solid, Vec2 } from "../components/viewer3d/types";

/**
 * The section the Stage draws, from the dimensions the user typed (and only those). Drawing geometry,
 * never an engineering value: the flat widths c and the governing plate come from the engine's plate
 * list. The route with no dimensions (plates typed one by one, or a typed σ_cr,cs) has no section.
 */
export type StageSection = {
  shape: SectionType;
  fabrication: Fabrication | null;
  dims: SketchDims;
  /** bending about the minor axis: drawn turned a quarter, so the bending depth runs up the page */
  turned: boolean;
  /** the drawn outline's size in mm across and up the page (after turning) */
  width: number;
  height: number;
  /**
   * the custom route (nodes and links): the plates as polygons in mm, y up, centred on the middle of
   * their bounding box and already turned; the drawing and the 3D body use these instead of a template
   */
  solids?: Solid[];
  /** bending, hogging: compression at the bottom and the member curving the other way */
  hogging?: boolean;
};

/** Each link as a rectangle (its length by its thickness) about the line between its two nodes. */
export function linkSolids(form: DeformationFormState, factor = 1): Solid[] | null {
  const at = (id: number | null) => form.nodes.find((n) => n.id !== null && n.id === id);
  const loops: Vec2[][] = [];
  for (const link of form.links) {
    const a = at(link.from);
    const b = at(link.to);
    if (!a || !b || a.x === null || a.y === null || b.x === null || b.y === null) continue;
    if (link.thickness === null || !(link.thickness > 0)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    const h = (link.thickness * factor) / 2;
    const nx = (-dy / len) * h;
    const ny = (dx / len) * h;
    loops.push([
      [a.x + nx, a.y + ny],
      [b.x + nx, b.y + ny],
      [b.x - nx, b.y - ny],
      [a.x - nx, a.y - ny],
    ]);
  }
  return loops.length === 0 ? null : loops.map((outer) => ({ outer }));
}

/** The typed dimensions with every thickness multiplied by `factor` (the what-if), as the engine does. */
export function scaledDims(dims: SketchDims, factor: number): SketchDims {
  const scale = (value: number | null) => (value === null ? null : value * factor);
  return { ...dims, tw: scale(dims.tw), tf: scale(dims.tf), t: scale(dims.t) };
}

/**
 * The section to draw for a load case, or null when nothing can be drawn: no dimensions given, or
 * the typed ones make an impossible shape. `factor` is the what-if thickness factor (1 = yours).
 */
export function stageSection(
  form: DeformationFormState,
  key: StageCase,
  axis: BendingAxisKey | null,
  factor = 1,
  hogging = false,
): StageSection | null {
  const section = baseSection(form, key, axis, factor);
  return section && hogging ? { ...section, hogging: true } : section;
}

function baseSection(
  form: DeformationFormState,
  key: StageCase,
  axis: BendingAxisKey | null,
  factor: number,
): StageSection | null {
  if (form.shape === null) return null;
  if (form.kind === "plates") return customSection(form, key, axis, factor);
  if (!usesDimensions(form)) return null;
  const dims = scaledDims(dimsOf(form), factor);
  if (!drawable(feasibility(form.shape, form.fabrication, dims))) return null;
  const turned = isTurned(form.shape, axis, key);
  if (form.shape === CIRCULAR) {
    const d = dims.d ?? 0;
    return { shape: form.shape, fabrication: null, dims, turned: false, width: d, height: d };
  }
  const h = dims.h ?? 0;
  const b = dims.b ?? 0;
  return {
    shape: form.shape,
    fabrication: form.fabrication,
    dims,
    turned,
    width: turned ? h : b,
    height: turned ? b : h,
  };
}

/** The engine's plate behind a label ("web", "flange"), for the plate a what-if names as governing. */
export function plateByLabel(plates: PlateOut[], label: string | null): PlateOut | null {
  return label === null ? null : (plates.find((plate) => plate.label === label) ?? null);
}

/** The plate roles to light, and the flat widths c by role, read from the engine's plate list. */
export function litRole(plate: PlateOut | null): PlateRoleKey | null {
  return plate?.role ?? null;
}

export function flatWidths(plates: PlateOut[]): Partial<Record<PlateRoleKey, number>> {
  return Object.fromEntries(plates.flatMap((plate) => (plate.role ? [[plate.role, plate.width]] : [])));
}

export function isTube(section: StageSection | null): boolean {
  return section?.shape === CHS;
}

/** The custom section from the nodes and links: centred on its bounding box, turned a quarter for minor-axis bending. */
function customSection(
  form: DeformationFormState,
  key: StageCase,
  axis: BendingAxisKey | null,
  factor: number,
): StageSection | null {
  const raw = linkSolids(form, factor);
  if (raw === null || form.shape === null) return null;
  const pts = raw.flatMap((solid) => solid.outer);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const turned = isTurned(form.shape, axis, key);
  // same quarter turn as the template bodies: (x, y) -> (y, -x)
  const place = ([x, y]: Vec2): Vec2 => (turned ? [y - cy, -(x - cx)] : [x - cx, y - cy]);
  const solids = raw.map((solid) => ({ outer: solid.outer.map(place) }));
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return {
    shape: form.shape,
    fabrication: null,
    dims: { ...dimsOf(form) },
    turned: false, // already applied to the polygons
    width: turned ? h : w,
    height: turned ? w : h,
    solids,
  };
}
