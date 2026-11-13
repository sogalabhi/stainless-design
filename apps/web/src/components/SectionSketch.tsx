import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { SectionPropertiesResponse, SectionType } from "../api/types";
import { DEFAULT_LAYERS, type SketchLayers } from "../lib/layers";
import { pathData, sectionOutline } from "../lib/sectionOutline";
import {
  ANGLE,
  CHANNEL,
  CHS,
  I_SECTION,
  RHS,
  T_SECTION,
  drawable,
  feasibility,
  needsFabrication,
  sectionFields,
  type DimKey,
  type Fabrication,
  type PlateRoleKey,
  type SketchDims,
} from "../lib/sectionTemplates";

/**
 * The live sketch of a section template. A pure function of the shape, the fabrication, the typed
 * dimensions, the highlighted field and the engine's c values. It never computes an engineering
 * value: every number it prints is one the user typed, or a c the engine returned. The tinted bands
 * only mark where on the plate c is measured; their lengths are drawing positions.
 *
 * Before every dimension is given (or while the shape cannot exist) it is a schematic in fixed
 * proportions, which are a drawing choice and never fill a field. After that it is drawn to scale.
 */

export type SketchProps = {
  shape: SectionType;
  fabrication: Fabrication | null;
  dims: SketchDims;
  /** the field key whose dimension line is highlighted (focused field or hovered line) */
  highlight: DimKey | null;
  /** the engine's flat widths c from the latest B.5 response, per plate role; null if none yet */
  cValues: Partial<Record<PlateRoleKey, number>> | null;
  /** which layers are drawn; the default is dimensions, flat widths, axes and corners */
  layers?: SketchLayers;
  /**
   * The engine's section properties for exactly these dimensions (null if none or out of date). The
   * centroid, plastic neutral axis, shear centre and principal axes are drawn from it, to scale only.
   */
  properties?: SectionPropertiesResponse | null;
  onHover?: (key: DimKey | null) => void;
  onSelect?: (key: DimKey) => void;
};

export const SCHEMATIC_CAPTION = "Schematic: not to scale until every dimension is given";

// Drawing proportions for the schematic. A drawing choice: these never reach a field or the engine.
const SCHEMATIC: Record<string, SketchDims> = {
  [I_SECTION]: { h: 100, b: 60, tw: 8, tf: 12, t: null, d: null, r: 8, s: 8, cStem: null, rO: null },
  [CHANNEL]: { h: 100, b: 50, tw: 8, tf: 12, t: null, d: null, r: 8, s: 8, cStem: null, rO: null },
  [T_SECTION]: { h: 90, b: 80, tw: 10, tf: 12, t: null, d: null, r: 8, s: 8, cStem: 55, rO: null },
  [ANGLE]: { h: 100, b: 70, tw: null, tf: null, t: 12, d: null, r: null, s: null, cStem: null, rO: null },
  [RHS]: { h: 90, b: 60, tw: null, tf: null, t: 8, d: null, r: null, s: null, cStem: null, rO: null },
  [CHS]: { h: null, b: null, tw: null, tf: null, t: 10, d: 90, r: null, s: null, cStem: null, rO: null },
};

const VIEW_W = 340;
const VIEW_H = 262;
const AREA = { left: 76, right: 64, top: 34, bottom: 44 };

const SECTION_LABEL: Record<string, string> = {
  [I_SECTION]: "I-section",
  [CHANNEL]: "Channel",
  [T_SECTION]: "T-section",
  [ANGLE]: "Angle",
  [RHS]: "Rectangular hollow section",
  [CHS]: "Circular hollow section",
};

const SYMBOL: Record<DimKey, string> = {
  h: "h",
  b: "b",
  tw: "t_w",
  tf: "t_f",
  t: "t",
  d: "d",
  r: "r",
  s: "s",
  cStem: "c_stem",
  rO: "r_o",
};

type Pt = [number, number];

/** A symbol such as t_w with a real subscript, inside SVG text. */
function SymText({ name }: { name: string }) {
  const [head, sub] = name.split("_");
  return (
    <>
      {head}
      {sub ? (
        <tspan baselineShift="sub" fontSize="8">
          {sub}
        </tspan>
      ) : null}
    </>
  );
}

