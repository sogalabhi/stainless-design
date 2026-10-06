import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { SectionType, TensionResponse } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { CheckField, MetricCard, NumberField, SelectField, StatusBox } from "../components/ui";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { Working } from "../components/Working";
import { formatKn, formatNumber } from "../lib/format";

/** Every number starts empty: nothing is assumed. */
export type TensionFormState = {
  area: number | null; // mm2
  sectionType: SectionType | null; // only a label (B.2); no formula uses it
  hasHoles: boolean;
  gammaM0: number | null;
};

export const defaultTensionForm: TensionFormState = {
  area: null,
  sectionType: null,
  hasHoles: false,
  gammaM0: null,
};

export function missingTension(form: TensionFormState): string[] {
  const missing: string[] = [];
  if (form.area === null) missing.push("the area A");
  if (form.gammaM0 === null) missing.push("γM0");
  return missing;
}

const SECTIONS: { value: SectionType; label: string }[] = [
  { value: "I-section", label: "I-section" },
  { value: "channel", label: "Channel" },
  { value: "T-section", label: "T-section" },
  { value: "angle", label: "Angle" },
  { value: "rectangular hollow section", label: "Rectangular hollow section" },
  { value: "circular hollow section", label: "Circular hollow section" },
];

export function TensionPage({
  form,
  onChange,
  query,
  materialReady,
  dark,
}: {
  form: TensionFormState;
  onChange: (form: TensionFormState) => void;
  query: UseQueryResult<TensionResponse, ApiError>;
  materialReady: boolean;
  dark: boolean;
}) {
  const missing = missingTension(form);
  const ready = materialReady && missing.length === 0;
  const result = ready ? query.data : undefined;
  return (
    <div className="page">
      <section className="panel inputs" aria-label="Tension inputs">
        <h2>Inputs</h2>
        {result ? <p className="muted">Material: {result.material.source}</p> : null}
        <NumberField
          label="Area A"
          unit="mm²"
          value={form.area}
          step={100}
          onChange={(area) => onChange({ ...form, area })}
        />
        <NumberField
          label="γM0"
          value={form.gammaM0}
          step={0.05}
          onChange={(gammaM0) => onChange({ ...form, gammaM0 })}
        />
        <SelectField
          label="Section type (B.2, label only)"
          value={form.sectionType}
          options={SECTIONS}
          placeholder="not specified"
          onChange={(sectionType) => onChange({ ...form, sectionType })}
        />
        <CheckField
          label="Section has holes (bolt holes, slots)"
          checked={form.hasHoles}
          onChange={(hasHoles) => onChange({ ...form, hasHoles })}
        />
      </section>

      <section className="results" aria-label="Tension results" aria-busy={query.isFetching}>
        <h2>Results</h2>
        {!materialReady ? (
          <StatusBox kind="info">Complete step 1 (Material) first.</StatusBox>
        ) : null}
        {materialReady && missing.length > 0 ? (
          <StatusBox kind="info">{renderSymbols(`Still to enter: ${missing.join(", ")}.`)}</StatusBox>
        ) : null}
        {ready && query.isError ? <StatusBox kind="error">{query.error.message}</StatusBox> : null}
        {ready && result && !query.isError ? <TensionResults result={result} dark={dark} /> : null}
        {ready && !result && !query.isError ? <p className="muted">Calculating...</p> : null}
      </section>
    </div>
  );
}

function TensionResults({ result, dark }: { result: TensionResponse; dark: boolean }) {
  return (
    <>
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
      {result.notes.map((note) => (
        <StatusBox key={note} kind="info">
          {note}
        </StatusBox>
      ))}
      <Working title="B.6.1" steps={result.trace} clauses={["B.6.1"]} />
      <SymbolsPanel topic="tension" />
    </>
  );
}
