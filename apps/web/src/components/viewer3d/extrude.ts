import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import type { Displacement, Solid, Vec2 } from "./types";

/**
 * The member as a mesh: the cross-section extruded along z, from -length / 2 to +length / 2, each point
 * moved by the item's displacement (if any) at its station. Walls are cut into `stations - 1` rings
 * along the member and long straight edges of the outline are cut into pieces no longer than
 * `maxSegment`, so that a wave across a plate has points to bend.
 */

/** Twice the signed area: positive for a counter-clockwise loop (y up). */
export function signedArea(loop: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

/** The loop turning the given way: counter-clockwise for an outer boundary, clockwise for a hole. */
export function oriented(loop: Vec2[], counterClockwise: boolean): Vec2[] {
  return signedArea(loop) > 0 === counterClockwise ? loop : [...loop].reverse();
}

/** The loop with every edge longer than `maxSegment` cut into equal pieces. */
export function resampled(loop: Vec2[], maxSegment: number): Vec2[] {
  if (!(maxSegment > 0)) return loop;
  const out: Vec2[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const pieces = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSegment));
    for (let k = 0; k < pieces; k += 1) {
      out.push([a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces]);
    }
  }
  return out;
}

/** The bounding box of the cross-section, [minX, minY, maxX, maxY]. */
export function sectionBounds(section: Solid[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const solid of section) {
    for (const [x, y] of solid.outer) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

export type ExtrudeOptions = {
  displacement?: Displacement;
  /** stations along the member, ends included (2 when nothing is displaced) */
  stations?: number;
  /** the longest straight piece of the outline; default 1/24 of the larger side of the section */
  maxSegment?: number;
};

export function memberGeometry(section: Solid[], length: number, options: ExtrudeOptions = {}): BufferGeometry {
  const { displacement } = options;
  const stations = displacement ? Math.max(2, Math.round(options.stations ?? 48)) : 2;
  const [minX, minY, maxX, maxY] = sectionBounds(section);
  const maxSegment = options.maxSegment ?? (displacement ? Math.max(maxX - minX, maxY - minY) / 24 : 0);

  const positions: number[] = [];
  const indices: number[] = [];
  const point = (x: number, y: number, s: number) => {
    const [dx, dy] = displacement ? displacement(x, y, s) : [0, 0];
    positions.push(x + dx, y + dy, (s - 0.5) * length);
    return positions.length / 3 - 1;
  };

  const wall = (loop: Vec2[]) => {
    const n = loop.length;
    const base = positions.length / 3;
    for (let j = 0; j < stations; j += 1) {
      const s = j / (stations - 1);
      for (const [x, y] of loop) point(x, y, s);
    }
    for (let j = 0; j < stations - 1; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const a = base + j * n + i;
        const b = base + j * n + ((i + 1) % n);
        const c = b + n;
        const d = a + n;
        // with the loop counter-clockwise (holes clockwise), (a, b, c) faces out of the material
        indices.push(a, b, c, a, c, d);
      }
    }
  };

  const cap = (outer: Vec2[], holes: Vec2[][], s: number, facingPlusZ: boolean) => {
    const all = [outer, ...holes].flat();
    const faces = ShapeUtils.triangulateShape(
      outer.map(([x, y]) => new Vector2(x, y)),
      holes.map((hole) => hole.map(([x, y]) => new Vector2(x, y))),
    );
    const base = positions.length / 3;
    for (const [x, y] of all) point(x, y, s);
    for (const [i, j, k] of faces) {
      const [ax, ay] = all[i];
      const [bx, by] = all[j];
      const [cx, cy] = all[k];
      const ccw = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
      if (ccw === facingPlusZ) indices.push(base + i, base + j, base + k);
      else indices.push(base + i, base + k, base + j);
    }
  };

  for (const solid of section) {
    const outer = oriented(resampled(solid.outer, maxSegment), true);
    const holes = (solid.holes ?? []).map((hole) => oriented(resampled(hole, maxSegment), false));
    wall(outer);
    for (const hole of holes) wall(hole);
    cap(outer, holes, 0, false);
    cap(outer, holes, 1, true);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