function valueText(value: number): string {
  return String(Number(value.toPrecision(6)));
}

type Side = "left" | "right" | "above" | "below";

type Ctx = {
  highlight: DimKey | null;
  onHover?: (key: DimKey | null) => void;
  onSelect?: (key: DimKey) => void;
  toScale: boolean;
  /** the typed value to print after the symbol (to scale only) */
  typed: SketchDims;
  layers: SketchLayers;
  /** the Section Stage: the plate to light (a plate role, or the whole tube) */
  lit?: PlateRoleKey | "tube" | null;
  /** the Section Stage: drawn turned a quarter, so the outline and the lit plate only, no labels */
  turned?: boolean;
};

/** A rectangle [x0, y0, x1, y1] in drawing units, y down. */
type Rect = [number, number, number, number];

/** One dimension line with its label, linked to its field. */
function Dim({
  id,
  a,
  b,
  off = [0, 0],
  overhang = 0,
  side,
  ctx,
  label,
}: {
  id: DimKey;
  a: Pt;
  b: Pt;
  off?: Pt;
  overhang?: number;
  side: Side;
  ctx: Ctx;
  label?: ReactNode;
}) {
  if (!ctx.layers.dimensions || ctx.turned) return null;
  const p1: Pt = [a[0] + off[0], a[1] + off[1]];
  const p2: Pt = [b[0] + off[0], b[1] + off[1]];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const q1: Pt = [p1[0] - ux * overhang, p1[1] - uy * overhang];
  const q2: Pt = [p2[0] + ux * overhang, p2[1] + uy * overhang];
  const mid: Pt = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const nx = -uy * 4;
  const ny = ux * 4;
  const hasOffset = off[0] !== 0 || off[1] !== 0;

  let tx = mid[0];
  let ty = mid[1];
  let anchor: "start" | "middle" | "end" = "middle";
  if (side === "left") {
    tx = Math.min(q1[0], q2[0]) - 5;
    anchor = "end";
    ty = mid[1] + 4;
  } else if (side === "right") {
    tx = Math.max(q1[0], q2[0]) + 5;
    anchor = "start";
    ty = mid[1] + 4;
  } else if (side === "above") {
    ty = Math.min(q1[1], q2[1]) - 5;
  } else {
    ty = Math.max(q1[1], q2[1]) + 13;
  }

  const active = ctx.highlight === id;
  const typed = ctx.typed[id];
  const text =
    label ??
    (ctx.toScale && typed !== null ? (
      <>
        <SymText name={SYMBOL[id]} /> = {valueText(typed)}
      </>
    ) : (
      <SymText name={SYMBOL[id]} />
    ));
  const tick = (p: Pt) => (
    <line x1={p[0] - ny} y1={p[1] + nx} x2={p[0] + ny} y2={p[1] - nx} className="sk-dim-line" />
  );
  return (
    <g
      className={`sk-dim${active ? " is-active" : ""}`}
      data-dim={id}
      onMouseEnter={() => ctx.onHover?.(id)}
      onMouseLeave={() => ctx.onHover?.(null)}
      onClick={() => ctx.onSelect?.(id)}
    >
      {hasOffset ? (
        <>
          <line x1={a[0]} y1={a[1]} x2={p1[0] + (off[0] > 0 ? 3 : off[0] < 0 ? -3 : 0)} y2={p1[1] + (off[1] > 0 ? 3 : off[1] < 0 ? -3 : 0)} className="sk-ext" />
          <line x1={b[0]} y1={b[1]} x2={p2[0] + (off[0] > 0 ? 3 : off[0] < 0 ? -3 : 0)} y2={p2[1] + (off[1] > 0 ? 3 : off[1] < 0 ? -3 : 0)} className="sk-ext" />
        </>
      ) : null}
      <line x1={q1[0]} y1={q1[1]} x2={q2[0]} y2={q2[1]} className="sk-dim-line" />
      {tick(p1)}
      {tick(p2)}
      <line x1={q1[0]} y1={q1[1]} x2={q2[0]} y2={q2[1]} className="sk-hit" />
      <text x={tx} y={ty} textAnchor={anchor} className="sk-text">
        {text}
      </text>
    </g>
  );
}

