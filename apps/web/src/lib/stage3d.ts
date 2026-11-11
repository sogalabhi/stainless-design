import type { StageFrameOut } from "../api/types";
import type { Solid, Vec2, Vec3 } from "../components/viewer3d/types";
import { outlineSolids } from "./exploreScene";
import { profileAt, type StageCase } from "./stage";
import type { StageSection } from "./stageSection";

/**
 * The 3D cut of the Section Stage, as plain data: the member, how it deforms, the field of arrows on
 * the cut face and the envelope of the stress block. three.js only draws what this describes.
 *
 * Axes (as the shared viewer): the cross-section lies in x-y (x right, y up, mm) and the member runs
 * along z. The member is drawn from z = -length (the far end, held) to z = 0 (the cut face).
 *
 * The deformation has ONE rule for every load case: a strain is drawn STAGE_MAGNIFICATION times larger
 * than it is. The cut face moves by (strain x drawn length x factor) along the member, and in bending
 * the curvature is (strain x factor) over the half depth. The drawn length is a drawing choice, so no
 * displacement value is calculated or shown.
 */

export const STAGE_MAGNIFICATION = 10;
/** the member is drawn this many times the larger side of the section long (a drawing choice) */
export const LENGTH_PER_SIDE = 2;

export const MAGNIFICATION_RULE = `Every strain is drawn ${STAGE_MAGNIFICATION} times larger than it is, so that it shows: the cut face moves by the strain times the drawn length times ${STAGE_MAGNIFICATION}, and in bending it turns about the neutral axis by the same rule.`;
export const LENGTH_NOTE = `The drawn length is ${LENGTH_PER_SIDE} times the larger side of the section: an illustrative choice, so no displacement value is calculated or shown.`;

export type StageBody = {
  /** the section in the x-y plane, turned when the bending depth runs across the typed width */
  solids: Solid[];
  /** the drawn size in mm along x and y */
  width: number;
  height: number;
  /** the half depth, to the extreme fibre */
  halfDepth: number;
  length: number;
  /** bending, hogging: the member curves downward and the compression is at the bottom */
  hogging?: boolean;
};

/** The section's polygons as the viewer extrudes them. A quarter turn (minor-axis bending) keeps the depth on y. */
export function stageBody(section: StageSection): StageBody {
  // the custom route brings its polygons already placed and turned
  if (section.solids) {
    const { width, height } = section;
    return { solids: section.solids, width, height, halfDepth: height / 2, length: LENGTH_PER_SIDE * Math.max(width, height), hogging: section.hogging };
  }
  const raw = outlineSolids(section.shape, section.fabrication, section.dims);
  // y up, clockwise a quarter turn: (x, y) -> (y, -x), as the 2D drawing turns the sketch
  const turn = (loop: Vec2[]): Vec2[] => loop.map(([x, y]): Vec2 => [y, x === 0 ? 0 : -x]);
  const solids = section.turned
    ? raw.map((solid) => ({ outer: turn(solid.outer), holes: solid.holes?.map(turn) }))
    : raw;
  const width = section.width;
  const height = section.height;
  return { solids, width, height, halfDepth: height / 2, length: LENGTH_PER_SIDE * Math.max(width, height), hogging: section.hogging };
}

/** Where the member and its cut face are for one strain: a placement of every point, and the face's frame. */
export type Pose = {
  /** the point (x, y) of the section at s along the member (0 far end, 1 cut face) */
  place: (x: number, y: number, s: number) => Vec3;
  /** the cut face as a rigid frame: where its origin is, and how far it turned about x (radians) */
  face: { position: Vec3; rotationX: number };
};

/** The undeformed member: the unloaded outline. */
export function restPose(length: number): Pose {
  return {
    place: (x, y, s) => [x, y, -length + s * length],
    face: { position: [0, 0, 0], rotationX: 0 },
  };
}

/**
 * The member at a strain (`strain` is the engine's ε at the extreme fibre, a magnitude).
 * Compression shortens it, tension lengthens it; in bending the top fibres shorten and the bottom
 * fibres lengthen, so it curves and the cut face turns about the neutral axis.
 */
export function memberPose(
  key: StageCase,
  strain: number,
  body: StageBody,
  factor = STAGE_MAGNIFICATION,
): Pose {
  const pose = sagPose(key, strain, body, factor);
  return key === "bending" && body.hogging ? mirrorPose(pose) : pose;
}

/** The pose turned over about the member's axis: hogging is the sagging member upside down. */
function mirrorPose(pose: Pose): Pose {
  return {
    place: (x, y, s) => {
      const [px, py, pz] = pose.place(x, -y, s);
      return [px, -py, pz];
    },
    face: {
      position: [pose.face.position[0], -pose.face.position[1], pose.face.position[2]],
      rotationX: -pose.face.rotationX,
    },
  };
}

function sagPose(key: StageCase, strain: number, body: StageBody, factor: number): Pose {
  const { length } = body;
  const drawn = strain * factor;
  if (key !== "bending") {
    // the whole length changes by the same share: -drawn in compression, +drawn in tension
    const share = key === "compression" ? -drawn : drawn;
    return {
      place: (x, y, s) => [x, y, -length + s * length * (1 + share)],
      face: { position: [0, 0, length * share], rotationX: 0 },
    };
  }
  const curvature = drawn / body.halfDepth;
  if (curvature < 1e-12) return restPose(length);
  const turned = curvature * length;
  return {
    place: (x, y, s) => {
      const theta = curvature * length * s;
      return [x, (1 - Math.cos(theta)) / curvature + y * Math.cos(theta), -length + Math.sin(theta) / curvature - y * Math.sin(theta)];
    },
    face: {
      position: [0, (1 - Math.cos(turned)) / curvature, -length + Math.sin(turned) / curvature],
      rotationX: -turned,
    },
  };
}

