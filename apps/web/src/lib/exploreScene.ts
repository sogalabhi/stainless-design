import type { AnchoredLabel, Arrow, Displacement, Solid, Vec2, ViewerItem } from "../components/viewer3d/types";
import type { SceneSection, Zone } from "./comparison";
import { pathPolygons, sectionOutline } from "./sectionOutline";
import { ANGLE, CHANNEL, CHS, EMPTY_DIMS, I_SECTION, RHS, T_SECTION } from "./sectionTemplates";

/**
 * The Explore tab's sections as items of the shared 3D viewer. The outline is the true one, drawn from
 * the typed dimensions with the thickness factor applied (sectionOutline: fillets, weld legs and corner
 * radii as typed). The waves are a picture only: the CSM does not calculate a buckled shape, so their
 * size follows the slenderness (wrinkleAmount) and each item says "Illustrative" on the view.
 */

export type SceneItem = {
  id: string;
  label: string;
  detail: string;
  section: SceneSection;
  /** 0 flat, 1 at the upper limit of the method: how strong the wrinkles are drawn */
  wrinkle: number;
  zone: Zone;
  /** section template: the plate role the engine reports as governing; only that plate wrinkles */
  governing?: string;
};

/** Drawing choices, not results: the member is drawn this many times its widest section long. */
export const LENGTH_PER_WIDTH = 2;
export const TUBE_WAVES = 4;
export const PLATE_WAVES = 2;
/** wave size at wrinkle 1, as a share of the plate width (plates) or the diameter (tubes) */
const PLATE_SHARE = 0.18;
const TUBE_SHARE = 0.04;

export const ILLUSTRATIVE_NOTE =
  "The waves are a picture of more slender, more buckling, sized from the slenderness: the CSM does not calculate a buckled shape.";

const EPS = 1e-6;

/** The widest dimension of a section, which sets the common drawn length. */
export function referenceWidth(section: SceneSection): number {
  if (section.kind === "template") return Math.max(section.width, section.depth);
  if (section.kind === "chs") return section.d;
  return Math.max(...section.plates.map((p) => p.width));
}

/** Where each flat plate stands when they are drawn side by side: left edge x0 and width, centred. */
function plateRow(plates: { width: number; thickness: number }[]): { x0: number; width: number; thickness: number }[] {
  const gap = Math.max(...plates.map((p) => p.width)) * 0.15;
  const total = plates.reduce((sum, p) => sum + p.width, 0) + gap * (plates.length - 1);
  let cursor = -total / 2;
  return plates.map((p) => {
    const placed = { x0: cursor, width: p.width, thickness: p.thickness };
    cursor += p.width + gap;
    return placed;
  });
}

