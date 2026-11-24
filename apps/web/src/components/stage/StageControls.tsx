import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type { StageFrameOut } from "../../api/types";
import { formatFixed, formatPercentOne, formatRatio, kn, knM } from "../../lib/format";
import { playIndex, sliderMarks, type StageView } from "../../lib/stage";
import { renderSymbols } from "../Symbols";
import { SourceBadge } from "../Working";

const DURATION = 4200;
const REDUCED_STOPS = 6;

/** The reduced-motion setting: the animation jumps in a few stops instead of sweeping. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * The slider from zero strain to this section's limit, with the "Load it" button that plays it. The
 * slider's step is the frame index: it only ever stops on a frame the engine returned.
 */
export function Scrubber({
  frames,
  index,
  onIndex,
  capped,
  playing,
  onPlaying,
  disabled,
}: {
  frames: StageFrameOut[];
  index: number;
  onIndex: (index: number) => void;
  capped: boolean;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
  disabled: boolean;
}) {
  const raf = useRef(0);
  const live = useRef({ frames, onIndex, onPlaying });
  live.current = { frames, onIndex, onPlaying };

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const calm = prefersReducedMotion();
    const step = (now: number) => {
      const u = Math.min(Math.max((now - start) / DURATION, 0), 1);
      const { frames: list, onIndex: setIndex, onPlaying: setPlaying } = live.current;
      setIndex(playIndex(list, u, calm ? REDUCED_STOPS : 0));
      if (u < 1) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  // every mark is labelled: labels that would collide go under the track instead of being dropped
  const marks = useMemo(() => {
    const all = sliderMarks(frames, capped);
    const total = Math.max(frames.length - 1, 1);
    let previous = -Infinity;
    let row = 0;
    return all.map((mark) => {
      const at = mark.index / total;
      row = at - previous < 0.16 ? 1 - row : 0;
      previous = at;
      return { ...mark, below: row === 1 };
    });
  }, [frames, capped]);
  const last = Math.max(frames.length - 1, 1);
  return (
    <div className="scrub">
      <button
        type="button"
        className="play"
        disabled={disabled}
        onClick={() => {
          if (playing) onPlaying(false);
          else {
            onIndex(0);
            onPlaying(true);
          }
        }}
      >
        {playing ? "Stop" : "Load it"}
      </button>
      <div className="track">
        {marks.map((mark) => {
          const share = (mark.index / last) * 100;
          const where = mark.kind === "unloaded" ? "start" : mark.kind === "limit" ? "end" : "";
          return (
            <span
              key={`${mark.kind}-${mark.index}`}
              className={`mark ${where}${mark.below ? " below" : ""}`}
              style={{ left: `calc(${share}% + ${((0.5 - share / 100) * 16).toFixed(1)}px)` }}
            >
              {mark.label}
            </span>
          );
        })}
        <input
          id="stage-scrub"
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          aria-label="Strain at the extreme fibre, from zero to the strain limit of this section"
          aria-valuetext={`${formatRatio(frames[index]?.ratio ?? 0)} times the yield strain`}
          onChange={(event) => {
            onPlaying(false);
            onIndex(Number(event.target.value));
          }}
        />
      </div>
      <label htmlFor="stage-scrub">Strain at the extreme fibre, from zero to this section's limit</label>
    </div>
  );
}

/** Three cells: the strain at the extreme fibre, the stress there, and the resistance. */
export function Readout({
  view,
  frame,
  limit,
  fy,
  whatIf,
  hogging = false,
  halfDepth = null,
  depthMm = null,
}: {
  view: StageView;
  frame: StageFrameOut;
  limit: number;
  fy: number;
  whatIf: boolean;
  /** bending: hogging gives the moment and the curvature a minus sign (Help, Sign convention) */
  hogging?: boolean;
  /** mm from the neutral axis to the extreme fibre as drawn, for the curvature */
  halfDepth?: number | null;
  /** the drawn depth of the section, mm, for the neutral axis' distance from mid-depth */
  depthMm?: number | null;
}) {
  const atLimit = frame.marks.includes("limit");
  const bending = frame.resistance !== null;
  return (
    <div className="readout">
      <div>
        <span className="readout-k">Strain at the extreme fibre</span>
        <span className="readout-v">
          {formatRatio(frame.ratio)} <small>× ε_y = {formatFixed(frame.strain, 5)}</small>
        </span>
        <span className="readout-s">{atLimit ? "at this section's limit" : `below the limit of ${formatRatio(limit)}`}</span>
      </div>
      <div>
        <span className="readout-k">Stress there</span>
        <span className="readout-v">
          {formatFixed(Math.abs(frame.stress), 1)} <small>N/mm²</small>
        </span>
        <span className="readout-s">
          {frame.stress_over_yield !== null
            ? `+${formatPercentOne(frame.stress_over_yield)} over f_y, from strain hardening`
            : frame.ratio > 1
              ? "above f_y, from strain hardening"
              : frame.ratio === 1
                ? `first yield: f_y = ${formatFixed(fy, 0)}`
                : `elastic, below f_y = ${formatFixed(fy, 0)}`}
        </span>
      </div>
      <div>
        {whatIf ? (
          <>
            <span className="readout-k">What-if section</span>
            <span className="readout-v">the engine's sweep point</span>
            <span className="readout-s">Its strain limit and stress are the engine's; the resistance above stays your section's.</span>
          </>
        ) : bending ? (
          <>
            <span className="readout-k">Resistance if the limit were here</span>
            <span className="readout-v">
              {hogging ? "−" : "+"}
              {formatFixed(frame.resistance === null ? 0 : frame.resistance / 1e6, 2)} <small>kN m</small>
            </span>
            <span className="readout-s">
              {frame.ratio < 1 ? "Formula B.19 branch" : "Formula B.20 branch"}, the engine's value for this frame;{" "}
              {hogging ? "hogging, −M" : "sagging, +M"}
            </span>
          </>
        ) : (
          <>
            <span className="readout-k">Resistance at the limit</span>
            <span className="readout-v">
              {formatFixed(view.value, view.digits)} <small>{view.unit}</small>
            </span>
            <span className="readout-s">Formula {view.formula}, the engine's value</span>
          </>
        )}
      </div>
      {bending && !whatIf && halfDepth !== null && halfDepth > 0 ? (
        <div>
          <span className="readout-k">Curvature κ</span>
          <span className="readout-v">
            {hogging ? "−" : "+"}
            {formatFixed((frame.strain / (halfDepth * (1 - (frame.neutral_depth ?? 0)))) * 1000, 4)} <small>1/m</small>
          </span>
          <span className="readout-s">
            {frame.neutral_depth
              ? "κ = ε / (distance from the neutral axis to the extreme compression fibre);"
              : "κ = ε / (h/2), the strain at the extreme fibre over the half depth as drawn;"}{" "}
            {hogging ? "centre of curvature below, −κ" : "centre of curvature above, +κ"}
          </span>
        </div>
      ) : null}
      {bending && !whatIf && frame.neutral_depth && halfDepth !== null && depthMm !== null ? (
        <div>
          <span className="readout-k">Neutral axis</span>
          <span className="readout-v">
            {formatFixed(Math.abs(frame.neutral_depth) * halfDepth, 1)} <small>mm</small>
          </span>
          <span className="readout-s">
            {renderSymbols(
              `from mid-depth, towards the ${frame.neutral_depth > 0 ? "compression" : "tension"} edge: the section is not symmetric about the axis, so equilibrium (∫σ dA = 0) moves it. The extreme tension fibre is at ${formatRatio(Math.abs(frame.strain_profile[0]))} ε_y.`,
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** What the colours, the hatching and the arrows mean. */
export function Legend({ view, withPlate }: { view: StageView; withPlate: boolean }) {
  const swatch = (className: string) => (
    <svg viewBox="0 0 22 12" aria-hidden="true">
      <rect className={className} x="1" y="1" width="20" height="10" />
    </svg>
  );
  const items: { key: string; icon: ReactElement; text: string }[] = [];
  if (!view.uniform || view.press) items.push({ key: "comp", icon: swatch("st-comp-f"), text: "Compression" });
  if (!view.uniform || !view.press) items.push({ key: "tens", icon: swatch("st-tens-f"), text: "Tension" });
  items.push({
    key: "hard",
    icon: swatch(!view.press && view.uniform ? "st-tens-h" : "st-comp-h"),
    text: "Stress above f_y: the strain hardening the CSM credits",
  });
  items.push({
    key: "epp",
    icon: (
      <svg viewBox="0 0 22 12" aria-hidden="true">
        <path className="st-epp" d="M1 6h20" />
      </svg>
    ),
    text: "Where a flat-yield model stops",
  });
  items.push({
    key: "arrow",
    icon: (
      <svg viewBox="0 0 22 12" aria-hidden="true">
        <path className="st-arrow-line" d="M21 6H8" />
        <path className="st-arrow-head" d="M1 6l7 -3.6v7.2Z" />
      </svg>
    ),
    text: "Stress on the cut face: an arrow pointing at the axis line presses, one pointing away pulls",
  });
  if (withPlate) items.push({ key: "plate", icon: swatch("st-lit"), text: "Plate that sets the strain limit" });
  return (
    <ul className="stage-legend" aria-label="Legend">
      {items.map((item) => (
        <li key={item.key}>
          {item.icon}
          <span>{renderSymbols(item.text)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Forces choice: the resultants of the stress block as the engine integrated them (textbook,
 * Gere eqs. 10-3 and 10-4). A picture and a readout, never the resistance: the block's moment is shown
 * beside M_csm,c,Rd with the reasons they are not the same number.
 */
export function ForcesPanel({
  view,
  frame,
  hogging,
}: {
  view: StageView;
  frame: StageFrameOut;
  hogging: boolean;
}) {
  const r = frame.resultants ?? null;
  const sign = hogging ? "−" : "+";
  const working = view.frames.resultants_working ?? [];
  if (view.uniform) {
    if (frame.axial_force == null) return null;
    return (
      <div className="forces-panel">
        <div className="readout">
          <div>
            <span className="readout-k">{view.press ? "Compression force" : "Tension force"}</span>
            <span className="readout-v">
              {formatFixed(kn(Math.abs(frame.axial_force)), 1)} <small>kN</small>
            </span>
            <span className="readout-s">{renderSymbols("σ A: every fibre carries the same stress, so one force acts at the centroid. No integration is needed.")}</span>
          </div>
        </div>
      </div>
    );
  }
  if (!r) {
    return (
      <p className="stage-note muted">
        The forces need the section's outline: with the plates typed one by one, or a typed σ_cr,cs, there is none, so no
        forces are drawn. Use a section type with its dimensions, or the nodes and links.
      </p>
    );
  }
  return (
    <div className="forces-panel">
      <div className="readout">
        <div>
          <span className="readout-k">Compression force</span>
          <span className="readout-v">
            {formatFixed(kn(r.force_compression), 1)} <small>kN</small>
          </span>
          <span className="readout-s">{renderSymbols(`F_c at ${formatFixed(r.distance_compression, 1)} mm from the neutral axis`)}</span>
        </div>
        <div>
          <span className="readout-k">Tension force</span>
          <span className="readout-v">
            {formatFixed(kn(r.force_tension), 1)} <small>kN</small>
          </span>
          <span className="readout-s">{renderSymbols(`F_t at ${formatFixed(r.distance_tension, 1)} mm from the neutral axis`)}</span>
        </div>
        <div>
          <span className="readout-k">Lever arm</span>
          <span className="readout-v">
            {formatFixed(r.lever_arm, 1)} <small>mm</small>
          </span>
          <span className="readout-s">{renderSymbols("d_c + d_t, between the two forces")}</span>
        </div>
        <div>
          <span className="readout-k">Moment of the drawn stress block</span>
          <span className="readout-v">
            {sign}
            {formatFixed(knM(r.moment), 2)} <small>kN m</small>
          </span>
          <span className="readout-s">
            {frame.resistance !== null
              ? renderSymbols(`beside M_csm,c,Rd = ${sign}${formatFixed(knM(frame.resistance), 2)} kN m (B.19 or B.20, if the limit were here)`)
              : "the integral of the stress times the distance"}
          </span>
        </div>
      </div>
      <table className="forces-parts">
        <caption>{renderSymbols("The block in its parts: the elastic core, the part held at f_y, and the part above f_y that the B.4 hardening adds")}</caption>
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Side</th>
            <th scope="col">Force (kN)</th>
            <th scope="col">From the axis (mm)</th>
          </tr>
        </thead>
        <tbody>
          {r.parts.map((part) => (
            <tr key={`${part.side}-${part.name}`}>
              <td>{part.name}</td>
              <td>{part.side}</td>
              <td>{formatFixed(kn(part.force), 1)}</td>
              <td>{formatFixed(part.distance, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="forces-why">
        <summary>{renderSymbols("Why the block's moment is not M_csm,c,Rd")}</summary>
        <ol>
          <li>{renderSymbols("γ_M0 divides the code value; it does not divide the drawn block.")}</li>
          <li>
            {renderSymbols(
              "Formula B.20 is a fitted formula. It equals the integral exactly for a rectangle without hardening; for other shapes and with hardening it lies within about 1 %, on either side.",
            )}
          </li>
          <li>{renderSymbols("W_el and W_pl are typed for B.19 and B.20; the block is integrated over the drawn outline. A table value typed for W differs slightly from the geometry.")}</li>
        </ol>
      </details>
      {working.length > 0 ? (
        <ol className="forces-working" aria-label="Working of the forces at the strain limit">
          {working.map((step) => (
            <li key={step.symbol}>
              <span className="chip">{step.clause}</span> {renderSymbols(step.description)}: {renderSymbols(step.line)}
              <SourceBadge source={step.source} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
