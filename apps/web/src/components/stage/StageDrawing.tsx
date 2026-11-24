import { useState, type MouseEvent } from "react";
import type { StageFrameOut } from "../../api/types";
import { formatFixed, formatPercentOne, formatRatio, kn } from "../../lib/format";
import { profileAt, type StageView } from "../../lib/stage";
import {
  depthY,
  frameShapes,
  probeAt,
  stageLayout,
  strainTicks,
  stressTicks,
} from "../../lib/stageLayout";
import { blockToFibre, forceArrows, forceCardLines, readFibre } from "../../lib/stageForces";
import type { StageSection } from "../../lib/stageSection";
import type { PlateRoleKey } from "../../lib/sectionTemplates";
import { StageSectionDrawing } from "../SectionSketch";
import { svgSymbols } from "./svgText";

/**
 * The 2D stage: the section to scale, the strain diagram and the stress diagram, all on one depth axis.
 * Every polygon is drawn from the engine's profiles of the frame; the arrows read the stress along the
 * engine's own polyline. An arrow pointing left presses (compression), one pointing right pulls
 * (tension): the two forces on the cut face are opposite, as the resultants F_c and F_t are.
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
  forces = false,
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
  /** the Forces choice: the resultants of the stress block, as the engine returned them (textbook) */
  forces?: boolean;
}) {
  const [pointerY, setPointerY] = useState<number | null>(null);
  const [overForce, setOverForce] = useState<ForceSide | null>(null);
  const resultants = forces ? (frame.resultants ?? null) : null;
  const axial = forces && view.uniform && frame.axial_force != null ? frame.axial_force : null;
  const L = stageLayout(section, limitRatio, stressTop, fy, resultants !== null || axial !== null);
  const shapes = frameShapes(L, frame.depth, frame.strain_profile, frame.stress_profile, fy);
  const sign = view.uniform ? (view.press ? 1 : -1) : 1;
  // the neutral axis: at mid-depth for a section symmetric about the axis of bending, elsewhere for the
  // rest (the engine finds it from equilibrium); the frame is already turned over for hogging
  const naDepth = view.uniform ? 0 : (frame.neutral_depth ?? 0);
  const naY = depthY(L, naDepth);
  // the strain and stress at the two edges as drawn (they differ when the axis is not at mid-depth)
  const edges = { top: edgeValues(frame, 1), bottom: edgeValues(frame, -1) };
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
    // the force on the cut face: compression points left, pressing in; tension points right, pulling out.
    // The arrow sits in its own block, from the stress value to the axis line.
    const tip = press ? L.sx + 2 : L.sx - 2;
    const tail = press ? L.sx + length - 1 : L.sx - length + 1;
    const lean = press ? head : -head;
    return (
      <g key={i} className="st-arrow" aria-hidden="true">
        <path d={`M${tail.toFixed(1)} ${y.toFixed(1)}H${(tip + lean).toFixed(1)}`} />
        <path className="st-arrow-head" d={`M${tip.toFixed(1)} ${y.toFixed(1)}l${lean} -3.6v7.2Z`} />
      </g>
    );
  });

  // The fibre under the pointer: a guide across the panels, and its values read from the engine's profiles.
  const probe = pointerY === null || overForce !== null ? null : probeAt(L, frame, fy, section ? section.height : null, pointerY, view.frames.ultimate_stress ?? 0);
  // with Forces on, the fibre also says what force reaches it from the nearer edge, and how wide the section is there
  const fibre =
    probe && forces && !view.uniform
      ? readFibre(
          view.frames.fibre_depth ?? [],
          view.frames.fibre_width ?? [],
          frame.fibre_force,
          hogging ? -probe.depth : probe.depth,
        )
      : null;
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
        d={`M${L.cx + 10} ${L.top}H${L.gx}M${L.cx + 10} ${L.bot}H${L.gx}M${L.cx + 10} ${naY}H${L.gx}`}
      />
      {text(L.gx + 6, naY + 4, view.uniform ? "centroid" : "neutral axis", "st-small")}
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
              {([[edges.top, L.top + 5], [edges.bottom, L.bot + 3]] as const).map(([edge, y]) => {
                const right = edge.strain >= 0;
                return text(
                  L.ex + edge.strain * L.eu + (right ? 8 : -8),
                  y,
                  `${formatRatio(Math.abs(edge.strain))} ε_y`,
                  "st-value",
                  right ? "start" : "end",
                );
              })}
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
              {([[edges.top, L.top + 5], [edges.bottom, L.bot + 3]] as const).map(([edge, y]) => {
                const right = edge.stress >= 0;
                return text(
                  L.sx + edge.stress * L.su + (right ? 8 : -8),
                  y,
                  formatFixed(Math.abs(edge.stress), 1),
                  "st-value",
                  right ? "start" : "end",
                );
              })}
            </>
          )
        : null}
      {!view.uniform && hard
        ? (() => {
            // the fibres that just reach f_y are the interior corners the engine returned: one on each
            // side of the neutral axis for a symmetric section, and as many as yield for any other
            const corners = frame.depth.slice(1, -1).map((d) => depthY(L, d));
            if (corners.length === 0) return null;
            const label = Math.min(...corners.filter((y) => y < naY), naY - 11);
            return (
              <g>
                <path
                  className="st-guide st-guide-strong"
                  d={corners.map((y) => `M${L.ex - 20} ${y.toFixed(1)}H${L.gx}`).join("")}
                />
                {text(L.gx + 6, Math.min(label + 4, naY - 11), "yield fibres", "st-small")}
              </g>
            );
          })()
        : null}
      {resultants && section ? <ForcesColumn L={L} frame={frame} halfMm={section.height / 2} hogging={hogging} neutralDepth={hogging ? -(frame.neutral_depth ?? 0) : (frame.neutral_depth ?? 0)} over={overForce} onOver={setOverForce} /> : null}
      {axial !== null ? <AxialForce L={L} force={axial} /> : null}
      {probe && fibre ? <FibreBlock L={L} frame={frame} depth={probe.depth} /> : null}
      {probe ? <StageProbeCard L={L} probe={probe} fibre={fibre} fy={fy} /> : null}
    </svg>
  );
}

