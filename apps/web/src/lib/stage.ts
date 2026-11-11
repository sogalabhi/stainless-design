import type {
  BendingParameterRowOut,
  BendingResponse,
  CompressionResponse,
  ComparisonPointOut,
  PlateOut,
  SectionType,
  SourceOut,
  StageFrameOut,
  StageFramesOut,
  StrainLimitOut,
  TensionResponse,
  TraceStepOut,
} from "../api/types";
import { formatFixed, formatPercentOne, formatRatio, kn, knM } from "./format";
import type { TabStatus } from "./inputs";

/**
 * The Section Stage: one screen for the three Annex B resistances. Everything here reads what the
 * engine returned (the response of a load case, its frames) and arranges it for the screen. Nothing
 * is derived: the percentages are engine fields, a frame is a state the engine computed, and the
 * slider steps from frame to frame without reading between two of them.
 */

export type StageCase = "tension" | "compression" | "bending";

export const STAGE_CASES: StageCase[] = ["tension", "compression", "bending"];
export const CASE_NAMES: Record<StageCase, string> = {
  tension: "Tension",
  compression: "Compression",
  bending: "Bending",
};
export const CASE_CLAUSES: Record<StageCase, string> = {
  tension: "B.6.1",
  compression: "B.6.2",
  bending: "B.6.3",
};

/** The case shown first: the first one that is done, else Tension (whatever it waits for). */
export function defaultCase(status: Record<StageCase, TabStatus>): StageCase {
  return STAGE_CASES.find((key) => status[key] === "done") ?? "tension";
}

export type StageReference = { symbol: string; value: number };

/** One load case as the Stage reads it, in display units (kN, kN m). */
export type StageView = {
  key: StageCase;
  name: string;
  clause: string;
  /** the symbol of the resistance, as the glossary writes it */
  symbol: string;
  unit: "kN" | "kN m";
  digits: number;
  value: number;
  /** the reference lines of the bar: A f_y / γ_M0, or M_el and M_pl */
  refs: StageReference[];
  /** ε_csm / ε_y at the strain limit, and the stress there */
  ratio: number;
  stress: number;
  /** true: compression presses on the section; false: tension pulls (the uniform cases) */
  press: boolean;
  /** tension and compression: one strain over the whole section */
  uniform: boolean;
  frames: StageFramesOut;
  /** flat widths and slenderness of the plates (compression, bending); empty for tension and a tube */
  plates: PlateOut[];
  governing: PlateOut | null;
  /** the governing plate, or the whole tube: what sets the strain limit */
  governingLabel: string | null;
  /** "B.16": the formula that gave the resistance */
  formula: string;
  /** B.5 (compression, bending) or null (tension: B.14) */
  strainLimit: StrainLimitOut | null;
  lambdaSymbol: string | null;
  lambda: number | null;
  notes: string[];
  trace: TraceStepOut[];
  /** the plain sentence under the headline, symbols written as in the glossary */
  why: string;
  /** the engine's stress at the limit hardened above f_y: from the last frame */
  hardened: boolean;
  /** the engine's figures for the cards: the stress point, and the resistance */
  figures: { stress: Record<string, unknown>; resistance: Record<string, unknown> | null };
  /** bending: Table B.2 as printed, the used row marked */
  tableB2: BendingParameterRowOut[] | null;
};

/** A figure at a smaller height, for the cards. The server's content is not changed. */
export function compactFigure(figure: Record<string, unknown>, height: number): Record<string, unknown> {
  const layout = (figure.layout as Record<string, unknown> | undefined) ?? {};
  return { ...figure, layout: { ...layout, height } };
}

/** The value of a step of the engine's working by its symbol, or null. */
export function stepValue(trace: TraceStepOut[], symbol: string): number | null {
  return trace.find((step) => step.symbol === symbol)?.value ?? null;
}

function governingOf(plates: PlateOut[]): PlateOut | null {
  return plates.find((plate) => plate.governing) ?? null;
}

/** "3.8 % above" or "41.4 % below", from an engine fraction. */
function aboveBelow(fraction: number, reference: string): string {
  return `${formatPercentOne(fraction)} ${fraction >= 0 ? "above" : "below"} ${reference}.`;
}

