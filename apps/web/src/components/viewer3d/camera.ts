import type { Vec3, ViewName } from "./types";

/**
 * Camera maths of the viewer, without three.js: the preset directions and the fit. The camera always
 * keeps y up and looks at the origin, where every item is centred.
 */

/** A tiny sideways lean, so the Top view never looks exactly along the up axis (lookAt is undefined there). */
const LEAN = 1e-4;

/** The unit vector from the target to the camera for each preset. */
export const VIEW_DIRECTION: Record<ViewName, Vec3> = {
  // looking along the member, at the cross-section: x to the right, y up
  front: [0, 0, 1],
  // from the left, the member runs left to right (+z to the right)
  side: [-1, 0, 0],
  // from above, the member runs left to right as in the side view
  top: normalise([-LEAN, 1, 0]),
  // isometric: equal angles to the three axes, from the side of the front face
  iso: normalise([-1, 1, 1]),
};

export const VIEW_LABEL: Record<ViewName, string> = {
  front: "Front",
  side: "Side",
  top: "Top",
  iso: "Iso",
};

export function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * The screen axes of a camera looking from `direction` (target to camera) with y up, as three.js
 * lookAt builds them: right = up x direction, screenUp = direction x right.
 */
export function screenAxes(direction: Vec3): { right: Vec3; up: Vec3 } {
  const z = normalise(direction);
  const right = normalise(cross([0, 1, 0], z));
  return { right, up: cross(z, right) };
}

/** The eight corners of a box given by its min and max corners. */
export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/**
 * The half-height of the view volume (orthographic) that shows every point in a viewport of the given
 * aspect (width / height), seen from `direction`, with the origin in the middle and `margin` (1.1 = 10 %
 * free space). All items share it, so they are drawn to the same scale.
 */
export function fitHalfHeight(points: Vec3[], direction: Vec3, aspect: number, margin = 1.1): number {
  const { right, up } = screenAxes(direction);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const p of points) {
    halfWidth = Math.max(halfWidth, Math.abs(dot(p, right)));
    halfHeight = Math.max(halfHeight, Math.abs(dot(p, up)));
  }
  const needed = Math.max(halfHeight, halfWidth / Math.max(aspect, 1e-6));
  return Math.max(needed, 1e-6) * margin;
}

/** The radius of the sphere about the origin that holds every point: sets the camera distance and clip planes. */
export function boundingRadius(points: Vec3[]): number {
  return Math.max(1e-6, ...points.map((p) => Math.hypot(p[0], p[1], p[2])));
}

/** The camera distance of a perspective camera (vertical field of view in degrees) that shows `halfHeight`. */
export function perspectiveDistance(halfHeight: number, fovDegrees: number, radius: number): number {
  return halfHeight / Math.tan((fovDegrees * Math.PI) / 360) + radius;
}

/** A key that changes only when the fit should be redone: other items, or a different overall size. */
export function fitKey(ids: string[], radius: number): string {
  return `${ids.join("|")}@${radius.toPrecision(3)}`;
}
