import { BufferGeometry, Float32BufferAttribute } from "three";

/**
 * Meshes for the 3D comparison. They are drawings, not results: the CSM does not compute a
 * buckled shape, so the wave size is set by the caller from the slenderness and is only
 * illustrative. Compression acts along y; thickness is drawn in true proportion to the width.
 */

class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];

  /** A grid of (nx + 1) x (ny + 1) points; `flip` reverses the winding so the face looks outward. */
  grid(
    nx: number,
    ny: number,
    at: (u: number, v: number) => [number, number, number],
    flip = false,
  ): void {
    const base = this.positions.length / 3;
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) this.positions.push(...at(i / nx, j / ny));
    }
    const row = nx + 1;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const a = base + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (flip) this.indices.push(a, b, c, b, d, c);
        else this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/**
 * A circular hollow section of outer diameter `d` and wall `t`, `length` tall, with ring
 * wrinkles. The wall moves in and out together, and is flat at both ends.
 */
export function tubeGeometry(
  d: number,
  t: number,
  length: number,
  amplitude: number,
  waves: number,
): BufferGeometry {
  const builder = new MeshBuilder();
  const outer = d / 2;
  const inner = Math.max(outer - t, outer * 0.02);
  const around = 72;
  const along = Math.max(24, waves * 16);
  const wave = (v: number) => amplitude * Math.sin(Math.PI * waves * v);
  const ring = (radius: number) => (u: number, v: number): [number, number, number] => {
    const angle = u * Math.PI * 2;
    const r = radius + wave(v);
    return [r * Math.cos(angle), v * length - length / 2, r * Math.sin(angle)];
  };
  builder.grid(around, along, ring(outer));
  builder.grid(around, along, ring(inner), true);
  for (const [v, flip] of [[0, true] as const, [1, false] as const]) {
    builder.grid(around, 1, (u, k) => {
      const angle = u * Math.PI * 2;
      const r = inner + (outer - inner) * k;
      return [r * Math.cos(angle), v * length - length / 2, r * Math.sin(angle)];
    }, flip);
  }
  return builder.build();
}

/**
 * A flat plate of width `width` and thickness `t`, `length` tall, with the half-sine wrinkle of
 * a plate held along its long edges: sin(pi x / width) sin(m pi y / length).
 */
export function slabGeometry(
  width: number,
  t: number,
  length: number,
  amplitude: number,
  waves: number,
): BufferGeometry {
  const builder = new MeshBuilder();
  const nx = 28;
  const ny = Math.max(32, waves * 18);
  const bow = (u: number, v: number) =>
    amplitude * Math.sin(Math.PI * u) * Math.sin(Math.PI * waves * v);
  const face = (side: number) => (u: number, v: number): [number, number, number] => [
    u * width - width / 2,
    v * length - length / 2,
    bow(u, v) + side * (t / 2),
  ];
  builder.grid(nx, ny, face(1), true);
  builder.grid(nx, ny, face(-1));
  // the four edges are flat, so each is a plain rectangle
  const edge = (a: [number, number], b: [number, number], flip: boolean) =>
    builder.grid(1, 1, (u, k): [number, number, number] => [
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u,
      (k - 0.5) * t,
    ], flip);
  const x0 = -width / 2;
  const x1 = width / 2;
  const y0 = -length / 2;
  const y1 = length / 2;
  edge([x0, y0], [x0, y1], true);
  edge([x1, y0], [x1, y1], false);
  edge([x0, y0], [x1, y0], false);
  edge([x0, y1], [x1, y1], true);
  return builder.build();
}
