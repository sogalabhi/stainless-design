import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { CompressionResponse } from "../api/types";
import { MaterialProblem } from "../components/MaterialProblem";
import { PlotlyChart } from "../components/PlotlyChart";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { Working } from "../components/Working";
import { formatKn, formatNumber } from "../lib/format";
import type { MissingItem, ScopeCheck } from "../lib/inputs";

export function CompressionPage({
  waiting,
  materialProblem,
  scope,
  onGo,
  onOpenMaterial,
  query,
  dark,
}: {
  waiting: MissingItem[];
  materialProblem: boolean;
  scope: ScopeCheck;
  onGo: (item: MissingItem) => void;
  onOpenMaterial: () => void;
  query: UseQueryResult<CompressionResponse, ApiError>;
  dark: boolean;
}) {
  const ready = waiting.length === 0 && !materialProblem;
  const beyond = ready && scope.state === "beyond";
  const result = ready && !beyond ? query.data : undefined;
  return (
    <section className="results" aria-label="Compression results" aria-busy={query.isFetching}>
      <h2>Compression (B.6.2)</h2>
      <Waiting items={waiting} onGo={onGo} />
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {beyond && scope.state === "beyond" ? (
        <StatusBox kind="error">
          {renderSymbols(
            `B.6.2 does not apply: the section is beyond the B.5 slenderness limit (${scope.symbol} = ${formatNumber(scope.slenderness)} > ${formatNumber(scope.upper)}), so there is no strain limit ε_csm and no CSM compression resistance.`,
          )}
        </StatusBox>
      ) : null}
      {ready && !beyond && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
      {result && !query.isError ? <CompressionResults result={result} dark={dark} /> : null}
      {ready && !beyond && !result && !query.isError ? <p className="muted">Calculating...</p> : null}
    </section>
  );
}

function CompressionResults({ result, dark }: { result: CompressionResponse; dark: boolean }) {
  const hardening = result.formula === "b16";
  const ratio = formatNumber(result.strain_ratio);
  return (
    <>
      <p className="muted">Material: {result.material.source}</p>
      <div className="metrics">
        <MetricCard
          title="ε_csm / ε_y"
          value={ratio}
          sub={result.strain_limit.capped ? "held to the cap" : undefined}
          hint="From B.5.1 (Formula B.6 or B.7)"
        />
        <MetricCard
          title="f_csm [N/mm²]"
          value={result.design_stress === null ? "B.17 not used" : formatNumber(result.design_stress)}
          sub={result.design_stress === null ? "ε_csm/ε_y is below 1.0" : undefined}
          hint="Formula B.17"
        />
        <MetricCard
          title="N_csm,Rd [kN]"
          value={formatKn(result.resistance)}
          sub={`Formula ${result.formula_label}`}
          hint={`Formula ${result.formula_label}`}
        />
      </div>
      <StatusBox kind="info">
        {renderSymbols(
          hardening
            ? `Formula B.16 applies because ε_csm/ε_y = ${ratio} is at least 1.0. The section can strain-harden, so the stress f_csm comes from Formula B.17: N_csm,Rd = A f_csm / γ_M0.`
            : `Formula B.15 applies because ε_csm/ε_y = ${ratio} is below 1.0. The section buckles before it yields, so the yield resistance is scaled by the ratio, and Formula B.17 is not used: N_csm,Rd = (ε_csm/ε_y) A f_y / γ_M0.`,
        )}
      </StatusBox>
      <h3>Resistance against slenderness</h3>
      <PlotlyChart
        figure={result.capacity_figure}
        dark={dark}
        label="Compression resistance against relative slenderness: the B.15 branch, the B.16 branch, the cap and your section"
      />
      <h3>Compression point on the material curve</h3>
      <PlotlyChart
        figure={result.point_figure}
        dark={dark}
        label="Stress-strain curve with the compression point at the strain limit marked"
      />
      {result.notes.map((note) => (
        <StatusBox key={note} kind="info">
          {renderSymbols(note)}
        </StatusBox>
      ))}
      <Working
        title="B.5 and B.6.2"
        steps={result.trace}
        clauses={["8.2.2(5)", "B.5.2", "B.5.1", "B.6.2"]}
        alsoSymbols={["c_stem"]}
      />
      <SymbolsPanel topic="compression" />
    </>
  );
}