/** A point of the cut face's own frame (x, y in the section plane, z out of the face) in world space. */
export function faceToWorld(pose: Pose, point: Vec3): Vec3 {
  const [x, y, z] = point;
  const phi = pose.face.rotationX;
  const [px, py, pz] = pose.face.position;
  return [px + x, py + y * Math.cos(phi) - z * Math.sin(phi), pz + y * Math.sin(phi) + z * Math.cos(phi)];
}

// --- the field of arrows ---------------------------------------------------------------------------

export type FaceArrow = {
  x: number;
  y: number;
  /** mm, proportional to the stress at this fibre */
  length: number;
  /** compression presses on the face (head at the face); tension pulls (head away from it) */
  press: boolean;
};

/** The intervals of material where the horizontal line at `y` crosses the section (even-odd over every loop). */
export function intervalsAt(solids: Solid[], y: number): [number, number][] {
  const xs: number[] = [];
  for (const solid of solids) {
    for (const loop of [solid.outer, ...(solid.holes ?? [])]) {
      for (let i = 0; i < loop.length; i += 1) {
        const [x1, y1] = loop[i];
        const [x2, y2] = loop[(i + 1) % loop.length];
        if (y1 <= y !== y2 <= y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

const ARROW_LEVELS = 12;
const MIN_ARROW = 3;

/**
 * The arrows on the cut face: slices across the depth, one arrow in the middle of each stretch of
 * material on a slice (several on a wide plate). Each is as long as the stress at its fibre, read
 * along the engine's profile for the frame, times `lengthPerStress` (mm per N/mm²).
 */
export function faceArrows(body: StageBody, frame: StageFrameOut, lengthPerStress: number): FaceArrow[] {
  const { solids, halfDepth, width, height } = body;
  const spacing = Math.max(width, height) / 7;
  const levels = new Set<number>();
  for (let k = 0; k < ARROW_LEVELS; k += 1) levels.add(-halfDepth + ((k + 0.5) * 2 * halfDepth) / ARROW_LEVELS);
  // slices close to the edges, so a flange of the section always carries arrows
  for (const sign of [-1, 1]) levels.add(sign * (halfDepth - 0.025 * 2 * halfDepth));
  const arrows: FaceArrow[] = [];
  for (const y of [...levels].sort((a, b) => a - b)) {
    const stress = profileAt(frame.depth, frame.stress_profile, y / halfDepth);
    const length = Math.abs(stress) * lengthPerStress;
    if (length < MIN_ARROW) continue;
    for (const [x0, x1] of intervalsAt(solids, y)) {
      const count = Math.max(1, Math.round((x1 - x0) / spacing));
      for (let i = 0; i < count; i += 1) {
        arrows.push({ x: x0 + ((i + 0.5) * (x1 - x0)) / count, y, length, press: stress > 0 });
      }
    }
  }
  return arrows;
}

/** mm of arrow per N/mm²: the longest arrow of the whole slider is 0.55 of the larger side of the section. */
export function lengthPerStress(body: StageBody, stressTop: number): number {
  return stressTop > 0 ? (0.55 * Math.max(body.width, body.height)) / stressTop : 0;
}

/** The stress at a height y on the face, along the engine's profile (compression positive). */
export function stressAtHeight(body: StageBody, frame: StageFrameOut, y: number): number {
  return profileAt(frame.depth, frame.stress_profile, y / body.halfDepth);
}

// --- the stress colour -----------------------------------------------------------------------------

export type StressTone = {
  side: "comp" | "tens";
  /** 0 at no stress, 1 at f_y: the soft tone */
  soft: number;
  /** 0 at f_y, 1 at the largest stress of the slider: the deep tone for the strain hardening */
  deep: number;
};

/** How a stress is coloured: a soft tone up to f_y, then deeper with the hardening above it. */
export function stressTone(stress: number, fy: number, stressTop: number): StressTone {
  const magnitude = Math.abs(stress);
  const over = stressTop > fy ? (magnitude - fy) / (stressTop - fy) : 0;
  return {
    side: stress >= 0 ? "comp" : "tens",
    soft: Math.min(magnitude / fy, 1),
    deep: Math.min(Math.max(over, 0), 1),
  };
}

// --- what the camera has to hold -----------------------------------------------------------------------

/**
 * The corners of the box holding the unloaded member, the member at the strain limit and the longest
 * arrow: the camera is fitted to these once, so scrubbing the slider never moves the view.
 */
export function stageCorners(body: StageBody, limit: Pose, longest: number): Vec3[] {
  const w = body.width / 2;
  const h = body.halfDepth;
  const points: Vec3[] = [];
  for (const pose of [restPose(body.length), limit]) {
    for (const s of [0, 1]) {
      for (const x of [-w, w]) for (const y of [-h, h]) points.push(pose.place(x, y, s));
    }
  }
  for (const x of [-w, w]) for (const y of [-h, h]) points.push(faceToWorld(limit, [x, y, longest]));
  return points;
}
