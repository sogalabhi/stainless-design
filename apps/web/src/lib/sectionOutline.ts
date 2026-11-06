import type { SectionType } from "../api/types";
import { ANGLE, CHANNEL, CHS, I_SECTION, RHS, T_SECTION, type Fabrication, type SketchDims } from "./sectionTemplates";

/**
 * The outline of a section template, drawn from the typed dimensions: the one geometry source of the
 * SVG sketch (SectionSketch) and the 3D view (it is extruded there). It is drawing geometry only: the
 * engine derives every engineering value (c, A, I, ...) from its own outline, and nothing here enters a
 * calculation.
 *
 * Coordinates are in the units of the dimensions given (mm, or mm times the sketch scale), centred on
 * the bounding box of the section, x to the right and y DOWN (as in SVG). Orientation as the engine and
 * the sketch draw it: the T-section has its flange on top, the channel its web on the left, the angle
 * its longer leg h standing on the left and its shorter leg b lying at the bottom.
 *
 * A rolled I-section, channel or T-section gets a fillet of radius r at each web-flange corner, a welded
 * one a weld triangle of leg s (kept as a separate closed path), an angle its root radius r, a
 * rectangular hollow section its outer corner radius r_o (inner radius max(r_o - t, 0)). A corner size
 * is clamped to the room the shape leaves; an empty or zero size is a sharp corner.
 */

export type PathCmd =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  /** a circular arc of radius r to (x, y), with the SVG large-arc and sweep flags */
  | { op: "A"; r: number; x: number; y: number; large: 0 | 1; sweep: 0 | 1 }
  | { op: "Z" };

export type SectionOutline = {
  /** closed paths: the first is the outer boundary, any other is a hole (fill rule even-odd) */
  paths: PathCmd[][];
  /** weld triangles of a welded section, each a closed path of its own */
  welds: PathCmd[][];
  /** the root radius or weld leg actually drawn, after clamping; 0 for a sharp corner */
  corner: number;
};

class Pen {
  readonly cmds: PathCmd[] = [];
  private x = 0;
  private y = 0;

  move(x: number, y: number): this {
    this.cmds.push({ op: "M", x, y });
    this.x = x;
    this.y = y;
    return this;
  }

  line(x: number, y: number): this {
    this.cmds.push({ op: "L", x, y });
    this.x = x;
    this.y = y;
    return this;
  }

  h(x: number): this {
    return this.line(x, this.y);
  }

  v(y: number): this {
    return this.line(this.x, y);
  }

  arc(r: number, x: number, y: number, sweep: 0 | 1 = 0, large: 0 | 1 = 0): this {
    this.cmds.push({ op: "A", r, x, y, large, sweep });
    this.x = x;
    this.y = y;
    return this;
  }

  close(): PathCmd[] {
    this.cmds.push({ op: "Z" });
    return this.cmds;
  }
}

/** A closed rectangle, its corners rounded with radius R (0 keeps them sharp). */
function roundedRect(x0: number, y0: number, x1: number, y1: number, R: number): PathCmd[] {
  const pen = new Pen();
  if (R <= 0) return pen.move(x0, y0).h(x1).v(y1).h(x0).close();
  return pen
    .move(x0 + R, y0)
    .h(x1 - R)
    .arc(R, x1, y0 + R, 1)
    .v(y1 - R)
    .arc(R, x1 - R, y1, 1)
    .h(x0 + R)
    .arc(R, x0, y1 - R, 1)
    .v(y0 + R)
    .arc(R, x0 + R, y0, 1)
    .close();
}

function circle(radius: number): PathCmd[] {
  return new Pen().move(-radius, 0).arc(radius, radius, 0, 0, 1).arc(radius, -radius, 0, 0, 1).close();
}

/**
 * The outline of `shape` from the dimensions `d` (an empty dimension counts as 0). `corners: false`
 * draws every corner sharp (the sketch's corners layer switched off).
 */