export function tensionView(r: TensionResponse): StageView {
  const governs =
    r.governing === "fixed_limit_15"
      ? "the fixed limit 15 governs"
      : "the ductility of the grade, C₁ε_u / ε_y, governs";
  return {
    key: "tension",
    name: CASE_NAMES.tension,
    clause: CASE_CLAUSES.tension,
    symbol: "N_csm,t,Rd",
    unit: "kN",
    digits: 1,
    value: kn(r.resistance),
    refs: [{ symbol: "A f_y / γ_M0", value: kn(r.yield_resistance) }],
    ratio: r.strain_ratio,
    stress: r.design_stress,
    press: false,
    uniform: true,
    frames: r.frames,
    plates: [],
    governing: null,
    governingLabel: null,
    formula: "B.12",
    strainLimit: null,
    lambdaSymbol: null,
    lambda: null,
    notes: r.notes,
    trace: r.trace,
    why:
      `Formula B.12 with the stress f_csm,t = ${formatFixed(r.design_stress, 1)} N/mm², reached at ` +
      `${formatRatio(r.strain_ratio)} times the yield strain (B.14: ${governs}). ` +
      aboveBelow(r.above_yield, "A f_y / γ_M0"),
    hardened: r.strain_ratio > 1,
    figures: { stress: r.figure, resistance: null },
    tableB2: null,
  };
}

export function compressionView(r: CompressionResponse): StageView {
  const plates = r.slenderness.plates;
  const governing = governingOf(plates);
  const name = r.slenderness.governing_label;
  const limit = r.strain_limit;
  const held = limit.capped ? ` The curve gives ${formatRatio(limit.raw_ratio ?? 0)}; the limit is held at ${limit.cap_label} = ${formatFixed(limit.cap, 0)}.` : "";
  const hardening = r.formula === "b16";
  return {
    key: "compression",
    name: CASE_NAMES.compression,
    clause: CASE_CLAUSES.compression,
    symbol: "N_csm,Rd",
    unit: "kN",
    digits: 1,
    value: kn(r.resistance),
    refs: [{ symbol: "A f_y / γ_M0", value: kn(r.yield_resistance) }],
    ratio: r.strain_ratio,
    stress: r.frames.frames[r.frames.frames.length - 1].stress,
    press: true,
    uniform: true,
    frames: r.frames,
    plates,
    governing,
    governingLabel: name,
    formula: r.formula_label,
    strainLimit: limit,
    lambdaSymbol: r.family === "circular_hollow" ? "λ_c,cs" : "λ_p,cs",
    lambda: r.slenderness.value,
    notes: r.notes,
    trace: r.trace,
    why: hardening
      ? `Formula B.16: the ${name} lets the section strain to ${formatRatio(r.strain_ratio)} times yield before it buckles locally, so the stress reaches ${formatFixed(r.design_stress ?? 0, 1)} N/mm².${held} ` +
        aboveBelow(r.above_yield, "A f_y / γ_M0")
      : `Formula B.15: the ${name} buckles locally at ${formatRatio(r.strain_ratio)} times the yield strain, before the steel yields, so the yield resistance is scaled down. ` +
        aboveBelow(r.above_yield, "A f_y / γ_M0"),
    hardened: hardening,
    figures: { stress: r.point_figure, resistance: r.capacity_figure },
    tableB2: null,
  };
}

export function bendingView(r: BendingResponse): StageView {
  const plates = r.slenderness.plates;
  const governing = governingOf(plates);
  const name = r.slenderness.governing_label;
  const limit = r.strain_limit;
  const row = r.table_b2.find((entry) => entry.selected);
  const where = row ? ` (${row.section}${row.axis === "any" ? "" : `, ${row.axis} axis`})` : "";
  const hardening = r.formula === "b20";
  const held = limit.capped ? ` The strain limit is held at ${limit.cap_label} = ${formatFixed(limit.cap, 0)}.` : "";
  return {
    key: "bending",
    name: CASE_NAMES.bending,
    clause: CASE_CLAUSES.bending,
    symbol: "M_csm,c,Rd",
    unit: "kN m",
    digits: 2,
    value: knM(r.resistance),
    refs: [
      { symbol: "M_el", value: knM(r.elastic_moment) },
      { symbol: "M_pl", value: knM(r.plastic_moment) },
    ],
    ratio: r.strain_ratio,
    stress: r.frames.frames[r.frames.frames.length - 1].stress,
    press: true,
    uniform: false,
    frames: r.frames,
    plates,
    governing,
    governingLabel: name,
    formula: r.formula_label,
    strainLimit: limit,
    lambdaSymbol: r.family === "circular_hollow" ? "λ_c,cs" : "λ_p,cs",
    lambda: r.slenderness.value,
    notes: r.notes,
    trace: r.trace,
    why: hardening
      ? `Formula B.20 with α = ${formatFixed(r.alpha, 1)} from Table B.2${where}.${held} ` +
        aboveBelow(r.above_plastic, "the plastic moment M_pl")
      : `Formula B.19: the ${name} buckles locally at ${formatRatio(r.strain_ratio)} times the yield strain, before the steel yields, so the elastic moment is scaled down. ` +
        aboveBelow(r.above_elastic, "the elastic moment M_el"),
    hardened: hardening,
    figures: { stress: r.blocks_figure, resistance: r.moment_figure },
    tableB2: r.table_b2,
  };
}

