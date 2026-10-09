import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { TensionResponse } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { MaterialProblem } from "../components/MaterialProblem";
import { MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { Working } from "../components/Working";
import { formatKn, formatNumber } from "../lib/format";
import type { MissingItem, ScopeCheck } from "../lib/inputs";

/** The engine adds this note because the tension call alone has no section to check. The page shows
 * the B.2 check from the B.5 result instead, so the note is not repeated. */
const ENGINE_SCOPE_NOTE = "B.2 requires the B.5 cross-section slenderness limits";

export function TensionPage({
  waiting,
  materialProblem,
  scope,
  onGo,
  onOpenMaterial,
  query,
  dark,
}: {
  waiting: MissingItem[];
  scope: ScopeCheck;
  materialProblem: boolean;
  onGo: (item: MissingItem) => void;
  onOpenMaterial: () => void;
  query: UseQueryResult<TensionResponse, ApiError>;
  dark: boolean;
}) {
  const ready = waiting.length === 0 && !materialProblem;
  const result = ready ? query.data : undefined;
  return (
    <section className="results" aria-label="Tension results" aria-busy={query.isFetching}>
      <h2>Tension (B.6.1)</h2>
      <Waiting items={waiting} onGo={onGo} />
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {ready && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
      {ready && !materialProblem ? <ScopeBox scope={scope} onGo={onGo} /> : null}
      {ready && result && !query.isError && scope.state !== "beyond" ? (
        <TensionResults result={result} dark={dark} />
      ) : null}
      {ready && !result && !query.isError ? <p className="muted">Calculating...</p> : null}
    </section>
  );
}

function TensionResults({ result, dark }: { result: TensionResponse; dark: boolean }) {
  return (
    <>
      <p className="muted">Material: {result.material.source}</p>
      <div className="metrics">
        <MetricCard
          title="ε_csm,t / ε_y"
          value={formatNumber(result.strain_ratio)}
          hint={`Formula B.14. Governed by: ${result.governing_label}`}
        />
        <MetricCard
          title="f_csm,t [N/mm²]"
          value={formatNumber(result.design_stress)}
          hint="Formula B.13"
        />
        <MetricCard
          title="N_csm,t,Rd [kN]"
          value={formatKn(result.resistance)}
          hint="Formula B.12"
        />
      </div>
      <p className="muted">{renderSymbols(`${result.governing_label} governs the strain limit (B.14).`)}</p>
      <PlotlyChart
        figure={result.figure}
        dark={dark}
        label="Stress-strain curve with the tension strain limit marked"
      />
      {result.notes.filter((note) => !note.startsWith(ENGINE_SCOPE_NOTE)).map((note) => (
        <StatusBox key={note} kind="info">
          {note}
        </StatusBox>
      ))}
      <Working title="B.6.1" steps={result.trace} clauses={["B.6.1"]} />
      <SymbolsPanel topic="tension" />
    </>
  );
}

/** B.2: whether the B.5 slenderness limit has been checked for this section, and what it found. */
function ScopeBox({ scope, onGo }: { scope: ScopeCheck; onGo: (item: MissingItem) => void }) {
  switch (scope.state) {
    case "within":
      return (
        <StatusBox kind="info">
          {renderSymbols(
            `B.2: the section is within the B.5 limit (${scope.symbol} = ${formatNumber(scope.slenderness)} ≤ ${formatNumber(scope.upper)}), so Annex B applies.`,
          )}
        </StatusBox>
      );
    case "beyond":
      return (
        <StatusBox kind="error">
          {renderSymbols(
            `B.2: the section is beyond the B.5 limit (${scope.symbol} = ${formatNumber(scope.slenderness)} > ${formatNumber(scope.upper)}), so Annex B does not apply and there is no CSM tension resistance.`,
          )}
        </StatusBox>
      );
    case "unchecked":
      return <StatusBox kind="info">{renderSymbols(`B.2: the B.5 slenderness limit could not be checked: ${scope.reason}`)}</StatusBox>;
    case "waiting":
      return (
        <StatusBox kind="info">
          <span>
            {renderSymbols(
              "B.2: Annex B applies only within the B.5 slenderness limits. The tension formulas do not use slenderness, so the result below stands, but the limit is not checked until B.5 has its inputs. Waiting for: ",
            )}
          </span>
          {scope.items.map((item, index) => (
            <span key={`${item.group}/${item.field}`}>
              {index > 0 ? "; " : ""}
              <button type="button" className="link-button" onClick={() => onGo(item)}>
                {renderSymbols(item.label)}
              </button>
            </span>
          ))}
          <span>.</span>
        </StatusBox>
      );
  }
}
