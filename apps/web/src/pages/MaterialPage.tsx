import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { GradeOut, MaterialModelResponse, StainlessFamily } from "../api/types";
import { PlotlyChart } from "../components/PlotlyChart";
import { CheckField, Collapsible, MetricCard, NumberField, SelectField, StatusBox } from "../components/ui";
import { renderSymbols } from "../components/Symbols";
import { SymbolsPanel } from "../components/SymbolsPanel";
import { CoefficientTable, MATERIAL_EXPLAINER, Working } from "../components/Working";
import { formatNumber } from "../lib/format";
import {
  CUSTOM,
  equivalentGrades,
  missingMaterial,
  selectGrade,
  withFu,
  withFy,
  type MaterialFormState,
} from "../lib/material";

const FAMILIES: { value: StainlessFamily; label: string }[] = [
  { value: "austenitic", label: "Austenitic" },
  { value: "duplex", label: "Duplex" },
  { value: "ferritic", label: "Ferritic" },
];

export function MaterialPage({
  form,
  onChange,
  grades,
  query,
  dark,
}: {
  form: MaterialFormState;
  onChange: (form: MaterialFormState) => void;
  grades: GradeOut[];
  query: UseQueryResult<MaterialModelResponse, ApiError>;
  dark: boolean;
}) {
  const custom = form.designation === CUSTOM;
  const options = [
    { value: CUSTOM, label: "Custom (enter f_y and f_u)" },
    ...grades.map((grade) => ({ value: grade.designation, label: grade.label })),
  ];
  const same = equivalentGrades(grades, form);
  const missing = missingMaterial(form);
  const result = missing.length === 0 ? query.data : undefined;

  return (
    <div className="page">
      <section className="panel inputs" aria-label="Material inputs">
        <h2>Inputs</h2>
        <p className="muted">
          {renderSymbols(
            "Give f_y, f_u, E and the family, or pick a grade to fill f_y, f_u and the family from Table 5.1. Grade, f_y and f_u are linked: enter any one and the other two follow the table. Values that match no grade make the material Custom.",
          )}
        </p>
        <SelectField
          label="Grade (Table 5.1)"
          value={form.designation}
          options={options}
          onChange={(designation) => onChange(selectGrade(grades, designation, form))}
        />
        <NumberField
          label="f_y"
          unit="N/mm²"
          value={form.fy}
          step={10}
          onChange={(fy) => onChange(withFy(grades, fy, form))}
        />
        <NumberField
          label="f_u"
          unit="N/mm²"
          value={form.fu}
          step={10}
          onChange={(fu) => onChange(withFu(grades, fu, form))}
        />
        <SelectField
          label="Family"
          value={form.family}
          options={FAMILIES}
          placeholder="choose the family"
          onChange={(family) => onChange({ ...form, family })}
        />
        {custom ? (
          <CheckField
            label="Values enhanced by cold-forming (B.3(3))"
            checked={form.enhanced}
            onChange={(enhanced) => onChange({ ...form, enhanced })}
          />
        ) : null}
        <NumberField
          label="E"
          unit="N/mm²"
          value={form.elasticModulus}
          step={1000}
          onChange={(elasticModulus) => onChange({ ...form, elasticModulus })}
        />
        {same.length > 0 ? (
          <p className="muted">
            {renderSymbols("Same f_y and f_u in Table 5.1 (identical in CSM): ")}
            {same.join(", ")}.
          </p>
        ) : null}
        {result?.material.note ? <p className="muted">Note: {result.material.note}</p> : null}
        {result ? <p className="muted">Source: {result.material.source}</p> : null}
      </section>

      <section className="results" aria-label="Material results" aria-busy={query.isFetching}>
        <h2>Results</h2>
        {missing.length > 0 ? (
          <StatusBox kind="info">{renderSymbols(`Still to enter: ${missing.join(", ")}.`)}</StatusBox>
        ) : null}
        {missing.length === 0 && query.isError ? (
          <StatusBox kind="error">{query.error.message}</StatusBox>
        ) : null}
        {result && !query.isError ? (
          <>
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
    </div>
  );
}