/** A leader to a corner radius or weld leg, labelled r or s. */
function Leader({ id, from, to, ctx }: { id: DimKey; from: Pt; to: Pt; ctx: Ctx }) {
  if (!ctx.layers.dimensions || ctx.turned) return null;
  const typed = ctx.typed[id];
  return (
    <g
      className={`sk-dim${ctx.highlight === id ? " is-active" : ""}`}
      data-dim={id}
      onMouseEnter={() => ctx.onHover?.(id)}
      onMouseLeave={() => ctx.onHover?.(null)}
      onClick={() => ctx.onSelect?.(id)}
    >
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="sk-dim-line" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="sk-hit" />
      <text x={to[0] + 3} y={to[1] + 4} className="sk-text">
        <SymText name={SYMBOL[id]} />
        {ctx.toScale && typed !== null ? ` = ${valueText(typed)}` : ""}
      </text>
    </g>
  );
}

/** A tinted band on a plate with its symbol and, when the engine gave it, its c. */
function Band({
  rect,
  symbol,
  value,
  at,
  anchor,
  ctx,
}: {
  rect: [number, number, number, number];
  symbol: string;
  value: number | undefined;
  at: Pt;
  anchor: "start" | "middle" | "end";
  ctx: Ctx;
}) {
  if (!ctx.layers.flat || ctx.turned) return null;
  const [x0, y0, x1, y1] = rect;
  return (
    <g className="sk-band" data-band={symbol}>
      <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} />
      <text x={at[0]} y={at[1]} textAnchor={anchor} className="sk-text sk-text-c">
        <SymText name={symbol} />
        {value !== undefined ? ` = ${valueText(value)}` : ""}
      </text>
    </g>
  );
}

type Drawn = { outline: ReactNode; extras: ReactNode; axes: ReactNode; lit: ReactNode };

/** The plate the Stage lights, as solid rectangles (or, for a tube, the ring again). */
function LitPlate({ rects, ctx }: { rects: Rect[]; ctx: Ctx }) {
  if (!ctx.lit) return null;
  return (
    <g className="sk-lit" data-lit={ctx.lit} aria-hidden="true">
      {rects.map(([x0, y0, x1, y1], i) => (
        <rect key={i} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} />
      ))}
    </g>
  );
}

