import type { ResultantsOut, StageFrameOut, StageFramesOut } from "../api/types";
import type { Solid, Vec2 } from "../components/viewer3d/types";
import { profileAt } from "./stage";
import { readFibre } from "./stageForces";
import type { StageBody } from "./stage3d";

/**
 * The Forces choice of the 3D cut (plan.md 4i, textbook): where the two resultants stand on the cut face,
 * and how the stress volume splits into its parts. Plain data; three.js only draws it. Every force and
 * distance is the engine's (Gere eqs. 10-3 and 10-4); here a distance becomes a place on the face and a
 * force a length, nothing is calculated.
 *
 * The face's y runs up the depth in mm, as in `stage3d.ts`. The frame given here is the drawn one, so for
 * hogging (compression at the bottom) the depth is already turned over; the engine's resultants are not,
 * and `hogging` turns their distances.
 */

export type ForceSide = "compression" | "tension";

export type ResultantArrow = {
  side: ForceSide;
  /** the height of the force on the face, mm from the neutral axis, signed as drawn */
  y: number;
  /** mm: proportional to the force, against the largest force of the whole slider */
  length: number;
  /** N */
  force: number;
};

export type ResultantArrows = {
  compression: ResultantArrow;
  tension: ResultantArrow;
  /** the lever arm between them, mm */
  leverArm: number;
};

/** The longest arrow of the slider is this share of the larger side of the section. */
const LONGEST = 0.55;

export function resultantArrows(
  body: Pick<StageBody, "width" | "height" | "halfDepth">,
  r: Pick<ResultantsOut, "force_compression" | "force_tension" | "distance_compression" | "distance_tension" | "lever_arm">,
  /** the largest F_c over the frames of the slider, so the arrows share one scale */
  forceTop: number,
  hogging: boolean,
): ResultantArrows | null {
  if (!(forceTop > 0) || r.force_compression <= 0) return null;
  const scale = (LONGEST * Math.max(body.width, body.height)) / forceTop;
  const sign = hogging ? -1 : 1;
  return {
    compression: { side: "compression", y: sign * r.distance_compression, length: r.force_compression * scale, force: r.force_compression },
    tension: { side: "tension", y: -sign * r.distance_tension, length: r.force_tension * scale, force: r.force_tension },
    leverArm: r.lever_arm,
  };
}

// --- the stress volume in parts --------------------------------------------------------------------

export type PartLayer = "core" | "yielded" | "hardening";

export type StagePart = {
  name: "elastic core" | "yielded zone" | "hardening";
  layer: PartLayer;
  side: ForceSide;
  /** the fibres this part covers: y from low to high, mm on the face */
  band: [number, number];
};

/**
 * The parts the engine reports, as bands of the face. The elastic core is the fibres up to the corner of
 * the stress diagram (where the stress reaches f_y); outside it the volume is f_y high (the yielded zone)
 * with the strain hardening above that. At or below first yield there is only the core.
 */
export function stageParts(body: Pick<StageBody, "halfDepth">, frame: StageFrameOut): StagePart[] {
  const h = body.halfDepth;
  const corner = frame.depth.find((d) => d > 0 && d < 1);
  const sideAt = (y: number): ForceSide => (profileAt(frame.depth, frame.stress_profile, y / h) >= 0 ? "compression" : "tension");
  const parts: StagePart[] = [];
  const coreEdge = corner === undefined ? h : corner * h;
  for (const [low, high] of [[0, coreEdge], [-coreEdge, 0]] as [number, number][]) {
    parts.push({ name: "elastic core", layer: "core", side: sideAt((low + high) / 2), band: [low, high] });
  }
  if (corner !== undefined) {
    for (const [low, high] of [[coreEdge, h], [-h, -coreEdge]] as [number, number][]) {
      const side = sideAt((low + high) / 2);
      parts.push({ name: "yielded zone", layer: "yielded", side, band: [low, high] });
      parts.push({ name: "hardening", layer: "hardening", side, band: [low, high] });
    }
  }
  return parts;
}

/** The height of a part's volume at a fibre of stress magnitude `m`: from the base to the top, in N/mm². */
export function partRange(layer: PartLayer, magnitude: number, fy: number): [number, number] {
  if (layer === "core") return [0, magnitude];
  if (layer === "yielded") return [0, Math.min(magnitude, fy)];
  return [Math.min(fy, magnitude), magnitude];
}

/** The engine's force for a part, N, or null where it reported none (a part of zero force is left out). */
export function partForce(r: Pick<ResultantsOut, "parts">, part: Pick<StagePart, "name" | "side">): number | null {
  return r.parts.find((p) => p.name === part.name && p.side === part.side)?.force ?? null;
}

// --- clipping the section to a band of the depth ---------------------------------------------------

function clipLoop(loop: Vec2[], keep: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    const dp = keep(p);
    const dq = keep(q);
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const f = dp / (dp - dq);
      out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
    }
  }
  return out;
}

/** The section cut to the fibres with low <= y <= high: the polygons of one part's footprint. */
export function clipSolidsToBand(solids: Solid[], low: number, high: number): Solid[] {
  const clip = (loop: Vec2[]) => clipLoop(clipLoop(loop, (p) => p[1] - low), (p) => high - p[1]);
  const out: Solid[] = [];
  for (const solid of solids) {
    const outer = clip(solid.outer);
    if (outer.length < 3) continue;
    const holes = (solid.holes ?? []).map(clip).filter((hole) => hole.length >= 3);
    out.push(holes.length > 0 ? { outer, holes } : { outer });
  }
  return out;
}

// --- the hover on the cut face ---------------------------------------------------------------------

/**
 * The lines of the card for the fibre at height `y` of the cut face: where it is, its strain and stress,
 * and (with Forces on) the width of the section and the force that reaches it from the nearer edge. The
 * same reading as the 2D drawing's card, from the engine's profiles and fibre grid.
 */
export function fibreLines(
  frames: Pick<StageFramesOut, "fibre_depth" | "fibre_width">,
  frame: StageFrameOut,
  halfDepth: number,
  hogging: boolean,
  y: number,
  fy: number,
): string[] | null {
  if (!(halfDepth > 0) || Math.abs(y) > halfDepth) return null;
  const u = y / halfDepth;
  const stress = profileAt(frame.depth, frame.stress_profile, u);
  const strain = profileAt(frame.depth, frame.strain_profile, u);
  const side = strain === 0 ? "at the neutral axis" : strain > 0 ? "compression" : "tension";
  const lines = [
    `z = ${y > 0 ? "+" : ""}${y.toFixed(1)} mm from the axis`,
    `ε = ${Math.abs(strain).toFixed(2)} ε_y, ${side}`,
    `σ = ${Math.abs(stress).toFixed(1)} N/mm² = ${(Math.abs(stress) / fy).toFixed(2)} f_y`,
  ];
  const fibre = readFibre(frames.fibre_depth ?? [], frames.fibre_width ?? [], frame.fibre_force, hogging ? -u : u);
  if (fibre) {
    lines.push(
      `section width here = ${fibre.width.toFixed(1)} mm`,
      `force from the ${u > 0 ? "upper" : "lower"} edge = ${(fibre.force / 1000).toFixed(1)} kN`,
      strain === 0 ? "at the neutral axis" : Math.abs(stress) >= fy * (1 - 1e-9) ? "yielded: f_y, plus hardening above it" : "still elastic here",
    );
  }
  return lines;
}