/** The strain (ε/ε_y) and stress (N/mm²) at the top (+1) or bottom (-1) edge of the drawn frame, signed. */
function edgeValues(frame: StageFrameOut, side: 1 | -1): { strain: number; stress: number } {
  const i = side > 0 ? frame.depth.length - 1 : 0;
  return { strain: frame.strain_profile[i], stress: frame.stress_profile[i] };
}

/** The guide, the two dots on the diagrams, and a small card with the fibre's values. */
function StageProbeCard({
  L,
  probe,
  fibre = null,
  fy,
}: {
  L: ReturnType<typeof stageLayout>;
  probe: NonNullable<ReturnType<typeof probeAt>>;
  fibre?: ReturnType<typeof readFibre>;
  fy: number;
}) {
  const above = probe.depth > 0;
  const strainX = L.ex + probe.strainRatio * L.eu;
  const stressX = L.sx + probe.stress * L.su;
  const side = probe.strainRatio === 0 ? "at the neutral axis" : probe.strainRatio > 0 ? "compression" : "tension";
  const lines = [
    probe.z === null
      ? `fibre ${formatFixed(probe.depth, 2)} of the half depth`
      : `z = ${probe.z > 0 ? "+" : ""}${formatFixed(probe.z, 1)} mm from the axis`,
    `ε = ${formatRatio(Math.abs(probe.strainRatio))} ε_y, ${side}`,
    `σ = ${formatFixed(Math.abs(probe.stress), 1)} N/mm² = ${formatFixed(Math.abs(probe.stressOverYield), 2)} f_y` +
      (probe.stressOverUltimate === null ? "" : ` = ${formatFixed(Math.abs(probe.stressOverUltimate), 2)} f_u`),
  ];
  // how many times the flat-yield stress it is at this strain: the gain the strain hardening gives
  if (probe.stressOverClassic !== null) {
    lines.push(`= ${formatFixed(probe.stressOverClassic, 2)} × the flat-yield stress at this strain`);
  }
  if (fibre) {
    const compressive = probe.depth > 0;
    const yielded = Math.abs(probe.stress) >= fy * (1 - 1e-9);
    lines.push(
      `section width here = ${formatFixed(fibre.width, 1)} mm`,
      `force from the ${compressive ? "compression" : "tension"} edge = ${formatFixed(fibre.force / 1000, 1)} kN`,
      probe.strainRatio === 0 ? "at the neutral axis" : yielded ? "yielded: f_y, plus hardening above it" : "still elastic here",
    );
  }
  const width = fibre ? 360 : 300;
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

/**
 * The two resultants of the stress block (Gere Fig. 10-4): C presses on the axis line from the right,
 * T pulls away from it on the left, each at its own distance from the neutral axis, with the lever arm
 * between them. The arrows are all one length; the numbers say how big. Hogging has C below the axis.
 */
function ForcesColumn({
  L,
  frame,
  halfMm,
  hogging,
  neutralDepth,
  over,
  onOver,
}: {
  L: ReturnType<typeof stageLayout>;
  frame: StageFrameOut;
  halfMm: number;
  hogging: boolean;
  /** the neutral axis on the engine's depth scale (before the picture is turned over for hogging) */
  neutralDepth: number;
  /** the force under the pointer, so the fibre's own card can step aside */
  over: ForceSide | null;
  onOver: (side: ForceSide | null) => void;
}) {
  const r = frame.resultants;
  const arrows = r ? forceArrows(L, r, halfMm, hogging, neutralDepth) : null;
  if (!r || !arrows || r.force_compression === 0) return null;
  const head = 8;
  const { fx } = L;
  const { compressionY: yc, tensionY: yt, length } = arrows;
  const dimX = fx + length + 18;
  const compressionLabelY = hogging ? yc + 22 : yc - 9;
  const tensionLabelY = hogging ? yt - 9 : yt + 22;
  return (
    <g className="st-forces" aria-label="The resultant forces of the stress block">
      <text x={fx} y={22} className="st-head" textAnchor="middle">
        Forces (kN)
      </text>
      <path className="st-guide" d={`M${L.gx} ${yc.toFixed(1)}H${fx + length}M${L.gx} ${yt.toFixed(1)}H${fx + length}`} />
      <path className="st-axis" d={`M${fx} ${L.top - 10}V${L.bot + 12}`} />
      {/* C: tail on the right, head on the axis line (presses) */}
      <path className="st-force-line" d={`M${fx + length} ${yc.toFixed(1)}H${fx + head}`} />
      <path className="st-force-head" d={`M${fx + 1} ${yc.toFixed(1)}l${head} -4.5v9Z`} />
      <text x={fx + 6} y={compressionLabelY} className="st-value">
        {svgSymbols(`F_c = ${formatFixed(kn(r.force_compression), 1)}`)}
      </text>
      {/* T: tail on the axis line, head away from it (pulls). Both forces are drawn on the same side of
          the cut, as in the textbook: C points at the face and T points away from it, so they are opposite */}
      <path className="st-force-line" d={`M${fx} ${yt.toFixed(1)}H${fx + length - head}`} />
      <path className="st-force-head" d={`M${fx + length} ${yt.toFixed(1)}l${-head} -4.5v9Z`} />
      <text x={fx + 6} y={tensionLabelY} className="st-value">
        {svgSymbols(`F_t = ${formatFixed(kn(r.force_tension), 1)}`)}
      </text>
      {/* hover: what each force is made of */}
      {(["compression", "tension"] as const).map((side) => {
        const y = side === "compression" ? yc : yt;
        return (
          <rect
            key={side}
            className="st-force-hit"
            x={fx}
            y={y - 16}
            width={length}
            height={32}
            onMouseEnter={() => onOver(side)}
            onMouseLeave={() => onOver(null)}
          />
        );
      })}
      {over ? <ForceCard L={L} lines={forceCardLines(r, over)} y={over === "compression" ? yc : yt} /> : null}
      {/* the lever arm between them */}
      <path className="st-dim" d={`M${dimX} ${yc.toFixed(1)}V${yt.toFixed(1)}M${dimX - 4} ${yc.toFixed(1)}h8M${dimX - 4} ${yt.toFixed(1)}h8`} />
      <text x={dimX + 8} y={L.mid - 2} className="st-small">
        lever arm
      </text>
      <text x={dimX + 8} y={L.mid + 13} className="st-value">
        {formatFixed(r.lever_arm, 1)} mm
      </text>
    </g>
  );
}

/** Tension and compression: one force, at the centroid, σ A (the term of B.12, B.15 and B.16). */
function AxialForce({ L, force }: { L: ReturnType<typeof stageLayout>; force: number }) {
  const press = force > 0;
  const length = 62;
  const head = 8;
  const { fx } = L;
  const y = L.mid;
  // both on the right of the cut: the compression force points at the face, the tension force away from it
  const tail = press ? fx + length : fx + 2;
  const tip = press ? fx + 1 : fx + length;
  return (
    <g className="st-forces" aria-label="The resultant force of the uniform stress">
      <text x={fx} y={22} className="st-head" textAnchor="middle">
        Force (kN)
      </text>
      <path className="st-axis" d={`M${fx} ${L.top - 10}V${L.bot + 12}`} />
      <path className="st-force-line" d={`M${tail} ${y}H${press ? tip + head : tip - head}`} />
      <path className="st-force-head" d={press ? `M${tip} ${y}l${head} -4.5v9Z` : `M${tip} ${y}l${-head} -4.5v9Z`} />
      <text x={fx + 6} y={y - 11} className="st-value">
        {svgSymbols(`${press ? "F_c" : "F_t"} = ${formatFixed(kn(Math.abs(force)), 1)}`)}
      </text>
      <text x={fx + 6} y={y + 22} className="st-small">
        {svgSymbols("σ A at the centroid")}
      </text>
    </g>
  );
}

/** The part of the stress block that the hovered fibre's force is the force of: the edge down to the fibre. */
function FibreBlock({ L, frame, depth }: { L: ReturnType<typeof stageLayout>; frame: StageFrameOut; depth: number }) {
  const points = blockToFibre(frame.depth, depth, (d) => profileAt(frame.depth, frame.stress_profile, d));
  if (points.length === 0) return null;
  const d = points.map(([value, u]) => `${(L.sx + value * L.su).toFixed(1)} ${depthY(L, u).toFixed(1)}`).join("L");
  return <path className="st-fibre-block" d={`M${d}Z`} aria-hidden="true" pointerEvents="none" />;
}

type ForceSide = "compression" | "tension";

function ForceCard({ L, lines, y }: { L: ReturnType<typeof stageLayout>; lines: string[]; y: number }) {
  const width = 300;
  const height = 18 * lines.length + 10;
  const x = L.fx - 24 - width;
  const top = Math.min(Math.max(y - height / 2, 4), L.viewH - height - 4);
  return (
    <g className="st-probe" aria-hidden="true" pointerEvents="none">
      <rect className="st-probe-card" x={x} y={top} width={width} height={height} rx={6} />
      {lines.map((line, i) => (
        <text key={line} x={x + 10} y={top + 20 + i * 18} className="st-probe-text">
          {svgSymbols(line)}
        </text>
      ))}
    </g>
  );
}
