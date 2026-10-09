import type { UseQueryResult } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { Suspense, lazy, useMemo, useState } from "react";
import type { ApiError } from "../api/client";
import type { ComparisonResponse } from "../api/types";
import { BendingProfile } from "../components/BendingProfile";
import { PlotlyChart } from "../components/PlotlyChart";
import type { SceneItem } from "../components/SectionScene";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { MaterialProblem } from "../components/MaterialProblem";
import { Collapsible, MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { formatNumber } from "../lib/format";
import { ZONE_LABEL, nearestPoint, sceneSection, wrinkleAmount, withTrace } from "../lib/comparison";
import type { DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";

const SectionScene = lazy(() => import("../components/SectionScene"));

export function VisualisePage({
  waiting,
  materialProblem,
  typedStress,
  onGo,
  onOpenMaterial,
  query,
  form,
  dark,
}: {
  waiting: MissingItem[];
  materialProblem: boolean;
  /** The section is a typed critical stress: nothing to draw, no thickness to change. */
  typedStress: boolean;
  onGo: (item: MissingItem) => void;
  onOpenMaterial: () => void;
  query: UseQueryResult<ComparisonResponse, ApiError>;
  form: DeformationFormState;
  dark: boolean;
}) {
  const ready = waiting.length === 0 && !materialProblem && !typedStress;
  const result = ready ? query.data : undefined;

  return (
    <section className="results" aria-label="Explore" aria-busy={query.isFetching}>
      <h2>Stocky against slender, live</h2>
      <p className="muted">
        These use the same inputs as the dock. Change any value there and every picture below
        redraws; the slider makes the same section thicker or thinner.
      </p>
      {typedStress ? (
        <StatusBox kind="info">
          A typed σ_cr,cs has no plate or tube to draw and no thickness to change. In the
          Deformation group, choose the section dimensions, the diameter and thickness, or flat plates.
        </StatusBox>
      ) : null}
      {!typedStress ? <Waiting items={waiting} onGo={onGo} /> : null}
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {ready && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
      {ready && result && !query.isError ? <Live result={result} form={form} dark={dark} /> : null}
      {ready && !result && !query.isError ? <p className="muted">Calculating...</p> : null}
    </section>
  );
}

function Live({
  result,
  form,
  dark,
}: {
  result: ComparisonResponse;
  form: DeformationFormState;
  dark: boolean;
}) {
  const [factor, setFactor] = useState(1);
  const { points, references, switch: switchAt, upper } = result;
  const index = nearestPoint(points, factor);
  const current = points[index];
  const fy = result.material.fy;
  const marker = dark ? "#e8e8e6" : "#1a1a19";

  const entries = useMemo(() => {
    const list: { item: SceneItem; point: typeof current }[] = [];
    const add = (id: string, label: string, point: typeof current) => {
      const section = sceneSection(form, point.factor);
      if (!section) return;
      const item: SceneItem = {
        id,
        label,
        detail: `λ ${point.slenderness.toFixed(2)} · ${ZONE_LABEL[point.zone]}`,
        section,
        wrinkle: wrinkleAmount(point.slenderness, switchAt, upper),
        zone: point.zone,
        governing: point.governing_label,
      };
      list.push({ item, point });
    };
    add("slider", `Slider × ${current.factor.toFixed(2)}`, current);
    for (const ref of references) add(ref.key, ref.label, ref.point);
    return list;
  }, [form, current, references, switchAt, upper]);
  const items = useMemo(() => entries.map((entry) => entry.item), [entries]);

  const baseFigure = useMemo(
    () =>
      current.strain_ratio === null
        ? result.base_curve_figure
        : withTrace(result.base_curve_figure, {
            type: "scatter",
            x: [current.slenderness],
            y: [current.strain_ratio],
            mode: "markers",
            marker: { color: marker, size: 12, line: { color: dark ? "#1a1a19" : "#ffffff", width: 2 } },
            name: "Slider",
            hoverinfo: "skip",
          }),
    [result.base_curve_figure, current, marker, dark],
  );
  const stressFigure = useMemo(
    () =>
      current.strain === null || current.stress === null
        ? result.stress_figure
        : withTrace(result.stress_figure, {
            type: "scatter",
            x: [current.strain],
            y: [current.stress],
            mode: "markers",
            marker: { color: marker, size: 12, line: { color: dark ? "#1a1a19" : "#ffffff", width: 2 } },
            name: "Slider",
            hoverinfo: "skip",
          }),
    [result.stress_figure, current, marker, dark],
  );

  const gain = current.stress === null ? null : (current.stress / fy - 1) * 100;

  return (
    <>
      <div className="sweep-slider">
        <div className="sweep-slider-row">
          <label htmlFor="thickness-factor">
            <strong>Thickness factor:</strong> every thickness × {current.factor.toFixed(2)}
            {Math.abs(current.factor - 1) < 1e-9 ? " (your section)" : ""}
          </label>
          <button type="button" className="icon-button" onClick={() => setFactor(1)}>
            <Undo2 size={16} aria-hidden="true" /> Back to your section
          </button>
        </div>
        <input
          id="thickness-factor"
          type="range"
          min={0}
          max={points.length - 1}
          step={1}
          value={index}
          aria-valuetext={`thickness times ${current.factor.toFixed(2)}, slenderness ${current.slenderness.toFixed(2)}`}
          onChange={(event) => setFactor(points[Number(event.target.value)].factor)}
        />
        <div className="sweep-slider-row">
          <span className="muted">thinner, more slender</span>
          <span className="muted">thicker, stockier</span>
        </div>
        <div className="sweep-slider-row">
          {references.map((ref) => (
            <button
              key={ref.key}
              type="button"
              className="icon-button"
              onClick={() => setFactor(ref.point.factor)}
            >
              {ref.label}
            </button>
          ))}
        </div>
      </div>

      {current.zone === "not_allowed" ? (
        <StatusBox kind="error">
          {renderSymbols(
            `At this thickness λ_cs = ${current.slenderness.toFixed(3)} is above the limit ${upper} of B.5.1: the section is too slender for the CSM, so there is no strain limit.`,
          )}
        </StatusBox>
      ) : (
        <StatusBox kind="info">
          {ZONE_LABEL[current.zone]}: {current.zone === "stocky" ? "on the first branch of the base curve" : "on the second branch of the base curve"}.
        </StatusBox>
      )}

      <div className="metrics">
        <MetricCard title="thickness factor" value={`× ${current.factor.toFixed(2)}`} />
        <MetricCard title="λ_cs" value={formatNumber(current.slenderness)} hint="Formula B.8 / B.10" />
        <MetricCard
          title="ε_csm / ε_y"
          value={current.strain_ratio === null ? "not allowed" : formatNumber(current.strain_ratio)}
          hint="Formula B.6 / B.7"
        />
        <MetricCard
          title="stress at ε_csm [N/mm²]"
          value={current.stress === null ? "not allowed" : formatNumber(current.stress)}
          sub={gain === null ? undefined : `${gain >= 0 ? "+" : ""}${gain.toFixed(1)} % on f_y`}
          hint="Read from the B.4 curve at ε_csm"
        />
      </div>

      <h3>The same section in 3D</h3>
      <Suspense fallback={<p className="muted">Loading the 3D view...</p>}>
        <SectionScene items={items} dark={dark} />
      </Suspense>
      <p className="muted">
        Drag to turn, scroll to zoom. Blue: stocky, grey: slender, red: beyond the limit of the
        method. All use your widths or diameter and differ only in thickness. The wave size is a
        picture of "more slender, more buckling": the CSM does not calculate a buckled shape.
        Orange arrows mark the compression.
        {form.kind === "template"
          ? " The section is assembled from the dimensions you typed (web and flanges in place, extruded); only the plate the engine reports as governing wrinkles. Fillets and weld triangles are left out of the 3D view."
          : ""}
      </p>
      <div className="legend-cards">
        {entries.map(({ item, point }) => {
          return (
            <div key={item.id} className={`legend-card${item.id === "yours" ? " is-yours" : ""}`}>
              <h4>
                <span className={`swatch swatch-${item.zone}`} aria-hidden="true" />
                {item.label}
              </h4>
              <p>{renderSymbols(`λ_cs = ${formatNumber(point.slenderness)}`)}</p>
              <p>
                {point.strain_ratio === null
                  ? "not allowed"
                  : renderSymbols(`ε_csm/ε_y = ${formatNumber(point.strain_ratio)}`)}
              </p>
              <p>
                {point.stress === null
                  ? "no stress"
                  : `stress ${formatNumber(point.stress)} N/mm²`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="visual-grid">
        <div>
          <h3>Where the section sits on the base curve</h3>
          <PlotlyChart
            figure={baseFigure}
            dark={dark}
            label="Base curve with your section, the reference sections and the slider position"
          />
        </div>
        <div>
          <h3>How far up the material curve it gets</h3>
          <PlotlyChart
            figure={stressFigure}
            dark={dark}
            label="Stress-strain curve with the stress each section is read at, and the slider position"
          />
        </div>
      </div>

      <h3>Bending: what each model credits</h3>
      {current.strain_ratio !== null && current.stress !== null ? (
        <BendingProfile strainRatio={current.strain_ratio} fy={fy} stress={current.stress} />
      ) : (
        <p className="muted">Not shown: at this thickness the section is beyond the limit of the method.</p>
      )}

      <Collapsible title="How to read this page (plain English)">
        <ul className="plain">
          <li>
            <strong>Local buckling</strong> is a thin plate wall wrinkling under compression. The
            thinner the wall for its width, the higher λ_cs and the earlier it wrinkles.
          </li>
          <li>
            <strong>ε_csm / ε_y</strong> is how many times the yield strain the section reaches
            before that happens. A stocky section gets many, up to the cap; a slender one gets
            less than one and stops while still elastic.
          </li>
          <li>
            <strong>The stress graph</strong> reads the material curve at that strain. The dashed
            line is the flat-yield model of ordinary carbon steel (as in IS 800), which gives f_y
            and no more. Only the CSM credits the rise above it.
          </li>
          <li>
            <strong>The bending picture</strong> shows the same idea across the depth: the strain
            is a straight line, and the stress follows the material curve. It shows the stress, not
            a moment, because the bending resistance (B.6.3) is not built yet.
          </li>
        </ul>
      </Collapsible>
      <SymbolsPanel topic="deformation" />
    </>
  );
}
