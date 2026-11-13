import { hardenedPolygon, profileAt, splitProfile, type ProfilePart } from "./stage";
import type { StageSection } from "./stageSection";

/**
 * Where everything stands on the Stage's 2D drawing: the section on the left and the strain and stress
 * panels beside it, all sharing one vertical depth axis (top, mid, bot), in SVG units. Pure
 * arrangement of the typed dimensions and the engine's profiles; no engineering value is made here.
 */
export type StageLayout = {
  /** px per mm of the section drawing (the section's height spans the depth axis) */
  scale: number;
  top: number;
  mid: number;
  bot: number;
  halfDepth: number;
  /** x of the section centre, the strain axis, the stress axis, and where the guide lines end */
  cx: number;
  ex: number;
  sx: number;
  gx: number;
  /** px per unit of ε/ε_y, and the ratio at the panel's outer tick */
  eu: number;
  ratioMax: number;
  /** px per N/mm², and the stress at the panel's outer tick */
  su: number;
  stressMax: number;
  viewW: number;
  viewH: number;
};

const DEPTH = 300; // px: the depth axis when the section is as high as it is wide enough
const SECTION_MAX_WIDTH = 600;
const STRAIN_HALF = 100; // px from the strain axis to its outer tick
const STRESS_HALF = 150;
const TOP = 70;

const ceilTo = (value: number, step: number) => Math.max(step, Math.ceil(value / step - 1e-9) * step);

export function stageLayout(
  section: StageSection | null,
  /** the largest strain ratio the slider reaches */
  limitRatio: number,
  /** the largest stress the slider reaches, and f_y */
  stressTop: number,
  fy: number,
): StageLayout {
  let scale = 1;
  let depth = DEPTH;
  let sectionWidth = 0;
  if (section && section.width > 0 && section.height > 0) {
    scale = Math.min(DEPTH / section.height, SECTION_MAX_WIDTH / section.width);
    depth = section.height * scale;
    sectionWidth = section.width * scale;
  }
  const left = Math.max(330, sectionWidth + 150);
  const ratioMax = ceilTo(Math.max(limitRatio, 15), 5);
  const stressMax = ceilTo(Math.max(stressTop, fy), 100);
  const mid = TOP + DEPTH / 2;
  const ex = left + 170;
  const sx = ex + 315;
  const gx = sx + 170;
  return {
    scale,
    top: mid - depth / 2,
    mid,
    bot: mid + depth / 2,
    halfDepth: depth / 2,
    cx: left / 2 + 10,
    ex,
    sx,
    gx,
    eu: STRAIN_HALF / ratioMax,
    ratioMax,
    su: STRESS_HALF / stressMax,
    stressMax,
    viewW: gx + 115,
    viewH: TOP + DEPTH + 95,
  };
}

/** The y of a normalised depth (+1 compression edge at the top, -1 tension edge at the bottom). */
export function depthY(layout: StageLayout, depth: number): number {
  return layout.mid - depth * layout.halfDepth;
}

const fix = (value: number) => Number(value.toFixed(1));

/** One signed part of a profile as a closed polygon against its axis line at `axisX`. */
export function partPath(part: ProfilePart, layout: StageLayout, axisX: number, unit: number): string {
  const first = part.points[0];
  const last = part.points[part.points.length - 1];
  const points = [
    [axisX, depthY(layout, first[1])],
    ...part.points.map(([value, depth]) => [axisX + value * unit, depthY(layout, depth)]),
    [axisX, depthY(layout, last[1])],
  ];
  return `M${points.map(([x, y]) => `${fix(x)} ${fix(y)}`).join("L")}Z`;
}

/** A closed polygon of [value, depth] points, drawn about `axisX`. */
export function polygonPath(points: [number, number][], layout: StageLayout, axisX: number, unit: number): string {
  if (points.length === 0) return "";
  return `M${points.map(([value, depth]) => `${fix(axisX + value * unit)} ${fix(depthY(layout, depth))}`).join("L")}Z`;
}

export type StageShapes = {
  /** the strain block, one polygon per sign: + compression, - tension */
  strain: { sign: 1 | -1; path: string }[];
  /** the stress block */
  stress: { sign: 1 | -1; path: string }[];
  /** the stress above f_y that a flat-yield model leaves out */
  hardened: { sign: 1 | -1; path: string; line: { x: number; y1: number; y2: number } }[];
};

/** The polygons of one frame, from its engine profiles. */
export function frameShapes(
  layout: StageLayout,
  depth: number[],
  strainProfile: number[],
  stressProfile: number[],
  fy: number,
): StageShapes {
  const strain = splitProfile(depth, strainProfile).map((part) => ({
    sign: part.sign,
    path: partPath(part, layout, layout.ex, layout.eu),
  }));
  const stressParts = splitProfile(depth, stressProfile);
  const stress = stressParts.map((part) => ({ sign: part.sign, path: partPath(part, layout, layout.sx, layout.su) }));
  const hardened = stressParts.flatMap((part) => {
    const polygon = hardenedPolygon(part, fy);
    if (polygon.length === 0) return [];
    const ys = polygon.map(([, d]) => depthY(layout, d));
    return [
      {
        sign: part.sign,
        path: polygonPath(polygon, layout, layout.sx, layout.su),
        line: { x: layout.sx + part.sign * fy * layout.su, y1: Math.min(...ys), y2: Math.max(...ys) },
      },
    ];
  });
  return { strain, stress, hardened };
}

/** Round tick values for the stress axis, symmetric about zero: -300 ... 300 for stressMax 300. */
export function stressTicks(stressMax: number): number[] {
  const out: number[] = [];
  for (let v = -stressMax; v <= stressMax; v += 100) out.push(v);
  return out;
}

export function strainTicks(ratioMax: number): number[] {
  const out: number[] = [];
  for (let v = -ratioMax; v <= ratioMax; v += 5) out.push(v);
  return out;
}

/** What lies under the pointer on the depth axis: the fibre and the engine's strain and stress there. */
export type StageProbe = {
  /** the y of the fibre on the drawing */
  y: number;
  /** the normalised depth, +1 at the compression edge and -1 at the tension edge */
  depth: number;
  /** the distance from the neutral axis in mm, + toward the compression edge; null with no section drawn */
  z: number | null;
  /** ε / ε_y and σ [N/mm²] at that fibre, read along the engine's profiles; + compression */
  strainRatio: number;
  stress: number;
  /** σ / f_y */
  stressOverYield: number;
};

/**
 * The fibre at drawing height `y`, or null outside the section. The values are interpolated on the
 * engine's own polylines (the same reading the stress arrows use), nothing is calculated here.
 */
export function probeAt(
  layout: StageLayout,
  frame: { depth: number[]; strain_profile: number[]; stress_profile: number[] },
  fy: number,
  sectionHeight: number | null,
  y: number,
): StageProbe | null {
  if (!(layout.halfDepth > 0) || y < layout.top || y > layout.bot) return null;
  const depth = (layout.mid - y) / layout.halfDepth;
  const stress = profileAt(frame.depth, frame.stress_profile, depth);
  return {
    y,
    depth,
    z: sectionHeight !== null && sectionHeight > 0 ? depth * (sectionHeight / 2) : null,
    strainRatio: profileAt(frame.depth, frame.strain_profile, depth),
    stress,
    stressOverYield: fy > 0 ? stress / fy : 0,
  };
}
