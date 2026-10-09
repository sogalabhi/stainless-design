import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { MaterialModelResponse } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { Collapsible, MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { CoefficientTable, MATERIAL_EXPLAINER, Working } from "../components/Working";
import { formatNumber } from "../lib/format";
import type { MissingItem } from "../lib/inputs";

export function MaterialPage({
  missing,
  onGo,
  query,
  dark,
}: {
  missing: MissingItem[];
  onGo: (item: MissingItem) => void;
  query: UseQueryResult<MaterialModelResponse, ApiError>;
  dark: boolean;
}) {
  const result = missing.length === 0 ? query.data : undefined;

  return (
    <section className="results" aria-label="Material results" aria-busy={query.isFetching}>
      <h2>Material (B.4)</h2>
      <Waiting items={missing} onGo={onGo} />
      {missing.length === 0 && query.isError ? (
        <StatusBox kind="error">{query.error.message}</StatusBox>
      ) : null}
      {result && !query.isError ? (
        <>
          <p className="muted">
            Source: {result.material.source}
            {result.material.note ? `. Note: ${result.material.note}` : ""}
          </p>
          <div className="metrics">
            <MetricCard title="ε_y" value={formatNumber(result.values.yield_strain)} hint="f_y / E" />
            <MetricCard title="ε_u" value={formatNumber(result.values.ultimate_strain)} hint="Formula B.5" />
            <MetricCard
              title="E_sh [N/mm²]"
              value={formatNumber(result.values.strain_hardening_modulus)}
              hint="Formula B.4"
            />
            <MetricCard title="C₁ε_u" value={formatNumber(result.values.strain_limit_c1)} />
            <MetricCard title="σ at C₁ε_u" value={formatNumber(result.values.stress_at_strain_limit_c1)} />
          </div>
          <p className="muted">{renderSymbols(result.hint)}</p>
          <PlotlyChart
            figure={result.figure}
            dark={dark}
            label="Stress-strain curve: CSM bilinear model against the classic elastic-plastic model"
          />
          <Collapsible title="What am I looking at? (plain English)">{MATERIAL_EXPLAINER}</Collapsible>
          <CoefficientTable rows={result.coefficients} />
          <Working title="B.4" steps={result.trace} />
          <SymbolsPanel topic="material" />
        </>
      ) : null}
      {missing.length === 0 && !result && !query.isError ? (
        <p className="muted">Calculating...</p>
      ) : null}
    </section>
  );
}