// --- the slider: frame to frame ----------------------------------------------------------------

export type SliderMark = { index: number; label: string; kind: "unloaded" | "first_yield" | "passes_mpl" | "limit" };

/** The frames that carry a mark, as tick labels along the slider (index is the slider position). */
export function sliderMarks(frames: StageFrameOut[], capped: boolean): SliderMark[] {
  const marks: SliderMark[] = [];
  frames.forEach((frame, index) => {
    for (const mark of frame.marks) {
      if (mark === "unloaded") marks.push({ index, label: "unloaded", kind: mark });
      else if (mark === "first_yield") marks.push({ index, label: "first yield", kind: mark });
      else if (mark === "passes_mpl") marks.push({ index, label: "passes Mₚₗ", kind: mark });
      else {
        const text = formatRatio(frame.ratio);
        marks.push({ index, label: `${capped ? "limit, held at Ω " : "limit "}${text} εᵧ`, kind: mark });
      }
    }
  });
  return marks;
}

/**
 * The marks that fit: left to right, a mark is dropped when it would sit closer than `gap` (a share
 * of the track) to the one before, and the middle marks are dropped when they crowd the limit label.
 */
export function visibleMarks(marks: SliderMark[], count: number, gap: number, endGap: number): SliderMark[] {
  const share = (mark: SliderMark) => (count > 1 ? mark.index / (count - 1) : 0);
  const shown: SliderMark[] = [];
  let last = -Infinity;
  for (const mark of marks) {
    const at = share(mark);
    const edge = mark.kind === "unloaded" || mark.kind === "limit";
    if (!edge && (at - last < gap || at > 1 - endGap)) continue;
    shown.push(mark);
    last = at;
  }
  return shown;
}

/**
 * The frame the "Load it" animation shows at progress `u` (0 to 1): half of the time goes to the
 * first two yield strains, where the picture changes fastest. It lands on a frame the engine
 * returned (the nearest one at or below the target strain). `steps` > 0 jumps in that many equal
 * stops (the reduced-motion setting).
 */
export function playIndex(frames: StageFrameOut[], u: number, steps = 0): number {
  const limit = frames[frames.length - 1].ratio;
  const clamped = Math.min(Math.max(steps > 0 ? Math.round(u * steps) / steps : u, 0), 1);
  const early = Math.min(2, limit) / limit;
  const share = clamped < 0.5 ? (clamped / 0.5) * early : early + ((clamped - 0.5) / 0.5) * (1 - early);
  const target = limit * share;
  let index = 0;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].ratio <= target + 1e-12) index = i;
    else break;
  }
  return u >= 1 ? frames.length - 1 : index;
}

// --- the what-if: a thickness point of the engine's sweep ---------------------------------------

/**
 * The frames of a what-if position (compression): the section's own engine frames below the sweep
 * point's strain limit, then the sweep point itself as the last frame. Both are engine values; the
 * point carries no profiles of its own, and with one strain over the whole section they are two
 * equal numbers. Null beyond the method's limit (no strain limit).
 */
