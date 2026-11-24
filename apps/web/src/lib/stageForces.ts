import type { ResultantsOut } from "../api/types";
import { depthY, type StageLayout } from "./stageLayout";

/**
 * Where the two resultant forces of the stress block stand on the Stage drawing. The engine returns
 * the forces and their distances from the neutral axis in mm (textbook, Gere eqs. 10-3 and 10-4); this
 * turns a distance into a height on the drawing, nothing more. The browser integrates nothing.
 */
export type ForceArrows = {
  /** y of the compression force and of the tension force on the drawing */
  compressionY: number;
  tensionY: number;
  /** the arrows are of one length, so the picture shows where the forces act and the numbers say how big */
  length: number;
};

const ARROW_LENGTH = 62;

/**
 * `halfMm` is the half depth of the section as drawn, in mm (the drawing's depth axis spans +-1).
 * Hogging turns the picture over: the compression force is then below the axis.
 */
export function forceArrows(
  layout: StageLayout,
  resultants: Pick<ResultantsOut, "distance_compression" | "distance_tension">,
  halfMm: number,
  hogging: boolean,
  /** the frame's neutral axis on the depth scale (engine's): 0 unless the section is unsymmetric */
  neutralDepth = 0,
): ForceArrows | null {
  if (!(halfMm > 0)) return null;
  const clamp = (u: number) => Math.min(1, Math.max(-1, u));
  // the engine's depth has the compression edge at +1; hogging turns the picture over
  const c = clamp(neutralDepth + resultants.distance_compression / halfMm);
  const t = clamp(neutralDepth - resultants.distance_tension / halfMm);
  return {
    compressionY: depthY(layout, hogging ? -c : c),
    tensionY: depthY(layout, hogging ? -t : t),
    length: ARROW_LENGTH,
  };
}

/** What the hover reads at one fibre when the Forces choice is on: the engine's grid, read between its nodes. */
export type FibreReading = {
  /** the section's width at that fibre, mm */
  width: number;
  /** the force from the nearer edge out to that fibre, N, a magnitude */
  force: number;
};

/**
 * The width and the force at normalised depth `u` (+1 compression edge), read along the engine's
 * fibre grid the same way the stress arrows read its profile. Null when the engine gave no grid.
 */
export function readFibre(
  depths: readonly number[],
  widths: readonly number[],
  forces: readonly number[] | null | undefined,
  u: number,
): FibreReading | null {
  if (!forces || depths.length < 2 || forces.length !== depths.length || widths.length !== depths.length) return null;
  if (u < depths[0] || u > depths[depths.length - 1]) return null;
  let i = 0;
  while (i < depths.length - 2 && depths[i + 1] < u) i += 1;
  const span = depths[i + 1] - depths[i];
  const t = span > 0 ? (u - depths[i]) / span : 0;
  const at = (values: readonly number[]) => values[i] + t * (values[i + 1] - values[i]);
  return { width: at(widths), force: at(forces) };
}

/**
 * The part of the stress block between the nearer edge and the fibre at depth `u`, as a closed polygon
 * of [stress, depth] points along the engine's profile: what the force at that fibre is the force of.
 */
export function blockToFibre(
  depth: readonly number[],
  u: number,
  valueAt: (u: number) => number,
): [number, number][] {
  const edge = u >= 0 ? 1 : -1;
  const inside = depth.filter((d) => (edge > 0 ? d > u && d < 1 : d < u && d > -1));
  const ordered = edge > 0 ? [...inside].sort((a, b) => b - a) : [...inside].sort((a, b) => a - b); // from the edge inwards
  const along = [edge, ...ordered, u];
  const points: [number, number][] = [[0, edge], ...along.map((d): [number, number] => [valueAt(d), d]), [0, u]];
  return points;
}

/** The lines of the card over one force: the force and where it acts, then its parts. Engine values, written out. */
export function forceCardLines(
  r: Pick<ResultantsOut, "force_compression" | "force_tension" | "distance_compression" | "distance_tension" | "parts">,
  side: "compression" | "tension",
): string[] {
  const force = side === "compression" ? r.force_compression : r.force_tension;
  const distance = side === "compression" ? r.distance_compression : r.distance_tension;
  const symbol = side === "compression" ? "F_c" : "F_t";
  const kn = (value: number) => (value / 1000).toFixed(1);
  return [
    `${symbol} = ${kn(force)} kN`,
    `acts ${distance.toFixed(1)} mm from the neutral axis`,
    ...r.parts.filter((p) => p.side === side).map((p) => `${p.name}: ${kn(p.force)} kN at ${p.distance.toFixed(1)} mm`),
  ];
}