/** The cross-section as polygons (mm, x right, y up, centred on its bounding box). */
export function sceneSolids(section: SceneSection): Solid[] {
  if (section.kind === "plates") {
    return plateRow(section.plates).map(({ x0, width, thickness }) => ({
      outer: [
        [x0, -thickness / 2],
        [x0 + width, -thickness / 2],
        [x0 + width, thickness / 2],
        [x0, thickness / 2],
      ] as Vec2[],
    }));
  }
  const outline =
    section.kind === "chs"
      ? sectionOutline(CHS, null, { ...EMPTY_DIMS, d: section.d, t: section.t })
      : sectionOutline(section.shape, section.fabrication, section.dims);
  const [outer, ...holes] = pathPolygons(outline.paths);
  return [{ outer, holes }, ...pathPolygons(outline.welds).map((weld) => ({ outer: weld }))];
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const sign = (value: number) => (value < 0 ? -1 : 1);

/**
 * The illustrative wave: the governing plate bows out of its plane, held along its supported edges
 * (an internal plate as a half sine across its width, an outstand rotating about its root), times
 * sin(m pi s) along the member. Flat when `wrinkle` is 0.
 */
export function wrinkleField(section: SceneSection, wrinkle: number, governing?: string): Displacement | undefined {
  if (!(wrinkle > 0)) return undefined;
  if (section.kind === "chs") {
    const amplitude = wrinkle * TUBE_SHARE * section.d;
    return (x, y, s) => {
      const r = Math.hypot(x, y) || 1;
      const w = amplitude * Math.sin(Math.PI * TUBE_WAVES * s);
      return [(w * x) / r, (w * y) / r];
    };
  }
  if (section.kind === "plates") {
    const row = plateRow(section.plates);
    return (x, _y, s) => {
      const plate = row.find((p) => x >= p.x0 - EPS && x <= p.x0 + p.width + EPS);
      if (!plate) return [0, 0];
      const amplitude = wrinkle * PLATE_SHARE * plate.width;
      return [0, amplitude * Math.sin((Math.PI * (x - plate.x0)) / plate.width) * Math.sin(Math.PI * PLATE_WAVES * s)];
    };
  }

  const role = governing ?? section.plates[0]?.role;
  const plateWidth = Math.max(0, ...section.plates.filter((p) => p.role === role).map((p) => p.width));
  if (plateWidth <= 0) return undefined;
  const A = wrinkle * PLATE_SHARE * plateWidth;
  const along = (s: number) => Math.sin(Math.PI * PLATE_WAVES * s);
  const { shape } = section;
  const v = (value: number | null) => value ?? 0;
  const h = v(section.dims.h);
  const b = v(section.dims.b);
  const K = sectionOutline(shape, section.fabrication, section.dims).corner;
  const halfSine = (u: number, span: number) => (span > 0 ? Math.sin(Math.PI * clamp01(u / span)) : 0);

  if (shape === I_SECTION || shape === CHANNEL || shape === T_SECTION) {
    const tw = v(section.dims.tw);
    const tf = v(section.dims.tf);
    const webLeft = shape === CHANNEL ? -b / 2 : -tw / 2;
    const webRight = webLeft + tw;
    const root = webRight + K; // where the flange outstand starts (the free edge is at b / 2)
    const rootLeft = webLeft - K;
    const inner = h / 2 - tf; // the inner face of the top flange
    if (role === "web" || role === "stem") {
      return (x, y, s) => {
        if (x < rootLeft - EPS || x > root + EPS) return [0, 0];
        if (shape === T_SECTION) {
          if (y >= inner) return [0, 0];
          return [A * clamp01((inner - y) / (h - tf)) * along(s), 0];
        }
        if (Math.abs(y) >= inner) return [0, 0];
        return [A * halfSine(y + inner, 2 * inner) * along(s), 0];
      };
    }
    // a flange: each outstand turns about its root
    return (x, y, s) => {
      if (shape === T_SECTION ? y < inner - EPS : Math.abs(y) < inner - EPS) return [0, 0];
      const upper = shape === T_SECTION ? 1 : sign(y);
      if (x > root) return [0, upper * A * clamp01((x - root) / (b / 2 - root)) * along(s)];
      if (shape !== CHANNEL && x < rootLeft) {
        return [0, -upper * A * clamp01((rootLeft - x) / (rootLeft + b / 2)) * along(s)];
      }
      return [0, 0];
    };
  }

  if (shape === ANGLE) {
    const t = v(section.dims.t);
    const foot = -h / 2 + t; // the top face of the shorter leg: the root of the longer one
    return (x, y, s) => {
      if (x > -b / 2 + t + K + EPS || y <= foot) return [0, 0];
      return [A * clamp01((y - foot) / (h - t)) * along(s), 0];
    };
  }

  if (shape === RHS) {
    const t = v(section.dims.t);
    const ri = Math.max(K - t, 0);
    if (role === "web") {
      return (x, y, s) => {
        if (Math.abs(x) < b / 2 - t - ri - EPS || Math.abs(y) >= h / 2 - t) return [0, 0];
        return [sign(x) * A * halfSine(y + h / 2 - t, h - 2 * t) * along(s), 0];
      };
    }
    return (x, y, s) => {
      if (Math.abs(y) < h / 2 - t - ri - EPS || Math.abs(x) >= b / 2 - t) return [0, 0];
      return [0, sign(y) * A * halfSine(x + b / 2 - t, b - 2 * t) * along(s)];
    };
  }
  return undefined;
}

/** Where to pin the name of the governing plate: its middle, on the front end of the member. */
function plateLabels(section: SceneSection, governing: string | undefined, length: number): AnchoredLabel[] {
  const front = length / 2;
  if (section.kind === "chs") {
    const r = section.d / 2;
    return [{ id: "plate", text: "tube wall", at: [r * Math.SQRT1_2, r * Math.SQRT1_2, front] }];
  }
  if (section.kind === "plates") {
    return plateRow(section.plates).map((p, index) => ({
      id: `plate-${index}`,
      text: section.plates[index].label,
      at: [p.x0 + p.width / 2, p.thickness / 2, front],
    }));
  }
  const candidates = section.plates.filter((p) => p.role === governing);
  if (candidates.length === 0) return [];
  // the top flange, or the right-hand web: the one nearest the upper right
  const plate = candidates.reduce((best, p) => (p.cx + p.cz > best.cx + best.cz ? p : best));
  return [{ id: "plate", text: `${plate.role}, governing`, at: [plate.cx, plate.cz, front] }];
}

/** The two compression arrows, pointing at the ends of the member along its axis. */
export function compressionArrows(length: number): Arrow[] {
  const arrow = length * 0.22;
  const gap = length * 0.04;
  const start = length / 2 + gap + arrow;
  return [
    { from: [0, 0, start], direction: [0, 0, -1], length: arrow },
    { from: [0, 0, -start], direction: [0, 0, 1], length: arrow },
  ];
}

/** Every Explore section as a viewer item, all drawn the same length so they compare at one scale. */
export function exploreItems(items: SceneItem[]): ViewerItem[] {
  if (items.length === 0) return [];
  const length = Math.max(...items.map((item) => referenceWidth(item.section))) * LENGTH_PER_WIDTH;
  const arrows = compressionArrows(length);
  const tail = arrows[0].from;
  return items.map((item) => ({
    id: item.id,
    title: item.label,
    subtitle: item.detail,
    section: sceneSolids(item.section),
    length,
    tone: item.zone,
    status: { kind: "illustrative", note: ILLUSTRATIVE_NOTE },
    displacement: wrinkleField(item.section, item.wrinkle, item.governing),
    stations: 64,
    arrows,
    labels: [
      ...plateLabels(item.section, item.governing, length),
      { id: "compression", text: "compression", at: tail },
    ],
  }));
}
