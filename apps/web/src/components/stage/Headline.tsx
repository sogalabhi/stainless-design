import { formatFixed } from "../../lib/format";
import type { StageView } from "../../lib/stage";
import { renderSymbols } from "../Symbols";
import { svgSymbols } from "./svgText";

/** The resistance in large type with its symbol and unit, and the one plain sentence that says why. */
export function Headline({ view }: { view: StageView }) {
  return (
    <div className="headline">
      <div className="headline-big">
        <span className="headline-symbol">{renderSymbols(view.symbol)}</span>
        <span className="headline-value">{formatFixed(view.value, view.digits)}</span>
        <span className="headline-unit">{view.unit}</span>
      </div>
      <p className="headline-why">{renderSymbols(view.why)}</p>
    </div>
  );
}

const W = 640;
const X0 = 8;
const X1 = W - 8;

/**
 * The resistance against its references: A f_y / γ_M0 for tension and compression, M_el and M_pl for
 * bending. In bending a triangle follows the slider and marks what the formula gives if the limit
 * were at that frame (the engine's value for the frame).
 */
export function ResultBar({ view, live }: { view: StageView; live: number | null }) {
  const refs = [...view.refs].sort((a, b) => a.value - b.value);
  const max = Math.max(view.value, ...refs.map((ref) => ref.value)) * 1.06;
  const X = (value: number) => X0 + (value / max) * (X1 - X0);
  const y = 30;
  const h = 16;
  const first = refs[0].value;
  const last = refs[refs.length - 1].value;
  const tone = view.key === "bending" ? "ink" : view.press ? "comp" : "tens";
  const filledFirst = Math.min(view.value, first);
  const filledSecond = refs.length > 1 ? Math.min(view.value, last) : filledFirst;
  const label = `${view.symbol.replace(/_/g, " ")} ${formatFixed(view.value, view.digits)} ${view.unit}, against ${refs
    .map((ref) => `${ref.symbol.replace(/_/g, " ")} ${formatFixed(ref.value, view.digits)}`)
    .join(" and ")}`;
  return (
    <div className="result-bar">
      <svg viewBox={`0 0 ${W} 78`} role="img" aria-label={label}>
        <defs>
          {(["comp", "tens"] as const).map((tone) => (
            <pattern key={tone} id={`bar-hatch-${tone}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: `var(--${tone}-soft)` }} />
              <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: `var(--${tone}-deep)`, strokeWidth: 2.2 }} />
            </pattern>
          ))}
        </defs>
        <rect x={X0} y={y} width={X(filledFirst) - X0} height={h} className="bar-steel" />
        {refs.length > 1 && filledSecond > first ? (
          <rect x={X(first) + 2} y={y} width={X(filledSecond) - X(first) - 2} height={h} className="bar-steel-cut" />
        ) : null}
        {view.value > last ? (
          <rect x={X(last) + 2} y={y} width={X(view.value) - X(last) - 2} height={h} className={`bar-over bar-over-${tone}`} />
        ) : null}
        {refs.map((ref, i) => {
          const x = X(ref.value);
          const end = refs.length > 1 && i === 0;
          return (
            <g key={ref.symbol}>
              <line className="st-axis" x1={x} y1={y - 4} x2={x} y2={y + h + 6} />
              <text
                x={x + (end ? -5 : 5)}
                y={y + h + 23}
                textAnchor={end ? "end" : refs.length > 1 ? "start" : "middle"}
                className="st-small"
              >
                {svgSymbols(ref.symbol)}
                <tspan className="st-num">{`  ${formatFixed(ref.value, view.digits)}`}</tspan>
              </text>
            </g>
          );
        })}
        <line className="st-axis" style={{ strokeWidth: 2 }} x1={X(view.value)} y1={y - 8} x2={X(view.value)} y2={y + h + 2} />
        <text x={X(view.value)} y={y - 13} textAnchor="end" className="st-small">
          {svgSymbols(view.symbol)}
          <tspan className="st-value">{`  ${formatFixed(view.value, view.digits)} ${view.unit}`}</tspan>
        </text>
        <text x={X0} y={y - 13} className="st-small">
          0
        </text>
        {live !== null ? (
          <path d="M0 0l-5 8h10z" className="bar-live" transform={`translate(${X(live).toFixed(1)} ${y + h + 1})`}>
            <title>{`Resistance if the limit were at this strain: ${formatFixed(live, view.digits)} ${view.unit}`}</title>
          </path>
        ) : null}
      </svg>
    </div>
  );
}
