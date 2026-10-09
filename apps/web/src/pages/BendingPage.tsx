import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { BendingParameterRowOut, BendingResponse } from "../api/types";
import { MaterialProblem } from "../components/MaterialProblem";
import { PlotlyChart } from "../components/PlotlyChart";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { Working } from "../components/Working";
import { formatKnM, formatNumber } from "../lib/format";
import type { MissingItem } from "../lib/inputs";

/** The API answers a gate with an error type: a refusal of the standard, or a case not built yet. */
export const NOT_APPLICABLE_ERROR = "NotApplicableError";
export const NOT_BUILT_YET_ERROR = "NotBuiltYetError";

export function BendingPage({
  waiting,
  materialProblem,
  onGo,
  onOpenMaterial,
  query,
  dark,
}: {
  waiting: MissingItem[];
  materialProblem: boolean;
  onGo: (item: MissingItem) => void;
  onOpenMaterial: () => void;
  query: UseQueryResult<BendingResponse, ApiError>;
  dark: boolean;
}) {
  const ready = waiting.length === 0 && !materialProblem;
  const result = ready ? query.data : undefined;
  const error = ready && query.isError ? query.error : null;
  return (
    <section className="results" aria-label="Bending results" aria-busy={query.isFetching}>
      <h2>Bending (B.6.3)</h2>
      <Waiting items={waiting} onGo={onGo} />
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {error ? <BendingGate error={error} /> : null}
      {result && !error ? <BendingResults result={result} dark={dark} /> : null}
      {ready && !result && !error ? <p className="muted">Calculating...</p> : null}
    </section>
  );
}

/** A refusal (λ_LT above 0.4, beyond the B.5 limit) is an error box; a case not built yet is plain information. */
function BendingGate({ error }: { error: ApiError }) {
  if (error.errorType === NOT_BUILT_YET_ERROR) {
    return (
      <StatusBox kind="info">
        <strong>Not built yet.</strong> {renderSymbols(error.message)}
      </StatusBox>
    );
  }
  return <StatusBox kind="error">{renderSymbols(error.message)}</StatusBox>;
}

/** Table B.2 as printed, with the row that gave α lit. */
function TableB2({ rows }: { rows: BendingParameterRowOut[] }) {
  return (
    <div className="table-wrap">
      <h3>Table B.2: CSM bending parameter α</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Cross-section type</th>
            <th scope="col">Axis of bending</th>
            <th scope="col">Aspect ratio</th>
            <th scope="col">{renderSymbols("α")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.section}/${row.axis}/${row.aspect_ratio}`}
              className={row.selected ? "selected" : ""}
              aria-selected={row.selected}
            >
              <td>{row.section}</td>
              <td>{row.axis.charAt(0).toUpperCase() + row.axis.slice(1)}</td>
              <td>{renderSymbols(row.aspect_ratio)}</td>
              <td>{row.alpha.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BendingResults({ result, dark }: { result: BendingResponse; dark: boolean }) {
  const hardening = result.formula === "b20";
  const ratio = formatNumber(result.strain_ratio);
  const governing = result.slenderness.governing_label;
  const symbol = result.family === "circular_hollow" ? "λ_c,cs" : "λ_p,cs";
  return (
    <>
      <p className="muted">Material: {result.material.source}</p>
      <div className="metrics">
        <MetricCard
          title="ε_csm / ε_y"
          value={ratio}
          sub={result.strain_limit.capped ? "held to the cap" : "section in bending"}
          hint="From B.5.1 (Formula B.6 or B.7), with the bending k_σ"
        />
        <MetricCard
          title="α"
          value={result.alpha.toFixed(1)}
          sub={hardening ? "Table B.2, used by B.20" : "Table B.2, not used by B.19"}
          hint="CSM bending parameter, Table B.2"
        />
        <MetricCard
          title="M_csm,c,Rd [kN m]"
          value={formatKnM(result.resistance)}
          sub={`Formula ${result.formula_label}`}
          hint={`Formula ${result.formula_label}`}
        />
      </div>
      <StatusBox kind="info">
        {renderSymbols(
          hardening
            ? `Formula B.20 applies because ε_csm/ε_y = ${ratio} is at least 1.0. The section can strain-harden and use the plastic reserve, so the resistance comes from W_pl, W_el, E_sh/E and α = ${result.alpha.toFixed(1)} (Table B.2).`
            : `Formula B.19 applies because ε_csm/ε_y = ${ratio} is below 1.0. The section buckles before it yields, so the elastic resistance is scaled by the ratio: M_csm,c,Rd = (ε_csm/ε_y) W_el f_y / γ_M0. W_pl and α are not used.`,
        )}
      </StatusBox>
      <p className="muted">
        {renderSymbols(
          `The strain limit is found for the section in bending: ${symbol} = ${formatNumber(result.slenderness.value)}, set by the ${governing}, from the bending k_σ you gave (or the typed σ_cr,cs).`,
        )}
      </p>
      <TableB2 rows={result.table_b2} />
      <h3>Bending resistance against the strain limit</h3>
      <PlotlyChart
        figure={result.moment_figure}
        dark={dark}
        label="Bending resistance against the strain limit ratio: the B.19 branch, the B.20 branch, the elastic and plastic moments as reference lines and your section"
      />
      <h3>Strain and stress across the depth</h3>
      <PlotlyChart
        figure={result.blocks_figure}
        dark={dark}
        label="Strain and stress across the depth of a symmetric section when its compression edge reaches the strain limit"
      />
      {result.notes.map((note) => (
        <StatusBox key={note} kind="info">
          {renderSymbols(note)}
        </StatusBox>
      ))}
      <Working
        title="B.5 and B.6.3"
        steps={result.trace}
        clauses={["8.2.2(5)", "B.5.2", "B.5.1", "B.6.3.1", "B.6.3.2"]}
        alsoSymbols={["c_stem"]}
      />
      <SymbolsPanel topic="bending" />
    </>
  );
}
