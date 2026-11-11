import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../../api/client";
import type { ComparisonResponse } from "../../api/types";
import { formatFixed } from "../../lib/format";

/**
 * "What if every thickness changed?": a slider that walks the engine's thickness sweep (the same
 * section-comparison points as the Explore tab, each a full B.5 run). The position is the sweep
 * point's index; the stage then shows that point's engine values.
 */
export function WhatIf({
  sweep,
  yours,
  value,
  onChange,
}: {
  sweep: UseQueryResult<ComparisonResponse, ApiError> | null;
  yours: number;
  value: number;
  onChange: (index: number) => void;
}) {
  if (sweep === null || sweep.isError) {
    return sweep?.isError ? (
      <p className="stage-note muted">The thickness what-if needs the engine's sweep, which failed: {sweep.error.message}</p>
    ) : null;
  }
  const data = sweep.data;
  if (!data && sweep.fetchStatus === "idle") return null;
  if (!data || yours < 0) return <p className="stage-note muted">Loading the engine's thickness sweep...</p>;
  const point = data.points[value];
  return (
    <div className="thick">
      <label htmlFor="stage-thick">
        <span>What if every thickness changed?</span>
        <span className="io-num">
          × {formatFixed(point.factor, 2)}
          {value === yours ? " (your section)" : ` · ${point.zone.replace("_", " ")}`}
        </span>
      </label>
      <input
        id="stage-thick"
        type="range"
        min={0}
        max={data.points.length - 1}
        step={1}
        value={value}
        aria-valuetext={`thickness times ${formatFixed(point.factor, 2)}, slenderness ${formatFixed(point.slenderness, 2)}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="thick-ends">
        <span>thinner, more slender</span>
        <span>engine sweep, {data.points.length} full B.5 runs</span>
        <span>thicker, stockier</span>
      </div>
    </div>
  );
}
