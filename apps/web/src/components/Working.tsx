import type { CoefficientsOut, TraceStepOut } from "../api/types";
import { Latex } from "./Latex";
import { Collapsible } from "./ui";
import { renderSymbols } from "./Symbols";

/** Every step of the calculation, each with a clause chip. `clauses` limits which are shown. */
export function Working({
  title,
  steps,
  clauses,
}: {
  title: string;
  steps: TraceStepOut[];
  clauses?: string[];
}) {
  const shown = clauses ? steps.filter((step) => clauses.includes(step.clause)) : steps;
  return (
    <Collapsible title={`Show working: ${title}`}>
      <ol className="working">
        {shown.map((step) => (
          <li key={step.symbol}>
            <span className="chip">{step.clause}</span> {renderSymbols(step.description)}
            <Latex tex={step.latex} />
          </li>
        ))}
      </ol>
    </Collapsible>
  );
}

export function CoefficientTable({ rows }: { rows: CoefficientsOut[] }) {
  return (
    <div className="table-wrap">
      <h3>Table B.1: CSM material model coefficients</h3>
      <table>
        <thead>
          <tr>
            <th>Stainless steel</th>
            <th>{renderSymbols("C₁")}</th>
            <th>{renderSymbols("C₂")}</th>
            <th>{renderSymbols("C₃")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.family} className={row.selected ? "selected" : ""} aria-selected={row.selected}>
              <td>{row.family.charAt(0).toUpperCase() + row.family.slice(1)}</td>
              <td>{row.c1.toFixed(2)}</td>
              <td>{row.c2.toFixed(2)}</td>
              <td>{row.c3.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const MATERIAL_EXPLAINER = (
  <ul>
    <li>
      <strong>Blue line:</strong> the CSM idealisation of the steel: a steep elastic line up to
      yield, then a gentle <em>strain-hardening</em> line up to the ultimate strength.
    </li>
    <li>
      <strong>Dashed grey line:</strong> the classic assumption, flat at f<sub>y</sub>. The shaded
      gap is the extra strength CSM lets you use.
    </li>
    <li>
      <strong>E<sub>sh</sub></strong> is rise over run of the second line: (f<sub>u</sub> −
      f<sub>y</sub>) / (C₂ε<sub>u</sub> − ε<sub>y</sub>).
    </li>
    <li>
      <strong>C₂ε<sub>u</sub></strong> is not where the steel breaks. It is an anchor point chosen
      so the straight line follows the real, rounded curve in the strain range that matters.
    </li>
    <li>
      <strong>C₁ε<sub>u</sub></strong> is the largest strain the method lets you use: a ductility
      cap.
    </li>
    <li>
      The ε<sub>u</sub> formula estimates the fracture strain from f<sub>y</sub>/f<sub>u</sub>
      because the real value is usually unknown. Ferritic steels use C₃ = 0.6 because they are
      less ductile.
    </li>
  </ul>
);
