import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type { StageFrameOut } from "../../api/types";
import { formatFixed, formatPercentOne, formatRatio } from "../../lib/format";
import { playIndex, sliderMarks, type StageView } from "../../lib/stage";
import { renderSymbols } from "../Symbols";

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
            {formatFixed((frame.strain / halfDepth) * 1000, 4)} <small>1/m</small>
          </span>
          <span className="readout-s">
            κ = ε / (h/2), the strain at the extreme fibre over the half depth as drawn;{" "}
            {hogging ? "centre of curvature below, −κ" : "centre of curvature above, +κ"}
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
