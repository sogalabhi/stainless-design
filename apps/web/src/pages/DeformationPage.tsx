import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { DeformationResponse } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { renderSymbols } from "../components/Symbols";
import { MaterialProblem } from "../components/MaterialProblem";
import { MetricCard, StatusBox } from "../components/ui";
import { Waiting } from "../components/Waiting";
import { Working } from "../components/Working";
import { formatNumber } from "../lib/format";
import type { MissingItem } from "../lib/inputs";

const ZONE_TEXT = {
  stocky: "Stocky: on the first branch of the base curve",
  slender: "Slender: on the second branch of the base curve",
  not_allowed: "Not allowed: beyond the slenderness limit",
} as const;

export function DeformationPage({
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
  query: UseQueryResult<DeformationResponse, ApiError>;
  dark: boolean;
}) {
  const ready = waiting.length === 0 && !materialProblem;
  const result = query.data;

  return (
    <section className="results" aria-label="Deformation capacity results" aria-busy={query.isFetching}>
      <h2>Deformation capacity (B.5)</h2>
      <Waiting items={waiting} onGo={onGo} />
      {materialProblem ? <MaterialProblem onOpenMaterial={onOpenMaterial} /> : null}
      {ready && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
      {ready && result && !query.isError ? <DeformationResults result={result} dark={dark} /> : null}
      {ready && !result && !query.isError ? <p className="muted">Calculating...</p> : null}
    </section>
  );
}

function DeformationResults({ result, dark }: { result: DeformationResponse; dark: boolean }) {
  const limit = result.strain_limit;
  return (
    <>
      <p className="muted">Material: {result.material.source}</p>
      {limit.allowed ? (
        <StatusBox kind="info">{ZONE_TEXT[limit.zone]}.</StatusBox>
      ) : (
        <StatusBox kind="error">{limit.message}</StatusBox>
      )}
      <div className="metrics">
        <MetricCard
          title="σ_cr,cs [N/mm²]"
          value={formatNumber(result.slenderness.sigma_cr_cs)}
          hint={result.slenderness.source_label}
        />
        <MetricCard title="λ_cs" value={formatNumber(result.slenderness.value)} hint="Formula B.8 / B.10" />
        <MetricCard
          title="ε_csm / ε_y"
          value={limit.strain_ratio === null ? "not allowed" : formatNumber(limit.strain_ratio)}
          sub={limit.capped ? "held to the cap" : undefined}
          hint="Formula B.6 / B.7"
        />
        <MetricCard
          title="ε_csm"
          value={limit.strain === null ? "not allowed" : formatNumber(limit.strain)}
        />
        <MetricCard
          title="cap"
          value={formatNumber(limit.cap)}
          sub={`governed by ${limit.cap_label}`}
          hint="min{Ω ; C₁ε_u / ε_y}"
        />
      </div>

      {result.slenderness.plates.length > 0 ? <PlateTable result={result} /> : null}

      <h3>Base curve</h3>
      <PlotlyChart
        figure={result.figure}
        dark={dark}
        label="Base curve: strain limit ratio against relative slenderness, with your section marked"
      />
      {result.notes.map((note) => (
        <StatusBox key={note} kind="info">
          {renderSymbols(note)}
        </StatusBox>
      ))}
      <Working title="B.5" steps={result.trace} />
      <SymbolsPanel topic="deformation" />
    </>
  );
}

/** The plates B.9 checked. For a section template each row also gives c, its type and where c came from. */
function PlateTable({ result }: { result: DeformationResponse }) {
  const plates = result.slenderness.plates;
  const template = plates.some((plate) => plate.role);
  return (
    <div className="table-wrap">
      <h3>{template ? "Plates from the section dimensions (8.2.2(5), B.9)" : "Plates (B.9)"}</h3>
      <table>
        <thead>
          <tr>
            <th>Plate</th>
            {template ? <th>Type</th> : null}
            {template ? <th>{renderSymbols("c [mm]")}</th> : null}
            {template ? <th>{renderSymbols("t [mm]")}</th> : null}
            <th>{template ? "c / t" : "b / t"}</th>
            <th>{renderSymbols("k_σ")}</th>
            <th>{renderSymbols("σ_cr,p [N/mm²]")}</th>
            <th>{renderSymbols("λ_p")}</th>
            {template ? <th>Where c comes from</th> : null}
          </tr>
        </thead>
        <tbody>
          {plates.map((plate) => (
            <tr key={plate.label} className={plate.governing ? "selected" : ""}>
              <td>
                {plate.label}
                {plate.governing ? " (most slender)" : ""}
              </td>
              {template ? <td>{plate.plate_type}</td> : null}
              {template ? <td>{formatNumber(plate.width)}</td> : null}
              {template ? <td>{formatNumber(plate.thickness)}</td> : null}
              <td>{formatNumber(plate.width_to_thickness)}</td>
              <td>{formatNumber(plate.k_sigma)}</td>
              <td>{formatNumber(plate.sigma_cr)}</td>
              <td>{formatNumber(plate.slenderness)}</td>
              {template ? <td>{plate.c_source}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
