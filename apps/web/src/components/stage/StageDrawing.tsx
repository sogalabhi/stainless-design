import { useState, type MouseEvent } from "react";
import type { StageFrameOut } from "../../api/types";
import { formatFixed, formatPercentOne, formatRatio } from "../../lib/format";
import { profileAt, type StageView } from "../../lib/stage";
import {
  depthY,
  frameShapes,
  probeAt,
  stageLayout,
  strainTicks,
  stressTicks,
} from "../../lib/stageLayout";
import type { StageSection } from "../../lib/stageSection";
import type { PlateRoleKey } from "../../lib/sectionTemplates";
import { StageSectionDrawing } from "../SectionSketch";
import { svgSymbols } from "./svgText";

/**
 * The 2D stage: the section to scale, the strain diagram and the stress diagram, all on one depth axis.
 * Every polygon is drawn from the engine's profiles of the frame; the arrows read the stress along the
 * engine's own polyline. An arrow pointing at the axis line presses (compression); one pointing away
 * pulls (tension).
 */
export function StageDrawing({
  view,
  frame,
  section,
  hogging = false,
  cValues,
  lit,
  fy,
  whatIf,
  limitRatio,
  stressTop,
}: {
  view: StageView;
  frame: StageFrameOut;
  section: StageSection | null;
  /** bending, hogging: the frame is already turned over; the labels follow */
  hogging?: boolean;
  cValues: Partial<Record<PlateRoleKey, number>> | null;
  lit: PlateRoleKey | "tube" | null;
  fy: number;
  /** the what-if thickness factor, or null for the user's section */
  whatIf: number | null;
  /** the largest strain ratio and stress the slider reaches, which fix the scales of the panels */
  limitRatio: number;
  stressTop: number;
}) {
  const [pointerY, setPointerY] = useState<number | null>(null);
  const L = stageLayout(section, limitRatio, stressTop, fy);
  const shapes = frameShapes(L, frame.depth, frame.strain_profile, frame.stress_profile, fy);
  const sign = view.uniform ? (view.press ? 1 : -1) : 1;
  const hard = frame.stress_over_yield !== null;
  const text = (x: number, y: number, parts: string, className = "", anchor?: "start" | "middle" | "end") => (
    <text x={x} y={y} className={className} textAnchor={anchor}>
      {svgSymbols(parts)}
    </text>
  );

  // arrows on the stress diagram: eight fibres down the depth, the stress read along the engine's polyline
  const arrows = Array.from({ length: 8 }, (_, i) => {
    const y = L.top + 22 + i * ((L.bot - L.top - 44) / 7);
    const u = (L.mid - y) / L.halfDepth;
    const value = profileAt(frame.depth, frame.stress_profile, u);
    const length = Math.abs(value) * L.su;
    if (length < 18) return null;
    const press = value > 0;
    const head = 7;
    const tip = press ? L.sx + 2 : L.sx - length + 1;
    const tail = press ? L.sx + length - 1 : L.sx - 2;
    return (
      <g key={i} className="st-arrow" aria-hidden="true">
        <path d={`M${tail.toFixed(1)} ${y.toFixed(1)}H${(tip + head).toFixed(1)}`} />
        <path className="st-arrow-head" d={`M${tip.toFixed(1)} ${y.toFixed(1)}l${head} -3.6v7.2Z`} />
      </g>
    );
  });

  // The fibre under the pointer: a guide across the panels, and its values read from the engine's profiles.
  const probe = pointerY === null ? null : probeAt(L, frame, fy, section ? section.height : null, pointerY);
  const track = (event: MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM?.();
    if (matrix) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      setPointerY(point.matrixTransform(matrix.inverse()).y);
      return;
    }
    const box = svg.getBoundingClientRect();
    if (box.height > 0) setPointerY(((event.clientY - box.top) / box.height) * L.viewH);
  };

  const stressText = formatFixed(Math.abs(frame.stress), 1);
  const strainText = formatRatio(frame.ratio);
  const heading = view.uniform
    ? view.press
      ? "shortening"
      : "lengthening"
    : hogging
      ? "lengthening above, shortening below"
      : "shortening above, lengthening below";

  return (
    <svg
      viewBox={`0 0 ${L.viewW} ${L.viewH}`}
      className="stage-svg"
      onMouseMove={track}
      onMouseLeave={() => setPointerY(null)}
      role="img"
      aria-label={`The section with its strain and stress at ${formatRatio(frame.ratio)} times the yield strain: strain ${strainText} times the yield strain, stress ${stressText} N/mm²`}
    >
      <defs>
        <pattern id="st-hatch-comp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: "var(--comp-soft)" }} />
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--comp-deep)", strokeWidth: 2.2 }} />
        </pattern>
        <pattern id="st-hatch-tens" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: "var(--tens-soft)" }} />
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--tens-deep)", strokeWidth: 2.2 }} />
        </pattern>
      </defs>

      {/* guides through all three panels */}
      <path
        className="st-guide"
        d={`M${L.cx + 10} ${L.top}H${L.gx}M${L.cx + 10} ${L.bot}H${L.gx}M${L.cx + 10} ${L.mid}H${L.gx}`}
      />
      {text(L.gx + 6, L.mid + 4, view.uniform ? "centroid" : "neutral axis", "st-small")}
      {text(24, 22, section ? "Section, to scale (mm)" : "Section", "st-head")}
      {text(L.ex, 22, "Strain", "st-head", "middle")}
      {text(L.sx, 22, "Stress (N/mm²)", "st-head", "middle")}

      {/* the section */}
      {section?.solids ? (
        <g transform={`translate(${L.cx} ${L.mid})`} className="stage-section">
          <g className="sk-section">
            {section.solids.map((solid, i) => (
              <polygon key={i} className="sk-solid" points={solid.outer.map(([x, y]) => `${x * L.scale},${-y * L.scale}`).join(" ")} />
            ))}
          </g>
          {text(0, section.height * L.scale / 2 + 22, `${formatFixed(section.width, 0)} × ${formatFixed(section.height, 0)} mm, from your nodes and links`, "st-small", "middle")}
        </g>
      ) : section ? (
        <g transform={`translate(${L.cx} ${L.mid})`}>
          <StageSectionDrawing
            shape={section.shape}
            fabrication={section.fabrication}
            dims={section.dims}
            turned={section.turned}
            scale={L.scale}
            cValues={cValues}
            lit={lit}
            withValues={whatIf === null}
          />
        </g>
      ) : (
        <g className="st-small">
          {text(L.cx, L.mid - 10, "No section is drawn:", "st-note", "middle")}
          {text(L.cx, L.mid + 8, "no dimensions or links were given", "st-note", "middle")}
          {text(L.cx, L.mid + 26, "(or a typed σ_cr,cs).", "st-note", "middle")}
        </g>
      )}
      {section && view.governing && !whatIf ? (
        <g>
          {text(
            L.cx,
            L.bot + 74,
            `${view.governing.label} governs the strain limit (λ_p = ${formatFixed(view.governing.slenderness, 3)})`,
            "st-bold",
            "middle",
          )}
        </g>
      ) : null}
      {section && whatIf !== null ? text(L.cx, L.bot + 74, `every thickness × ${formatFixed(whatIf, 2)}`, "st-bold", "middle") : null}
      {section && view.key === "compression" && view.governingLabel === "circular hollow section" && !whatIf
        ? text(L.cx, L.bot + 74, "the tube wall sets the strain limit", "st-bold", "middle")
        : null}

      {/* strain panel */}
      <path className="st-ref" d={`M${L.ex - L.eu * L.ratioMax} ${L.top - 8}V${L.bot + 8}M${L.ex + L.eu * L.ratioMax} ${L.top - 8}V${L.bot + 8}`} />
      {strainTicks(L.ratioMax).map((v) => (
        <g key={v}>
          <path className="st-dim" d={`M${L.ex + v * L.eu} ${L.bot + 12}v5`} />
          {v % L.ratioMax === 0 ? text(L.ex + v * L.eu, L.bot + 31, String(Math.abs(v)), "st-num", "middle") : null}
        </g>
      ))}
      {text(L.ex, L.bot + 48, "ε / ε_y", "st-sym", "middle")}
      {shapes.strain.map((part) => (
        <path key={part.sign} d={part.path} className={part.sign > 0 ? "st-comp-f" : "st-tens-f"} />
      ))}
      <path className="st-axis" d={`M${L.ex} ${L.top - 10}V${L.bot + 12}`} />
      {frame.ratio > 0
        ? view.uniform
          ? text(
              L.ex + sign * (frame.ratio * L.eu + 8),
              L.top + 18,
              `${strainText} ε_y`,
              "st-value",
              sign < 0 ? "end" : "start",
            )
          : (
            <>
              {text(L.ex + frame.ratio * L.eu + 8, hogging ? L.bot + 3 : L.top + 5, `${strainText} ε_y`, "st-value")}
              {text(L.ex - frame.ratio * L.eu - 8, hogging ? L.top + 5 : L.bot + 3, `${strainText} ε_y`, "st-value", "end")}
            </>
          )
        : null}
      {text(L.ex + (view.uniform && !view.press ? -10 : 10), L.top - 14, heading, "st-small", view.uniform && !view.press ? "end" : view.uniform ? "start" : "middle")}

      {/* stress panel */}
      <path className="st-ref" d={`M${L.sx - fy * L.su} ${L.top - 8}V${L.bot + 8}M${L.sx + fy * L.su} ${L.top - 8}V${L.bot + 8}`} />
      {stressTicks(L.stressMax).map((v) => (
        <path key={v} className="st-dim" d={`M${L.sx + v * L.su} ${L.bot + 12}v5`} />
      ))}
      {text(L.sx, L.bot + 31, "0", "st-num", "middle")}
      {text(L.sx + fy * L.su, L.bot + 31, `f_y ${formatFixed(fy, 0)}`, "st-num", "middle")}
      {text(L.sx - fy * L.su, L.bot + 31, `f_y ${formatFixed(fy, 0)}`, "st-num", "middle")}
      {text(L.sx - 150, L.bot + 48, "tension pulls", "st-small")}
      {text(L.sx + 150, L.bot + 48, "compression presses", "st-small", "end")}
      {shapes.stress.map((part) => (
        <path key={part.sign} d={part.path} className={part.sign > 0 ? "st-comp-f" : "st-tens-f"} />
      ))}
      {shapes.hardened.map((part) => (
        <g key={part.sign}>
          <path d={part.path} className={part.sign > 0 ? "st-comp-h" : "st-tens-h"} />
          <path className="st-epp" d={`M${part.line.x.toFixed(1)} ${part.line.y1.toFixed(1)}V${part.line.y2.toFixed(1)}`} />
        </g>
      ))}
      {arrows}
      <path className="st-axis" d={`M${L.sx} ${L.top - 10}V${L.bot + 12}`} />
      {frame.ratio > 0
        ? view.uniform
          ? (
            <>
              {text(
                L.sx + sign * (Math.abs(frame.stress) * L.su + 8),
                L.top + 18,
                stressText,
                "st-value",
                sign < 0 ? "end" : "start",
              )}
              {hard && frame.stress_over_yield !== null
                ? text(
                    L.sx + sign * (Math.abs(frame.stress) * L.su + 8),
                    L.top + 34,
                    `+${formatPercentOne(frame.stress_over_yield)} over yield`,
                    "st-small",
                    sign < 0 ? "end" : "start",
                  )
                : null}
            </>
          )
          : (
            <>
              {text(L.sx + Math.abs(frame.stress) * L.su + 8, hogging ? L.bot + 3 : L.top + 5, stressText, "st-value")}
              {text(L.sx - Math.abs(frame.stress) * L.su - 8, hogging ? L.top + 5 : L.bot + 3, stressText, "st-value", "end")}
            </>
          )
        : null}
      {!view.uniform && hard
        ? (() => {
            // the fibres that just reach f_y are the corners the engine returned
            const corner = frame.depth.find((d) => d > 0 && d < 1);
            if (corner === undefined) return null;
            const yUp = depthY(L, corner);
            const yDown = depthY(L, -corner);
            return (
              <g>
                <path
                  className="st-guide st-guide-strong"
                  d={`M${L.ex - 20} ${yUp.toFixed(1)}H${L.gx}M${L.ex - 20} ${yDown.toFixed(1)}H${L.gx}`}
                />
                {text(L.gx + 6, Math.min(yUp + 4, L.mid - 11), "yield fibres", "st-small")}
              </g>
            );
          })()
        : null}
      {probe ? <StageProbeCard L={L} probe={probe} /> : null}
    </svg>
  );
}