export function sectionOutline(
  shape: SectionType,
  fabrication: Fabrication | null,
  d: SketchDims,
  { corners = true }: { corners?: boolean } = {},
): SectionOutline {
  const v = (value: number | null) => value ?? 0;

  if (shape === CHS) {
    const ro = v(d.d) / 2;
    const ri = Math.max(ro - v(d.t), 0);
    return { paths: ri > 0 ? [circle(ro), circle(ri)] : [circle(ro)], welds: [], corner: 0 };
  }

  if (shape === RHS) {
    const H = v(d.h);
    const B = v(d.b);
    const T = v(d.t);
    const ro = corners ? Math.max(Math.min(v(d.rO), Math.min(H, B) / 2), 0) : 0;
    const ri = Math.max(ro - T, 0);
    return {
      paths: [
        roundedRect(-B / 2, -H / 2, B / 2, H / 2, ro),
        roundedRect(-B / 2 + T, -H / 2 + T, B / 2 - T, H / 2 - T, ri),
      ],
      welds: [],
      corner: ro,
    };
  }

  if (shape === ANGLE) {
    const H = v(d.h);
    const B = v(d.b);
    const T = v(d.t);
    const x0 = -B / 2;
    const x1 = B / 2;
    const yT = -H / 2;
    const yB = H / 2;
    const K = corners ? Math.max(Math.min(v(d.r), B - T, H - T), 0) : 0;
    const pen = new Pen().move(x0, yT).h(x0 + T);
    if (K > 0) pen.v(yB - T - K).arc(K, x0 + T + K, yB - T);
    else pen.v(yB - T);
    return { paths: [pen.h(x1).v(yB).h(x0).close()], welds: [], corner: K };
  }

  // I-section, channel and T-section: web, flanges and the corner between them
  const H = v(d.h);
  const B = v(d.b);
  const TW = v(d.tw);
  const TF = v(d.tf);
  const x0 = -B / 2;
  const x1 = B / 2;
  const yT = -H / 2;
  const yB = H / 2;
  const rolled = fabrication !== "welded";
  const raw = rolled ? v(d.r) : v(d.s);
  const room = shape === CHANNEL ? Math.max(B - TW, 0) : Math.max((B - TW) / 2, 0);
  const K = corners ? Math.max(Math.min(raw, room, shape === T_SECTION ? H - TF : (H - 2 * TF) / 2), 0) : 0;
  const filleted = rolled && K > 0;
  const welded = !rolled && K > 0;
  const tri = (x: number, y: number, sx: number, sy: number) =>
    new Pen().move(x, y).line(x + sx * K, y).line(x, y + sy * K).close();

  const welds: PathCmd[][] = [];
  const pen = new Pen().move(x0, yT).h(x1).v(yT + TF);
  if (shape === I_SECTION) {
    const wL = -TW / 2;
    const wR = TW / 2;
    if (filleted) {
      pen.h(wR + K).arc(K, wR, yT + TF + K).v(yB - TF - K).arc(K, wR + K, yB - TF);
      pen.h(x1).v(yB).h(x0).v(yB - TF);
      pen.h(wL - K).arc(K, wL, yB - TF - K).v(yT + TF + K).arc(K, wL - K, yT + TF);
    } else {
      pen.h(wR).v(yB - TF).h(x1).v(yB).h(x0).v(yB - TF).h(wL).v(yT + TF);
    }
    pen.h(x0);
    if (welded) {
      welds.push(tri(wR, yT + TF, 1, 1), tri(wR, yB - TF, 1, -1), tri(wL, yT + TF, -1, 1), tri(wL, yB - TF, -1, -1));
    }
  } else if (shape === CHANNEL) {
    const wR = x0 + TW;
    if (filleted) pen.h(wR + K).arc(K, wR, yT + TF + K).v(yB - TF - K).arc(K, wR + K, yB - TF);
    else pen.h(wR).v(yB - TF);
    pen.h(x1).v(yB).h(x0);
    if (welded) welds.push(tri(wR, yT + TF, 1, 1), tri(wR, yB - TF, 1, -1));
  } else if (shape === T_SECTION) {
    const wL = -TW / 2;
    const wR = TW / 2;
    if (filleted) pen.h(wR + K).arc(K, wR, yT + TF + K).v(yB).h(wL).v(yT + TF + K).arc(K, wL - K, yT + TF);
    else pen.h(wR).v(yB).h(wL).v(yT + TF);
    pen.h(x0);
    if (welded) welds.push(tri(wR, yT + TF, 1, 1), tri(wL, yT + TF, -1, 1));
  }
  return { paths: [pen.close()], welds, corner: K };
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** SVG path data for closed paths: H and V where a line is level or plumb, as the sketch writes them. */
export function pathData(paths: PathCmd[][]): string {
  const parts: string[] = [];
  for (const path of paths) {
    let x = 0;
    let y = 0;
    for (const cmd of path) {
      if (cmd.op === "M") parts.push(`M ${fmt(cmd.x)} ${fmt(cmd.y)}`);
      else if (cmd.op === "L") {
        if (cmd.y === y) parts.push(`H ${fmt(cmd.x)}`);
        else if (cmd.x === x) parts.push(`V ${fmt(cmd.y)}`);
        else parts.push(`L ${fmt(cmd.x)} ${fmt(cmd.y)}`);
      } else if (cmd.op === "A") {
        parts.push(`A ${fmt(cmd.r)} ${fmt(cmd.r)} 0 ${cmd.large} ${cmd.sweep} ${fmt(cmd.x)} ${fmt(cmd.y)}`);
      } else parts.push("Z");
      if (cmd.op !== "Z") {
        x = cmd.x;
        y = cmd.y;
      }
    }
  }
  return parts.join(" ");
}

export type Vec2 = [number, number];

/**
 * The points of an SVG arc (radius r, no rotation) from (x1, y1) to (x2, y2), without the start point.
 * The centre follows the SVG endpoint-to-centre conversion (SVG 1.1, appendix F.6.5); a radius too
 * small for the chord is enlarged to half the chord, as SVG does.
 */
function arcPoints(
  x1: number,
  y1: number,
  cmd: Extract<PathCmd, { op: "A" }>,
  perQuarter: number,
): Vec2[] {
  const { x: x2, y: y2, large, sweep } = cmd;
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  const chord2 = hx * hx + hy * hy;
  if (chord2 === 0) return [];
  const r = Math.max(cmd.r, Math.sqrt(chord2));
  const k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(r * r - chord2, 0) / chord2);
  const cx = k * hy + (x1 + x2) / 2;
  const cy = -k * hx + (y1 + y2) / 2;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let delta = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (large === 1 && Math.abs(delta) < Math.PI - 1e-9) delta += sweep === 1 ? 2 * Math.PI : -2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * perQuarter));
  const points: Vec2[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const angle = a1 + (delta * i) / steps;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  points[points.length - 1] = [x2, y2];
  return points;
}

/**
 * Each closed path as a polygon, with y turned UP (the 3D view's section plane: x right, y up). Arcs
 * become `perQuarter` straight segments per quarter circle. The last point is not repeated.
 */
export function pathPolygons(paths: PathCmd[][], perQuarter = 16): Vec2[][] {
  return paths.map((path) => {
    const points: Vec2[] = [];
    for (const cmd of path) {
      if (cmd.op === "M" || cmd.op === "L") points.push([cmd.x, cmd.y]);
      else if (cmd.op === "A") {
        const [x, y] = points[points.length - 1];
        points.push(...arcPoints(x, y, cmd, perQuarter));
      }
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (points.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) points.pop();
    return points.map(([x, y]): Vec2 => [x, y === 0 ? 0 : -y]);
  });
}