export function whatIfFrames(
  frames: StageFramesOut,
  point: ComparisonPointOut,
): StageFramesOut | null {
  if (point.strain_ratio === null || point.strain === null || point.stress === null) return null;
  const { strain_ratio: ratio, strain, stress } = point;
  const last: StageFrameOut = {
    ratio,
    strain,
    stress,
    // the sweep point has no percentage of its own, and the browser does not divide to make one
    stress_over_yield: null,
    depth: [-1, 1],
    strain_profile: [ratio, ratio],
    stress_profile: [stress, stress],
    resistance: null,
    marks: ["limit"],
  };
  const below = frames.frames
    .filter((frame) => frame.ratio < ratio)
    .map((frame) => ({ ...frame, marks: frame.marks.filter((mark) => mark !== "limit") }));
  return { ...frames, frames: [...below, last] };
}

// --- reading a frame ----------------------------------------------------------------------------

/**
 * The value of a profile at a normalised depth, along the engine's polyline (piecewise linear: the
 * stress block is straight between its corners, so this reads the line, it does not model anything).
 */
export function profileAt(depth: number[], values: number[], at: number): number {
  if (at <= depth[0]) return values[0];
  for (let i = 1; i < depth.length; i += 1) {
    if (at <= depth[i]) {
      const span = depth[i] - depth[i - 1];
      return span === 0 ? values[i] : values[i - 1] + ((values[i] - values[i - 1]) * (at - depth[i - 1])) / span;
    }
  }
  return values[values.length - 1];
}

export type ProfilePart = { sign: 1 | -1; points: [number, number][] };

/**
 * A profile (value against depth) split where it crosses zero, one part per sign, each as
 * [value, depth] points that start and end on the zero line or at a free end. The crossing is on the
 * engine's own straight segment.
 */
export function splitProfile(depth: number[], values: number[]): ProfilePart[] {
  const parts: ProfilePart[] = [];
  let current: ProfilePart | null = null;
  const push = (sign: 1 | -1, value: number, at: number) => {
    if (!current || current.sign !== sign) {
      current = { sign, points: [] };
      parts.push(current);
    }
    current.points.push([value, at]);
  };
  for (let i = 0; i < depth.length; i += 1) {
    const value = values[i];
    if (i > 0) {
      const before = values[i - 1];
      if (before !== 0 && value !== 0 && Math.sign(before) !== Math.sign(value)) {
        const at = depth[i - 1] + ((depth[i] - depth[i - 1]) * before) / (before - value);
        push(before > 0 ? 1 : -1, 0, at);
        push(value > 0 ? 1 : -1, 0, at);
      }
    }
    if (value !== 0) push(value > 0 ? 1 : -1, value, depth[i]);
    else if (current) (current as ProfilePart).points.push([0, depth[i]]);
  }
  return parts.filter((part) => part.points.some(([value]) => value !== 0));
}

/**
 * The part of one signed part of a stress profile that lies beyond f_y, as a closed polygon between
 * the line |σ| = f_y and the profile: the strain-hardening the CSM credits. Empty when the profile
 * stays at or below f_y. The vertices are the engine's own, and the corner where the fibres reach f_y
 * is one of them.
 */
export function hardenedPolygon(part: ProfilePart, fy: number): [number, number][] {
  if (!part.points.some(([value]) => Math.abs(value) > fy + 1e-9)) return [];
  const from = part.points.filter(([value]) => Math.abs(value) >= fy - 1e-9);
  return [[part.sign * fy, from[0][1]], ...from, [part.sign * fy, from[from.length - 1][1]]];
}

// --- the source line under the stage ------------------------------------------------------------

export function sourceLine(source: SourceOut): string {
  return `${source.kind}: ${source.citation}`;
}

/** The section types the stage can turn: only bending about the minor axis needs it. */
export function isTurned(shape: SectionType | null, axis: string | null, key: StageCase): boolean {
  return key === "bending" && axis === "minor" && shape !== null && shape !== "circular hollow section";
}

/**
 * The same frame for hogging: the engine's profiles run from the tension edge (-1) to the compression
 * edge (+1) with compression at the top (sagging). Hogging puts compression at the bottom, so the
 * depth is negated and every profile read in the opposite order. The scalars are magnitudes and stay.
 */
export function mirrorFrame(frame: StageFrameOut): StageFrameOut {
  return {
    ...frame,
    depth: frame.depth.map((d) => (d === 0 ? 0 : -d)).reverse(),
    strain_profile: [...frame.strain_profile].reverse(),
    stress_profile: [...frame.stress_profile].reverse(),
  };
}
