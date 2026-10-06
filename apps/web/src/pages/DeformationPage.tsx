import type { UseQueryResult } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import type { ApiError } from "../api/client";
import type { DeformationResponse, FamilyKey } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { renderSymbols } from "../components/Symbols";
import { MetricCard, NumberField, SelectField, StatusBox } from "../components/ui";
import { Working } from "../components/Working";
import { formatNumber } from "../lib/format";
import {
  GEOMETRY_KINDS,
  missingDeformation,
  type DeformationFormState,
  type PlateRow,
} from "../lib/geometry";

const FAMILIES: { value: FamilyKey; label: string }[] = [
  { value: "flat_plates", label: "Flat plates" },
  { value: "circular_hollow", label: "Circular hollow section" },
];

const ZONE_TEXT = {
  stocky: "Stocky: on the first branch of the base curve",
  slender: "Slender: on the second branch of the base curve",
  not_allowed: "Not allowed: beyond the slenderness limit",
} as const;

export function DeformationPage({
  form,
  onChange,
  query,
  materialReady,
  dark,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
  query: UseQueryResult<DeformationResponse, ApiError>;
  materialReady: boolean;
  dark: boolean;
}) {
  const set = (patch: Partial<DeformationFormState>) => onChange({ ...form, ...patch });
  const result = query.data;
  const missing = missingDeformation(form);
  const complete = missing.length === 0;

  return (
    <div className="page">
      <section className="panel inputs" aria-label="Section inputs">
        <h2>Inputs</h2>
        {result ? <p className="muted">Material: {result.material.source}</p> : null}
        <SelectField
          label="Section"
          value={form.kind}
          options={GEOMETRY_KINDS}
          onChange={(kind) => set({ kind })}
        />
        {form.kind === "chs" ? (
          <>
            <NumberField label="Outer diameter d" unit="mm" value={form.d} onChange={(d) => set({ d })} />
            <NumberField label="Wall thickness t" unit="mm" value={form.t} onChange={(t) => set({ t })} />
          </>
        ) : null}
        {form.kind === "plates" ? <PlatesEditor form={form} onChange={onChange} /> : null}
        {form.kind === "sigma_cr" ? (
          <>
            <NumberField
              label="σ_cr,cs"
              unit="N/mm²"
              value={form.sigmaCr}
              step={10}
              onChange={(sigmaCr) => set({ sigmaCr })}
            />
            <SelectField
              label="Section family"
              value={form.family}
              options={FAMILIES}
              placeholder="choose the family"
              onChange={(family) => set({ family })}
            />
          </>
        ) : null}
        {form.kind !== "sigma_cr" ? (
          <NumberField
            label="Poisson's ratio ν"
            value={form.poissonRatio}
            step={0.05}
            onChange={(poissonRatio) => set({ poissonRatio })}
          />
        ) : null}
        <NumberField
          label="Ω"
          value={form.omega}
          step={1}
          onChange={(omega) => set({ omega })}
        />
      </section>

      <section className="results" aria-label="Deformation capacity results" aria-busy={query.isFetching}>
        <h2>Results</h2>
        {!materialReady ? <StatusBox kind="info">Complete step 1 (Material) first.</StatusBox> : null}
        {materialReady && !complete ? (
          <StatusBox kind="info">{renderSymbols(`Still to enter: ${missing.join("; ")}.`)}</StatusBox>
        ) : null}
        {materialReady && complete && query.isError ? (
          <StatusBox kind="error">{query.error.message}</StatusBox>
        ) : null}
        {materialReady && complete && result && !query.isError ? (
          <DeformationResults result={result} dark={dark} />
        ) : null}
        {materialReady && complete && !result && !query.isError ? (
          <p className="muted">Calculating...</p>
        ) : null}
      </section>
    </div>
  );
}

function DeformationResults({ result, dark }: { result: DeformationResponse; dark: boolean }) {
  const limit = result.strain_limit;
  return (
    <>
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

      {result.slenderness.plates.length > 0 ? (
        <div className="table-wrap">
          <h3>Plates (B.9)</h3>
          <table>
            <thead>
              <tr>
                <th>Plate</th>
                <th>b / t</th>
                <th>{renderSymbols("k_σ")}</th>
                <th>{renderSymbols("σ_cr,p [N/mm²]")}</th>
                <th>{renderSymbols("λ_p")}</th>
              </tr>
            </thead>
            <tbody>
              {result.slenderness.plates.map((plate) => (
                <tr key={plate.label} className={plate.governing ? "selected" : ""}>
                  <td>
                    {plate.label}
                    {plate.governing ? " (most slender)" : ""}
                  </td>
                  <td>{formatNumber(plate.width_to_thickness)}</td>
                  <td>{formatNumber(plate.k_sigma)}</td>
                  <td>{formatNumber(plate.sigma_cr)}</td>
                  <td>{formatNumber(plate.slenderness)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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

function PlatesEditor({
  form,
  onChange,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
}) {
  const update = (id: number, patch: Partial<PlateRow>) =>
    onChange({ ...form, plates: form.plates.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  const add = () => {
    const id = Math.max(0, ...form.plates.map((row) => row.id)) + 1;
    onChange({
      ...form,
      plates: [...form.plates, { id, label: `plate ${id}`, width: null, thickness: null, kSigma: null }],
    });
  };
  return (
    <div className="plates-editor">
      {form.plates.map((row) => (
        <fieldset key={row.id} className="plate-row">
          <legend>{row.label || "plate"}</legend>
          <div className="field">
            <label htmlFor={`plate-label-${row.id}`}>Name</label>
            <input
              id={`plate-label-${row.id}`}
              type="text"
              value={row.label}
              onChange={(event) => update(row.id, { label: event.target.value })}
            />
          </div>
          <NumberField label="Flat width b̄" unit="mm" value={row.width} onChange={(width) => update(row.id, { width })} />
          <NumberField label="Thickness t" unit="mm" value={row.thickness} onChange={(thickness) => update(row.id, { thickness })} />
          <NumberField
            label="k_σ"
            value={row.kSigma}
            step={0.01}
            onChange={(kSigma) => update(row.id, { kSigma })}
          />
          <button
            type="button"
            className="icon-button"
            disabled={form.plates.length <= 1}
            onClick={() => onChange({ ...form, plates: form.plates.filter((item) => item.id !== row.id) })}
          >
            <Trash2 size={16} aria-hidden="true" /> Remove plate
          </button>
        </fieldset>
      ))}
      <button type="button" className="icon-button" onClick={add} disabled={form.plates.length >= 20}>
        <Plus size={16} aria-hidden="true" /> Add plate
      </button>
    </div>
  );
}
