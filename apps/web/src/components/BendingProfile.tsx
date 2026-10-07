import { Figure, T } from "../help/diagrams";
import { formatNumber } from "../lib/format";

const TOP = 62;
const BOTTOM = 262;
const MID = (TOP + BOTTOM) / 2;
const HALF = (BOTTOM - TOP) / 2;
const REACH = 80;

/** Stress over the depth at strain ratio r: the straight B.4 hardening line, or elastic below yield. */
function profile(r: number, fy: number, top: number, hardening: boolean): (t: number) => number {
  return (t) => {
    const level = r * Math.abs(t);
    const sign = t < 0 ? -1 : 1;
    if (level <= 1) return sign * level * fy;
    if (!hardening) return sign * fy;
    return sign * (fy + ((top - fy) * (level - 1)) / (r - 1));
  };
}

/**
 * Strain and stress across the depth of a symmetric section bent until its compression edge
 * reaches the strain limit eps_csm. The strain is a straight line; the stress is read from the
 * material curve at each strain. Dashed: the flat-yield model that stops at f_y. No moment is
 * computed here (that is B.6.3, not built), only the picture of what each model credits.
 */
export function BendingProfile({
  strainRatio,
  fy,
  stress,
}: {
  strainRatio: number;
  fy: number;
  stress: number;
}) {
  const r = strainRatio;
  const scale = REACH / Math.max(stress, fy);
  const strainScale = REACH / Math.max(r, 1);
  const cx1 = 150;
  const cx2 = 380;
  const csm = profile(r, fy, stress, true);
  const flat = profile(r, fy, stress, false);
  const steps = r > 1 ? [-1, -1 / r, 1 / r, 1] : [-1, 1];
  const polygon = (centre: number, f: (t: number) => number) =>
    [`${centre},${MID + HALF}`, ...steps.map((t) => `${centre + f(t) * scale},${MID - t * HALF}`), `${centre},${MID - HALF}`].join(" ");
  const edge = (centre: number, f: (t: number) => number) =>
    steps.map((t) => `${centre + f(t) * scale},${MID - t * HALF}`).join(" ");
  const strainPoly = `${cx1},${TOP} ${cx1 + r * strainScale},${TOP} ${cx1 - r * strainScale},${BOTTOM} ${cx1},${BOTTOM}`;
  const gain = (stress / fy - 1) * 100;
  const above = r > 1;

  return (
    <Figure
      label="Strain and stress across the depth of a bent section, with the CSM stress and the flat-yield stress"
      caption={
        above
          ? `The strain is a straight line from the centre to ε_csm at the edge. Where it is past ε_y, the CSM reads a higher stress from the hardening line (blue) than the flat-yield model (dashed). The edge stress is ${formatNumber(stress)} N/mm² against f_y = ${formatNumber(fy)} N/mm², ${gain.toFixed(1)} % more. Symmetric section drawn for simplicity; no moment is calculated here.`
          : `This section reaches only ${formatNumber(strainRatio)} ε_y before it buckles locally, so the whole depth stays elastic. Both models agree and the edge stress is ${formatNumber(stress)} N/mm², below f_y = ${formatNumber(fy)} N/mm². Symmetric section drawn for simplicity; no moment is calculated here.`
      }
      width={560}
      height={310}
    >
      <T x={cx1} y={16} className="dg-text dg-strong">strain</T>
      <T x={cx2} y={16} className="dg-text dg-strong">stress</T>
      <line x1={cx1} y1={TOP - 4} x2={cx1} y2={BOTTOM + 4} className="dg-guide" />
      <line x1={cx2} y1={TOP - 4} x2={cx2} y2={BOTTOM + 4} className="dg-guide" />
      <polygon points={strainPoly} className="dg-gap" />
      <polyline points={`${cx1 + r * strainScale},${TOP} ${cx1 - r * strainScale},${BOTTOM}`} className="dg-line dg-orange" />
      {above ? (
        <g>
          <line x1={cx1 + strainScale} y1={TOP} x2={cx1 + strainScale} y2={MID} className="dg-guide dg-dash" />
          <T x={cx1 + strainScale + 4} y={MID + 16} anchor="start" className="dg-text dg-muted">ε_y</T>
        </g>
      ) : null}
      <T x={cx1 + r * strainScale + 6} y={TOP + 4} anchor="start" className="dg-text dg-orange-text">ε_csm</T>
      <T x={cx1 - 8} y={BOTTOM + 20} anchor="end" className="dg-text dg-muted">tension side</T>
      <T x={cx1 + 8} y={TOP - 14} anchor="start" className="dg-text dg-muted">compression side</T>

      <polygon points={polygon(cx2, csm)} className="dg-stress-fill" />
      {above ? <polyline points={edge(cx2, flat)} className="dg-line dg-grey dg-dash" /> : null}
      <polyline points={edge(cx2, csm)} className="dg-line dg-blue" />
      <line x1={cx2 + fy * scale} y1={TOP} x2={cx2 + fy * scale} y2={BOTTOM} className="dg-guide dg-dash" />
      <T x={cx2 + fy * scale + 4} y={MID + 4} anchor="start" className="dg-text dg-muted">f_y</T>
      <T x={cx2 + stress * scale + 6} y={TOP + 4} anchor="start" className="dg-text dg-blue-text">{`σ = ${formatNumber(stress)}`}</T>
      {above ? <T x={cx2 + fy * scale + 8} y={MID + 76} anchor="start" className="dg-text dg-muted">flat yield stops at f_y</T> : null}
    </Figure>
  );
}
