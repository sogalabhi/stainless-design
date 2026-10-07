import { describe, expect, it } from "vitest";
import { slabGeometry, tubeGeometry } from "./sectionMesh";

function box(geometry: ReturnType<typeof slabGeometry>) {
  const b = geometry.boundingBox!;
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
}

describe("section meshes", () => {
  it("a flat slab has the width, length and thickness it was given", () => {
    const size = box(slabGeometry(180, 6, 360, 0, 2));
    expect(size.x).toBeCloseTo(180);
    expect(size.y).toBeCloseTo(360);
    expect(size.z).toBeCloseTo(6);
  });

  it("waves move the slab out of plane by the amplitude, and leave its edges flat", () => {
    const geometry = slabGeometry(180, 6, 360, 10, 2);
    expect(box(geometry).z).toBeCloseTo(6 + 2 * 10, 0);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(Math.abs(position.getX(i)) - 90) < 1e-6) {
        expect(Math.abs(position.getZ(i))).toBeCloseTo(3);
      }
    }
  });

  it("a tube has its outer diameter and length, and ring waves widen it", () => {
    const plain = box(tubeGeometry(100, 3, 200, 0, 4));
    expect(plain.x).toBeCloseTo(100);
    expect(plain.y).toBeCloseTo(200);
    expect(box(tubeGeometry(100, 3, 200, 5, 4)).x).toBeCloseTo(110, 0);
  });

  it("builds a valid indexed mesh with normals", () => {
    const geometry = tubeGeometry(100, 3, 200, 2, 4);
    expect(geometry.index!.count % 3).toBe(0);
    expect(geometry.getAttribute("normal").count).toBe(geometry.getAttribute("position").count);
  });
});