function Axes({ w, h, y = true, z = true }: { w: number; h: number; y?: boolean; z?: boolean }) {
  return (
    <g className="sk-axes" aria-hidden="true">
      {y ? (
        <>
          <line x1={-w / 2 - 14} y1={0} x2={w / 2 + 14} y2={0} />
          <text x={w / 2 + 17} y={4} className="sk-axis-label">y</text>
        </>
      ) : null}
      {z ? (
        <>
          <line x1={0} y1={-h / 2 - 14} x2={0} y2={h / 2 + 14} />
          <text x={0} y={-h / 2 - 18} textAnchor="middle" className="sk-axis-label">z</text>
        </>
      ) : null}
    </g>
  );
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function drawShape(
  shape: SectionType,
  fabrication: Fabrication | null,
  d: SketchDims,
  scale: number,
  ctx: Ctx,
  c: Partial<Record<PlateRoleKey, number>>,
): Drawn {
  const v = (key: DimKey) => (d[key] ?? 0) * scale;
  const rolled = fabrication !== "welded";
  // the outline comes from the one geometry source the 3D view extrudes too, in drawing units
  const scaled = Object.fromEntries(
    Object.entries(d).map(([key, value]) => [key, value === null ? null : value * scale]),
  ) as SketchDims;
  const drawn = sectionOutline(shape, fabrication, scaled, { corners: ctx.layers.corners });

  if (shape === CHS) {
    const ro = v("d") / 2;
    const ri = Math.max(ro - v("t"), 0);
    const ang = Math.PI / 4;
    return {
      outline: <path fillRule="evenodd" d={pathData(drawn.paths)} className="sk-solid" />,
      extras: (
        <>
          <Dim id="d" a={[-ro, 0]} b={[ro, 0]} off={[0, ro + 22]} side="below" ctx={ctx} />
          <Dim
            id="t"
            a={[ri * Math.cos(ang), ri * Math.sin(ang)]}
            b={[ro * Math.cos(ang), ro * Math.sin(ang)]}
            overhang={10}
            side="right"
            ctx={ctx}
          />
        </>
      ),
      axes: <Axes w={2 * ro} h={2 * ro} />,
      lit:
        ctx.lit === "tube" ? (
          <path fillRule="evenodd" d={pathData(drawn.paths)} className="sk-lit-ring" aria-hidden="true" />
        ) : null,
    };
  }

  if (shape === RHS) {
    const H = v("h");
    const B = v("b");
    const T = v("t");
    const x0 = -B / 2;
    const x1 = B / 2;
    const yT = -H / 2;
    const yB = H / 2;
    const bandW = Math.max(H - 3 * T, 0); // where c is measured on the web: a drawing position
    const bandF = Math.max(B - 3 * T, 0);
    // the outer corner radius r_o; the inner one is max(r_o - t, 0). Drawing only: c does not change.
    const ro = drawn.corner;
    const mid = ro * (1 - Math.SQRT1_2);
    return {
      outline: <path fillRule="evenodd" d={pathData(drawn.paths)} className="sk-solid" />,
      extras: (
        <>
          {ro > 0 ? (
            <Leader id="rO" from={[x1 - mid, yT + mid]} to={[x1 + 8, yT - 12]} ctx={ctx} />
          ) : null}
          <Band ctx={ctx} rect={[x1 - T, -bandW / 2, x1, bandW / 2]} symbol="c_w" value={c.web} at={[x1 - T - 4, -8]} anchor="end" />
          <Band ctx={ctx} rect={[-bandF / 2, yT, bandF / 2, yT + T]} symbol="c_f" value={c.flange} at={[x1 - T - 4, yT + T + 13]} anchor="end" />
          <Dim id="h" a={[x0, yT]} b={[x0, yB]} off={[-26, 0]} side="left" ctx={ctx} />
          <Dim id="b" a={[x0, yB]} b={[x1, yB]} off={[0, 24]} side="below" ctx={ctx} />
          <Dim id="t" a={[x1 - T, H * 0.3]} b={[x1, H * 0.3]} overhang={10} side="right" ctx={ctx} />
        </>
      ),
      axes: <Axes w={B} h={H} />,
      lit: (
        <LitPlate
          ctx={ctx}
          rects={
            ctx.lit === "web"
              ? [
                  [x1 - T, yT + T, x1, yB - T],
                  [x0, yT + T, x0 + T, yB - T],
                ]
              : [
                  [x0 + T, yT, x1 - T, yT + T],
                  [x0 + T, yB - T, x1 - T, yB],
                ]
          }
        />
      ),
    };
  }

  if (shape === ANGLE) {
    const H = v("h");
    const B = v("b");
    const T = v("t");
    const x0 = -B / 2;
    const x1 = B / 2;
    const yT = -H / 2;
    const yB = H / 2;
    // the root radius r at the inside corner; drawing only: b-bar = h does not change
    const K = drawn.corner;
    const arcMid = K * (1 - Math.SQRT1_2);
    return {
      outline: <path d={pathData(drawn.paths)} className="sk-solid" />,
      extras: (
        <>
          {K > 0 ? (
            <Leader
              id="r"
              from={[x0 + T + arcMid, yB - T - arcMid]}
              to={[x0 + T + K + 14, yB - T - K - 22]}
              ctx={ctx}
            />
          ) : null}
          <Band ctx={ctx} rect={[x0, yT, x0 + T, yB]} symbol="b̄" value={c.leg} at={[x0 + T + 6, -H * 0.3]} anchor="start" />
          <Dim id="h" a={[x0, yT]} b={[x0, yB]} off={[-26, 0]} side="left" ctx={ctx} />
          <Dim id="b" a={[x0, yB]} b={[x1, yB]} off={[0, 24]} side="below" ctx={ctx} />
          <Dim id="t" a={[x0, H * 0.1]} b={[x0 + T, H * 0.1]} overhang={10} side="right" ctx={ctx} />
        </>
      ),
      axes: null,
      lit: <LitPlate ctx={ctx} rects={[[x0, yT, x0 + T, yB]]} />,
    };
  }

  // I-section, channel and T-section: web, flanges and the corner between them
  const H = v("h");
  const B = v("b");
  const TW = v("tw");
  const TF = v("tf");
  const x0 = -B / 2;
  const x1 = B / 2;
  const yT = -H / 2;
  const yB = H / 2;
  const K = drawn.corner;
  const cornerLabel: DimKey = rolled ? "r" : "s";
  const wL = shape === CHANNEL ? x0 : -TW / 2;
  const wR = shape === CHANNEL ? x0 + TW : TW / 2;

  const outline = (
    <>
      <path d={pathData(drawn.paths)} className="sk-solid" />
      {drawn.welds.map((w, i) => (
        <path key={i} d={pathData([w])} className="sk-solid" />
      ))}
    </>
  );

  const cornerLeader =
    ctx.layers.corners && (K > 0 || !ctx.toScale) ? (
      <Leader
        id={cornerLabel}
        from={[wR + K * 0.3, yT + TF + K * 0.3]}
        to={[wR + Math.max(K, 6) + 8, yT + TF + Math.max(K, 6) + 18]}
        ctx={ctx}
      />
    ) : null;

  const flangeBand = (
    <Band
      ctx={ctx}
      rect={[wR + K, yT, x1, yT + TF]}
      symbol="c_f"
      value={c.flange}
      at={[(wR + K + x1) / 2, yT - 5]}
      anchor="middle"
    />
  );
  const webBand =
    shape === T_SECTION ? null : (
      <Band ctx={ctx} rect={[wL, yT + TF + K, wR, yB - TF - K]} symbol="c_w" value={c.web} at={[wR + 6, -H * 0.08]} anchor="start" />
    );

  const common = (
    <>
      <Dim id="h" a={[x0, yT]} b={[x0, yB]} off={[-26, 0]} side="left" ctx={ctx} />
      <Dim id="tf" a={[x1, yT]} b={[x1, yT + TF]} overhang={9} side="right" ctx={ctx} />
    </>
  );

  if (shape === T_SECTION) {
    const stemPx = Math.min(v("cStem"), H - TF);
    return {
      outline,
      extras: (
        <>
          {flangeBand}
          {ctx.layers.flat ? (
            <g className="sk-band" data-band="c_stem">
              <rect x={wL} y={yB - stemPx} width={wR - wL} height={stemPx} />
            </g>
          ) : null}
          {common}
          <Dim id="b" a={[x0, yT + TF]} b={[x1, yT + TF]} off={[0, H - TF + 24]} side="below" ctx={ctx} />
          <Dim id="tw" a={[wL, yT + TF + (H - TF) * 0.6]} b={[wR, yT + TF + (H - TF) * 0.6]} overhang={10} side="right" ctx={ctx} />
          <Dim
            id="cStem"
            a={[wL, yB - stemPx]}
            b={[wL, yB]}
            off={[-16, 0]}
            side="left"
            ctx={ctx}
            label={
              <>
                <SymText name="c_stem" />
                {ctx.toScale && d.cStem !== null ? ` = ${valueText(d.cStem)}` : ""}
              </>
            }
          />
          {cornerLeader}
        </>
      ),
      axes: <Axes w={B} h={H} y={false} />,
      lit: (
        <LitPlate
          ctx={ctx}
          rects={
            ctx.lit === "stem"
              ? [[wL, yT + TF, wR, yB]]
              : [
                  [x0, yT, wL - K, yT + TF],
                  [wR + K, yT, x1, yT + TF],
                ]
          }
        />
      ),
    };
  }

  const flangeRects: Rect[] =
    shape === CHANNEL
      ? [
          [wR + K, yT, x1, yT + TF],
          [wR + K, yB - TF, x1, yB],
        ]
      : [
          [x0, yT, wL - K, yT + TF],
          [wR + K, yT, x1, yT + TF],
          [x0, yB - TF, wL - K, yB],
          [wR + K, yB - TF, x1, yB],
        ];
  return {
    outline,
    lit: <LitPlate ctx={ctx} rects={ctx.lit === "web" ? [[wL, yT + TF, wR, yB - TF]] : flangeRects} />,
    extras: (
      <>
        {flangeBand}
        {webBand}
        {common}
        <Dim id="b" a={[x0, yB]} b={[x1, yB]} off={[0, 24]} side="below" ctx={ctx} />
        <Dim id="tw" a={[wL, H * 0.2]} b={[wR, H * 0.2]} overhang={10} side="right" ctx={ctx} />
        {cornerLeader}
      </>
    ),
    axes: <Axes w={B} h={H} z={shape !== CHANNEL} />,
  };
}

/** The bounding box of a shape in dimension units, for the scale. */
function extent(shape: SectionType, d: SketchDims): [number, number] {
  if (shape === CHS) return [d.d ?? 1, d.d ?? 1];
  return [d.b ?? 1, d.h ?? 1];
}

/** The scale and the box the sketch is laid out in, from the shape and the dimensions it draws. */
function layout(shape: SectionType, source: SketchDims) {
  const [bw, bh] = extent(shape, source);
  const availW = VIEW_W - AREA.left - AREA.right;
  const availH = VIEW_H - AREA.top - AREA.bottom;
  const scale = Math.min(availW / bw, availH / bh);
  return { bw, bh, scale, cx: AREA.left + availW / 2, cy: AREA.top + availH / 2 };
}

/**
 * What the engine returned, drawn on the section. The engine measures from the lower left corner of
 * the bounding box with z up; the drawing is centred on the box with y down, so a point is only moved,
 * never recalculated. Each layer is drawn only when it is switched on.
 */
function Overlays({
  properties,
  layers,
  bw,
  bh,
  scale,
}: {
  properties: SectionPropertiesResponse;
  layers: SketchLayers;
  bw: number;
  bh: number;
  scale: number;
}) {
  const px = (y: number) => (y - bw / 2) * scale;
  const pz = (z: number) => (bh / 2 - z) * scale;
  const left = px(0) - 14;
  const right = px(bw) + 14;
  const top = pz(bh) - 14;
  const bottom = pz(0) + 14;
  const { centroid, shear_centre: shear, principal } = properties;
  const reach = Math.hypot(bw, bh) * scale * 0.6;
  const along = (degrees: number): Pt => [Math.cos((degrees * Math.PI) / 180), -Math.sin((degrees * Math.PI) / 180)];
  return (
    <>
      {layers.axes ? (
        <g className="sk-axes" data-layer="axes" aria-hidden="true">
          <line x1={left} y1={pz(centroid.z)} x2={right} y2={pz(centroid.z)} />
          <text x={right + 3} y={pz(centroid.z) + 4} className="sk-axis-label">y</text>
          <line x1={px(centroid.y)} y1={top} x2={px(centroid.y)} y2={bottom} />
          <text x={px(centroid.y)} y={top - 4} textAnchor="middle" className="sk-axis-label">z</text>
        </g>
      ) : null}
      {layers.plastic ? (
        <g className="sk-pna" data-layer="plastic" aria-hidden="true">
          <line x1={left} y1={pz(properties.plastic_axis_y)} x2={right} y2={pz(properties.plastic_axis_y)} />
          <text x={left} y={pz(properties.plastic_axis_y) - 3} className="sk-text sk-text-pna">PNA y-y</text>
          <line x1={px(properties.plastic_axis_z)} y1={top} x2={px(properties.plastic_axis_z)} y2={bottom} />
          <text x={px(properties.plastic_axis_z) + 3} y={bottom + 10} className="sk-text sk-text-pna">PNA z-z</text>
        </g>
      ) : null}
      {layers.principal && principal ? (
        <g className="sk-principal" data-layer="principal" aria-hidden="true">
          {(
            [
              ["u", principal.angle_deg],
              ["v", principal.angle_deg + 90],
            ] as const
          ).map(([name, degrees]) => {
            const [ux, uy] = along(degrees);
            const c: Pt = [px(centroid.y), pz(centroid.z)];
            return (
              <g key={name}>
                <line x1={c[0] - ux * reach} y1={c[1] - uy * reach} x2={c[0] + ux * reach} y2={c[1] + uy * reach} />
                <text x={c[0] + ux * reach + 3} y={c[1] + uy * reach + 4} className="sk-text sk-text-principal">
                  {name}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
      {layers.centroid ? (
        <g className="sk-centroid" data-layer="centroid" aria-hidden="true" transform={`translate(${fmt(px(centroid.y))} ${fmt(pz(centroid.z))})`}>
          <circle r={5} />
          <line x1={-5} y1={0} x2={5} y2={0} />
          <line x1={0} y1={-5} x2={0} y2={5} />
        </g>
      ) : null}
      {layers.shear && shear ? (
        <rect
          className="sk-shear"
          data-layer="shear"
          aria-hidden="true"
          x={px(shear.point.y) - 4}
          y={pz(shear.point.z) - 4}
          width={8}
          height={8}
        />
      ) : null}
    </>
  );
}

/** The legend entries of the layers that are on and drawn. */
function Legend({ layers, hasPrincipal }: { layers: SketchLayers; hasPrincipal: boolean }) {
  const icon = (children: ReactNode) => (
    <svg width="18" height="14" viewBox="-9 -7 18 14" aria-hidden="true">
      {children}
    </svg>
  );
  const items: { key: string; icon: ReactNode; text: string }[] = [];
  if (layers.centroid) {
    items.push({
      key: "centroid",
      icon: icon(
        <g className="sk-centroid">
          <circle r={5} />
          <line x1={-5} y1={0} x2={5} y2={0} />
          <line x1={0} y1={-5} x2={0} y2={5} />
        </g>,
      ),
      text: "Centroid",
    });
  }
  if (layers.plastic) {
    items.push({
      key: "plastic",
      icon: icon(<line x1={-8} y1={0} x2={8} y2={0} className="sk-pna-key" />),
      text: "Plastic neutral axis (equal-area line)",
    });
  }
  if (layers.shear) {
    items.push({
      key: "shear",
      icon: icon(<rect className="sk-shear" x={-4} y={-4} width={8} height={8} />),
      text: "Shear centre (thin-walled approximation)",
    });
  }
  if (layers.principal && hasPrincipal) {
    items.push({
      key: "principal",
      icon: icon(<line x1={-8} y1={0} x2={8} y2={0} className="sk-principal-key" />),
      text: "Principal axes u and v",
    });
  }
  if (items.length === 0) return null;
  return (
    <ul className="sk-legend" aria-label="Legend">
      {items.map((item) => (
        <li key={item.key} data-legend={item.key}>
          {item.icon} {item.text}
        </li>
      ))}
    </ul>
  );
}

export function SectionSketch({
  shape,
  fabrication,
  dims,
  highlight,
  cValues,
  layers = DEFAULT_LAYERS,
  properties = null,
  onHover,
  onSelect,
}: SketchProps) {
  const check = feasibility(shape, fabrication, dims);
  const toScale = drawable(check);
  const source: SketchDims = toScale ? dims : { ...(SCHEMATIC[shape] ?? dims) };
  const { bw, bh, scale, cx, cy } = layout(shape, source);
  const ctx: Ctx = { highlight, onHover, onSelect, toScale, typed: dims, layers };
  const drawn = drawShape(shape, fabrication, source, scale, ctx, toScale ? (cValues ?? {}) : {});
  // the engine's values are drawn only on the to-scale sketch, and only for these exact dimensions
  const shown = toScale ? properties : null;

  const typedList = sectionFields(shape, fabrication)
    .filter((f) => dims[f.key] !== null)
    .map((f) => `${f.symbol.replace("_", " ")} = ${dims[f.key]} mm`);
  const fabricationWord = needsFabrication(shape) && fabrication ? `, ${fabrication}` : "";
  const aria = `${SECTION_LABEL[shape]} sketch${fabricationWord}. ${
    toScale ? "Drawn to scale." : "Schematic, not to scale."
  } ${typedList.length > 0 ? `Typed dimensions: ${typedList.join(", ")}.` : "No dimensions typed yet."}`;

  return (
    <figure className="sketch">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={aria} className={toScale ? "sk-scaled" : "sk-schematic"}>
        <g transform={`translate(${fmt(cx)} ${fmt(cy)})`}>
          <g className={toScale ? "sk-section" : "sk-section sk-dashed"}>{drawn.outline}</g>
          {layers.axes && !shown ? drawn.axes : null}
          {drawn.extras}
          {shown ? <Overlays properties={shown} layers={layers} bw={bw} bh={bh} scale={scale} /> : null}
        </g>
      </svg>
      {check.message ? (
        <p className="sketch-message" role="status">
          <CircleAlert size={14} aria-hidden="true" /> {check.message}
        </p>
      ) : null}
      {shown ? <Legend layers={layers} hasPrincipal={shown.principal !== null} /> : null}
      <figcaption className="muted">
        {toScale
          ? cValues && Object.keys(cValues).length > 0
            ? "Drawn to scale. Tinted bands are the flat widths c, as the engine derived them."
            : "Drawn to scale. Tinted bands are where the flat widths c are measured; their values appear once B.5 has been calculated."
          : SCHEMATIC_CAPTION}
      </figcaption>
    </figure>
  );
}

/**
 * The section of the Section Stage: the same outline, dimension lines and flat-width bands as the
 * sketch, to scale (`scale` px per mm), centred on the origin of the group it returns, with the plate
 * that sets the strain limit lit (`lit`: a plate role, or "tube"). A section turned a quarter (bending
 * about the minor axis, so the depth runs up the page) draws the outline and the lit plate and puts its
 * two overall sizes on dimension lines of its own, since the sketch's labels are for the upright shape.
 * The flat widths printed are the engine's (`cValues`); a what-if gives none, and the bands name the
 * widths without a number.
 */
export function StageSectionDrawing({
  shape,
  fabrication,
  dims,
  turned,
  scale,
  cValues,
  lit,
  withValues = true,
}: {
  shape: SectionType;
  fabrication: Fabrication | null;
  dims: SketchDims;
  turned: boolean;
  scale: number;
  cValues: Partial<Record<PlateRoleKey, number>> | null;
  lit: PlateRoleKey | "tube" | null;
  /** print the typed dimension next to each symbol (off in the what-if, where thicknesses changed) */
  withValues?: boolean;
}) {
  const ctx: Ctx = {
    highlight: null,
    toScale: withValues,
    typed: dims,
    // the flat widths c are drawn only where the engine gave them (tension has none)
    layers: { ...DEFAULT_LAYERS, axes: false, flat: cValues !== null && Object.keys(cValues).length > 0 },
    lit,
    turned,
  };
  const drawn = drawShape(shape, fabrication, dims, scale, ctx, cValues ?? {});
  const H = (dims.h ?? 0) * scale;
  const B = (dims.b ?? 0) * scale;
  // turned: the drawn height is b and the drawn width is h
  const overall = turned ? (
    <>
      <Dim id="h" a={[-H / 2, B / 2]} b={[H / 2, B / 2]} off={[0, 24]} side="below" ctx={{ ...ctx, turned: false }} />
      <Dim id="b" a={[-H / 2, -B / 2]} b={[-H / 2, B / 2]} off={[-26, 0]} side="left" ctx={{ ...ctx, turned: false }} />
    </>
  ) : null;
  return (
    <g className="stage-section">
      <g transform={turned ? "rotate(90)" : undefined} className="sk-section">
        {drawn.outline}
        {drawn.lit}
      </g>
      {drawn.extras}
      {overall}
    </g>
  );
}

const THUMB = 52;

/** A small outline of the shape for the dock button: to scale once the dimensions are complete, else a schematic. */
export function SectionThumbnail({
  shape,
  fabrication,
  dims,
}: {
  shape: SectionType;
  fabrication: Fabrication | null;
  dims: SketchDims;
}) {
  const toScale = drawable(feasibility(shape, fabrication, dims));
  const source: SketchDims = toScale ? dims : { ...(SCHEMATIC[shape] ?? dims) };
  const [bw, bh] = extent(shape, source);
  const scale = (THUMB - 8) / Math.max(bw, bh);
  const ctx: Ctx = {
    highlight: null,
    toScale,
    typed: dims,
    layers: { ...DEFAULT_LAYERS, dimensions: false, flat: false, axes: false },
  };
  const drawn = drawShape(shape, fabrication, source, scale, ctx, {});
  return (
    <svg
      className={`sk-thumb ${toScale ? "sk-scaled" : "sk-schematic"}`}
      viewBox={`${-THUMB / 2} ${-THUMB / 2} ${THUMB} ${THUMB}`}
      width={THUMB}
      height={THUMB}
      role="img"
      aria-label={`Thumbnail of the ${SECTION_LABEL[shape].replace(/^(?![IT]-)./, (c) => c.toLowerCase())}${toScale ? "" : ", schematic"}`}
    >
      <g className={toScale ? "sk-section" : "sk-section sk-dashed"}>{drawn.outline}</g>
    </svg>
  );
}
