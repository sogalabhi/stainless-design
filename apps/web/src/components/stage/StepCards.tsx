import { useMemo, type ReactNode } from "react";
import type { ComparisonPointOut, ModelValuesOut } from "../../api/types";
import { formatFixed, formatRatio } from "../../lib/format";
import { compactFigure, stepValue, type StageView } from "../../lib/stage";
import { withTrace } from "../../lib/comparison";
import { TableB2 } from "../../pages/BendingPage";
import { PlotlyChart } from "../PlotlyChart";
import { Sym, renderSymbols } from "../Symbols";
import { Collapsible } from "../ui";
import { Working } from "../Working";
import { svgSymbols } from "./svgText";

const CHART_HEIGHT = 340;

function Io({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <p className="io">
      {from}
      <span className="io-arrow" aria-hidden="true">
        →
      </span>
      {to}
    </p>
  );
}

function Value({ symbol, value, unit }: { symbol: string; value: string; unit?: string }) {
  return (
    <span>
      <Sym text={symbol} /> <span className="io-num">{value}</span>
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

function Head({ n, title, clause }: { n: number; title: string; clause: string }) {
  return (
    <div className="step-head">
      <span className="step-n" aria-hidden="true">
        {n}
      </span>
      <h4>{title}</h4>
      <span className="clause-tag">{clause}</span>
    </div>
  );
}

/** Two bars on one scale, for the cases the engine draws no chart for: the number against its reference. */
function Bars({ rows, label }: { rows: { symbol: string; sub: string; value: number; text: string; tone: "ink" | "tens" }[]; label: string }) {
  const max = Math.max(...rows.map((row) => row.value)) * 1.02;
  const x0 = 150;
  const x1 = 404;
  const X = (value: number) => x0 + (value / max) * (x1 - x0);
  return (
    <svg viewBox={`0 0 420 ${rows.length * 46 + 14}`} className="step-bars" role="img" aria-label={label}>
      {rows.map((row, i) => {
        const y = 12 + i * 46;
        return (
          <g key={row.symbol}>
            <text x={0} y={y + 13} className="st-bold">
              {svgSymbols(row.symbol)}
            </text>
            <text x={0} y={y + 28} className="st-small">
              {row.sub}
            </text>
            <rect x={x0} y={y} width={X(row.value) - x0} height={20} className={row.tone === "tens" ? "st-tens-f" : "bar-steel"} />
            <text x={X(row.value) - 6} y={y + 14} textAnchor="end" className="st-value">
              {row.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * "How the number is reached": three linked cards, each handing one number to the next. 1 How far can
 * it strain (B.5, or B.14 for tension), 2 What stress is that (B.4), 3 What does it resist (B.6.x).
 * Every chart is a figure the engine drew; the working is the engine's, filtered to the step.
 */
export function StepCards({
  view,
  baseFigure,
  values,
  dark,
  whatIf = null,
}: {
  view: StageView;
  /** the B.5 base curve of this load case, when the engine has returned it */
  baseFigure: Record<string, unknown> | null;
  values: ModelValuesOut | null;
  dark: boolean;
  /** a point of the engine's thickness sweep: a ring on the base curve, as the Explore tab draws it */
  whatIf?: ComparisonPointOut | null;
}) {
  const { key } = view;
  // the figures are made once per answer: a new object on every slider step would redraw every chart
  const base = useMemo(() => {
    const figure =
      baseFigure && whatIf && whatIf.strain_ratio !== null
        ? withTrace(baseFigure, {
            type: "scatter",
            x: [whatIf.slenderness],
            y: [whatIf.strain_ratio],
            mode: "markers",
            marker: { color: dark ? "#e8e8e6" : "#1a1a19", size: 12, line: { color: dark ? "#1a1a19" : "#ffffff", width: 2 } },
            name: "What-if thickness",
            hoverinfo: "skip",
          })
        : baseFigure;
    return figure ? compactFigure(figure, CHART_HEIGHT) : null;
  }, [baseFigure, whatIf, dark]);
  const stressFigure = useMemo(() => compactFigure(view.figures.stress, CHART_HEIGHT), [view.figures.stress]);
  const resistanceFigure = useMemo(
    () => (view.figures.resistance ? compactFigure(view.figures.resistance, CHART_HEIGHT) : null),
    [view.figures.resistance],
  );
  const tension = key === "tension";
  const limit = view.strainLimit;
  const limitSymbol = tension ? "ε_csm,t / ε_y" : "ε_csm / ε_y";
  const stressSymbol = tension ? "f_csm,t" : key === "compression" ? "f_csm" : "σ_edge";
  const gov = view.governing;
  const ductility = stepValue(view.trace, "C₁ε_u/ε_y");
  const stressWords =
    values === null
      ? "Past yield the CSM follows the hardening line of B.4. The hatched wedge is stress a flat-yield model leaves out."
      : `Past yield the CSM follows the hardening line, E_sh = ${formatFixed(values.strain_hardening_modulus, 0)} N/mm² (${formatFixed(values.hardening_ratio * 100, 2)} % of E). The hatched wedge is stress a flat-yield model leaves out.`;

  return (
    <section className="chain" aria-label="How the number is reached">
      <h3>How the number is reached</h3>
      <p className="muted chain-lede">
        {tension
          ? "Tension needs no slenderness. The strain limit comes from the grade, the stress from the material curve, the force from the area."
          : "Each step hands one number to the next. The slenderness of the worst plate sets the strain the section can reach; the material curve turns that strain into a stress; the formula turns it into a resistance."}
      </p>
      <div className="steps">
        <article className="step-card" aria-label="Step 1: how far can it strain">
          <Head n={1} title="How far can it strain?" clause={tension ? "B.6.1 · B.14" : "B.5"} />
          {tension ? (
            <>
              <Io
                from={<Value symbol="C₁ε_u / ε_y" value={ductility === null ? "" : formatFixed(ductility, 1)} />}
                to={<Value symbol={limitSymbol} value={formatRatio(view.ratio)} />}
              />
              {ductility !== null ? (
                <Bars
                  label={`The two strain limits of Formula B.14: the fixed limit 15 and the ductility of the grade ${formatFixed(ductility, 1)}`}
                  rows={[
                    { symbol: "fixed limit", sub: view.ratio === 15 ? "governs" : "", value: 15, text: "15", tone: view.ratio === 15 ? "tens" : "ink" },
                    { symbol: "C₁ε_u / ε_y", sub: "ductility of the grade", value: ductility, text: formatFixed(ductility, 1), tone: view.ratio === 15 ? "ink" : "tens" },
                  ]}
                />
              ) : null}
              <p className="step-cap">
                Tension has no buckling, so the limit is the smaller of 15 and the grade's ductility limit.
              </p>
            </>
          ) : (
            <>
              <Io
                from={<Value symbol={view.lambdaSymbol ?? "λ"} value={formatFixed(view.lambda ?? 0, 3)} />}
                to={<Value symbol={limitSymbol} value={formatRatio(view.ratio)} />}
              />
              {base ? (
                <PlotlyChart
                  figure={base}
                  dark={dark}
                  label={`Base curve of B.5 for the ${view.name.toLowerCase()} stress pattern, with this section`}
                />
              ) : (
                <p className="muted step-cap">The base curve is being calculated.</p>
              )}
              <p className="step-cap">
                {gov
                  ? renderSymbols(
                      `The ${gov.label} governs: c / t ${formatFixed(gov.width_to_thickness, 1)}, k_σ ${gov.k_sigma}, σ_cr ${formatFixed(gov.sigma_cr, 0)} N/mm².`,
                    )
                  : renderSymbols(`The ${view.governingLabel ?? "section"} sets the slenderness.`)}
                {limit?.capped
                  ? ` The curve gives ${formatRatio(limit.raw_ratio ?? 0)}; the limit is held at ${limit.cap_label} = ${formatFixed(limit.cap, 0)}.`
                  : ""}
              </p>
              {view.plates.length > 0 ? (
                <div className="table-wrap">
                  <table className="plates">
                    <thead>
                      <tr>
                        <th scope="col">Plate</th>
                        <th scope="col">{renderSymbols("c / t")}</th>
                        <th scope="col">{renderSymbols("k_σ")}</th>
                        <th scope="col">{renderSymbols("σ_cr,p")}</th>
                        <th scope="col">{renderSymbols("λ_p")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.plates.map((plate) => (
                        <tr key={plate.label} className={plate.governing ? "selected" : ""} aria-selected={plate.governing}>
                          <td>
                            {plate.label}
                            {plate.governing ? " (governs)" : ""}
                          </td>
                          <td>{formatFixed(plate.width_to_thickness, 1)}</td>
                          <td>{plate.k_sigma}</td>
                          <td>{formatFixed(plate.sigma_cr, 0)}</td>
                          <td>{formatFixed(plate.slenderness, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
          <Working
            title="step 1"
            steps={view.trace}
            {...(tension
              ? { symbols: ["C₁ε_u/ε_y", "ε_csm,t/ε_y", "ε_csm,t"] }
              : { clauses: ["8.2.2(5)", "B.5.2", "B.5.1"], alsoSymbols: ["c_stem"] })}
          />
        </article>

        <article className="step-card" aria-label="Step 2: what stress is that">
          <Head n={2} title="What stress is that?" clause="B.4" />
          <Io
            from={<Value symbol={limitSymbol} value={formatRatio(view.ratio)} />}
            to={<Value symbol={stressSymbol} value={formatFixed(view.stress, 1)} unit="N/mm²" />}
          />
          <PlotlyChart
            figure={stressFigure}
            dark={dark}
            label={
              key === "bending"
                ? "Strain and stress across the depth when the compression edge reaches the strain limit"
                : `Stress-strain curve with the ${view.name.toLowerCase()} point at the strain limit marked`
            }
          />
          <p className="step-cap">{renderSymbols(stressWords)}</p>
          <Working
            title="step 2"
            steps={view.trace}
            symbols={
              tension
                ? ["ε_y", "ε_u", "E_sh", "f_csm,t"]
                : key === "compression"
                  ? ["ε_y", "ε_u", "E_sh", "f_csm"]
                  : ["ε_y", "ε_u", "E_sh"]
            }
          />
        </article>

        <article className="step-card" aria-label="Step 3: what does it resist">
          <Head n={3} title="What does it resist?" clause={`${view.clause} · ${view.formula}`} />
          {key === "bending" ? (
            <Io
              from={<Value symbol={limitSymbol} value={formatRatio(view.ratio)} />}
              to={<Value symbol={view.symbol} value={formatFixed(view.value, view.digits)} unit={view.unit} />}
            />
          ) : (
            <Io
              from={<Value symbol={stressSymbol} value={formatFixed(view.stress, 1)} unit="N/mm²" />}
              to={<Value symbol={view.symbol} value={formatFixed(view.value, view.digits)} unit={view.unit} />}
            />
          )}
          {resistanceFigure ? (
            <PlotlyChart
              figure={resistanceFigure}
              dark={dark}
              label={
                key === "bending"
                  ? "Bending resistance against the strain limit ratio: the B.19 branch, the B.20 branch, the elastic and plastic moments and your section"
                  : "Compression resistance against relative slenderness: the B.15 branch, the B.16 branch, the cap and your section"
              }
            />
          ) : (
            <Bars
              label={`The tension resistance ${formatFixed(view.value, 1)} kN against the yield resistance ${formatFixed(view.refs[0].value, 1)} kN`}
              rows={[
                { symbol: view.refs[0].symbol, sub: "yield resistance", value: view.refs[0].value, text: `${formatFixed(view.refs[0].value, 1)} kN`, tone: "ink" },
                { symbol: view.symbol, sub: "Formula B.12", value: view.value, text: `${formatFixed(view.value, 1)} kN`, tone: "tens" },
              ]}
            />
          )}
          <p className="step-cap">
            {key === "bending"
              ? renderSymbols("B.19 scales the elastic moment up to first yield. B.20 then climbs past M_pl because the outer fibres keep hardening.")
              : key === "compression"
                ? `Stockier than λ = ${limit?.switch ?? ""}, the section gains on yield (B.16). More slender, it buckles first and B.15 scales the yield resistance down.`
                : "The area times the stress at the limit, over the partial factor."}
          </p>
          {key === "bending" && view.tableB2 ? (
            <>
              <TableB2 rows={view.tableB2.filter((row) => row.selected)} />
              <Collapsible title="Show the whole of Table B.2">
                <TableB2 rows={view.tableB2} />
              </Collapsible>
            </>
          ) : null}
          <Working
            title="step 3"
            steps={view.trace}
            {...(tension
              ? { symbols: ["N_csm,t,Rd"] }
              : key === "compression"
                ? { symbols: ["ε_csm/ε_y vs 1", "N_csm,Rd"] }
                : { clauses: ["B.6.3.1", "B.6.3.2"] })}
          />
        </article>
      </div>
    </section>
  );
}
