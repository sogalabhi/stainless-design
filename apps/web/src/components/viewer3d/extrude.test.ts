import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { memberGeometry, oriented, resampled, signedArea } from "./extrude";
import type { Vec2 } from "./types";

const square = (half: number): Vec2[] => [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half],
];

function size(geometry: ReturnType<typeof memberGeometry>) {
  const b = geometry.boundingBox!;
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}

describe("extruding the outline", () => {
  it("orients outer loops counter-clockwise and holes clockwise", () => {
    expect(signedArea(square(1))).toBeGreaterThan(0);
    expect(signedArea(oriented(square(1), false))).toBeLessThan(0);
    expect(oriented(square(1), true)).toEqual(square(1));
  });

  it("cuts long edges into pieces no longer than asked, keeping the corners", () => {
    const loop = resampled(square(10), 5);
    expect(loop).toHaveLength(16);
    expect(loop).toContainEqual([10, 10]);
  });

  it("extrudes along z, centred, with the section's true size", () => {
    const geometry = memberGeometry([{ outer: square(50), holes: [square(40)] }], 300);
    expect(size(geometry)).toEqual([100, 100, 300]);
    expect(geometry.index!.count % 3).toBe(0);
  });

  it("every face points out of the material, holes included", () => {
    const geometry = memberGeometry([{ outer: square(50), holes: [oriented(square(40), true)] }], 300);
    const position = geometry.getAttribute("position");
    const index = geometry.index!;
    const p = (i: number) => new Vector3().fromBufferAttribute(position, index.getX(i));
    for (let f = 0; f < index.count; f += 3) {
      const [a, b, c] = [p(f), p(f + 1), p(f + 2)];
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
      const centre = new Vector3().add(a).add(b).add(c).divideScalar(3);
      if (Math.abs(normal.z) > 0.9) {
        expect(Math.sign(normal.z)).toBe(Math.sign(centre.z));
      } else {
        // a wall: outward is away from the axis on the outer square, towards it on the hole
        const radial = Math.max(Math.abs(centre.x), Math.abs(centre.y));
        const outwards = normal.x * centre.x + normal.y * centre.y > 0;
        expect(outwards).toBe(radial > 45);
      }
    }
  });

  it("moves every point by the displacement at its station, flat at the ends of a sine", () => {
    const wave = (_x: number, _y: number, s: number): [number, number] => [0, 10 * Math.sin(Math.PI * s)];
    const geometry = memberGeometry([{ outer: square(50) }], 300, { displacement: wave, stations: 21 });
    expect(size(geometry)[1]).toBeCloseTo(110);
    const position = geometry.getAttribute("position");
    let atEnds = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(Math.abs(position.getZ(i)) - 150) < 1e-6) atEnds = Math.max(atEnds, Math.abs(position.getY(i)));
    }
    expect(atEnds).toBeCloseTo(50);
  });
});
