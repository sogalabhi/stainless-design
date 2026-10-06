import { Sym } from "../components/Symbols";
import { StatusBox } from "../components/ui";
import { ClassesDiagram } from "./diagrams";

const ROWS: { topic: string; is800: string; csm: string }[] = [
  {
    topic: "Written for",
    is800: "General construction in steel, designed around ordinary structural carbon steel. Stainless steel is not covered.",
    csm: "Stainless steel. Annex B of EN 1993-1-4:2025 is the Continuous Strength Method.",
  },
  {
    topic: "Stress-strain model",
    is800: "Elastic, then perfectly plastic: flat at f_y.",
    csm: "Two lines: elastic, then a hardening line to f_u, built from f_y, f_u, E and Table B.1 (B.4).",
  },
  {
    topic: "Strain hardening",
    is800: "Not used. Strength above f_y is ignored.",
    csm: "Used, up to a strain cap, so stocky sections can exceed f_y.",
  },
  {
    topic: "How a section is judged",
    is800: "Classified into a few classes (plastic, compact, semi-compact, slender) by width-to-thickness limits.",
    csm: "A slenderness λ_cs from the elastic buckling stress, then a strain limit ε_csm/ε_y read from a continuous base curve (B.5).",
  },
  {
    topic: "Slenderness limits scale with",
    is800: "A factor of the form √(250 / f_y), made for the strength range of carbon steel.",
    csm: "√(f_y / σ_cr), which uses E, ν, plate width, thickness and edge support, so it is valid for any f_y.",
  },
  {
    topic: "Tension",
    is800: "Yielding of the gross section with f_y, plus rupture of the net section and block shear.",
    csm: "Same form, A × stress / γ_M0, but the stress is f_csm,t from the hardening line (B.12 to B.14). Sections with holes are outside B.6.1.",
  },
  {
    topic: "Partial factors",
    is800: "From IS 800.",
    csm: "From the Eurocode part and National Annex that apply. In this tool γ_M0 is an input.",
  },
  {
    topic: "Material grades",
    is800: "Indian structural steel grades.",
    csm: "EN stainless grades with corrosion classes (Table 5.1).",
  },
];

export function WhyNotIs800() {
  return (
    <div className="help-stack">
      <section className="help-card" aria-labelledby="why-short">
        <h2 id="why-short">The short answer</h2>
        <p>
          IS 800 and this tool answer different questions. IS 800 is a general code for ordinary
          structural steel. It assumes that steel yields at <Sym text="f_y" /> and stays flat. Stainless
          steel does not behave that way: its curve is rounded, it keeps gaining a lot of strength
          after yield, and it is much more ductile. A method that ignores this wastes a good part of
          the material, and a method built for carbon steel cannot be copied across without
          re-deriving it.
        </p>
        <p>
          EN 1993-1-4:2025 is a stainless steel code, and its Annex B (the Continuous Strength
          Method) is made for exactly this behaviour. That is why this tool follows it.
        </p>
        <StatusBox kind="info">
          This is a summary written from general knowledge of both codes. Check clause numbers,
          limits and amendments against your own copies before quoting it in a report.
        </StatusBox>
      </section>

      <section className="help-card" aria-labelledby="why-table">
        <h2 id="why-table">Side by side</h2>
        <div className="table-wrap compare">
          <table>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">IS 800 (carbon steel)</th>
                <th scope="col">EN 1993-1-4:2025 Annex B (this tool)</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.topic}>
                  <th scope="row">{row.topic}</th>
                  <td><Sym text={row.is800} /></td>
                  <td><Sym text={row.csm} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="help-card" aria-labelledby="why-classes">
        <h2 id="why-classes">Steps against a continuous curve</h2>
        <p>
          A class-based method gives every section in a class the same capacity. Two almost
          identical sections on either side of a class limit can get very different results, and a
          stocky section never gets more than the top step. The CSM gives each section its own
          value from its own slenderness, and stocky stainless sections are credited for the
          hardening they really have.
        </p>
        <ClassesDiagram />
      </section>

      <section className="help-card" aria-labelledby="why-practice">
        <h2 id="why-practice">What this means in practice</h2>
        <ul className="plain">
          <li>
            <strong>IS 800 is not wrong for carbon steel.</strong> The point is only that it was not
            written for stainless steel, so its limits and its flat-yield assumption do not
            describe stainless steel behaviour.
          </li>
          <li>
            <strong>Stainless steel needs a design basis.</strong> If a project is governed by IS
            800, the stainless part needs a stated design basis, such as EN 1993-1-4, agreed with the
            checking authority. That is a decision for the project engineer; this tool cannot make
            it.
          </li>
          <li>
            <strong>The tool does not give an IS 800 number.</strong> A comparison result would need
            rules and values from outside Annex B (IS 800 limits, its partial factors, loads). The
            project never assumes values from outside Annex B, so none is shown. The qualitative
            comparison above is the whole of it.
          </li>
        </ul>
      </section>
    </div>
  );
}