/** The guide, the two dots on the diagrams, and a small card with the fibre's values. */
function StageProbeCard({ L, probe }: { L: ReturnType<typeof stageLayout>; probe: NonNullable<ReturnType<typeof probeAt>> }) {
  const above = probe.depth > 0;
  const strainX = L.ex + probe.strainRatio * L.eu;
  const stressX = L.sx + probe.stress * L.su;
  const side = probe.strainRatio === 0 ? "at the neutral axis" : probe.strainRatio > 0 ? "compression" : "tension";
  const lines = [
    probe.z === null
      ? `fibre ${formatFixed(probe.depth, 2)} of the half depth`
      : `z = ${probe.z > 0 ? "+" : ""}${formatFixed(probe.z, 1)} mm from the axis`,
    `ε = ${formatRatio(Math.abs(probe.strainRatio))} ε_y, ${side}`,
    `σ = ${formatFixed(Math.abs(probe.stress), 1)} N/mm² = ${formatFixed(Math.abs(probe.stressOverYield), 2)} f_y`,
  ];
  const width = 218;
  const height = 18 * lines.length + 10;
  // the card sits in the gap between the strain and the stress diagrams, clear of the pointer's guide line
  const x = (L.ex + L.sx) / 2 - width / 2;
  const y = Math.min(Math.max(probe.y + (above ? 10 : -height - 10), 4), L.viewH - height - 4);
  return (
    <g className="st-probe" aria-hidden="true" pointerEvents="none">
      <path className="st-probe-line" d={`M${L.cx} ${probe.y}H${L.gx}`} />
      <circle className="st-probe-dot" cx={strainX} cy={probe.y} r={4} />
      <circle className="st-probe-dot" cx={stressX} cy={probe.y} r={4} />
      <rect className="st-probe-card" x={x} y={y} width={width} height={height} rx={6} />
      {lines.map((line, i) => (
        <text key={line} x={x + 10} y={y + 20 + i * 18} className="st-probe-text">
          {svgSymbols(line)}
        </text>
      ))}
    </g>
  );
}
