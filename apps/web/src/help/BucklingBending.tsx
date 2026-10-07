import { Sym } from "../components/Symbols";
import { StatusBox } from "../components/ui";
import { FailureKindsDiagram, MomentRotationDiagram } from "./diagrams";

const ROWS: { topic: string; is800: string; csm: string }[] = [
  {
    topic: "Overall (member) buckling",
    is800: "Member design rules with buckling curves. The section class decides which cross-section resistance goes in.",
    csm: "Not built. Member buckling (8.3) is outside Annex B, which only supplies the cross-section resistance that member checks start from.",
  },
  {
    topic: "Local buckling",
    is800: "Width-to-thickness limits per class. Class 4 sections use effective widths.",
    csm: "A slenderness λ_cs from σ_cr, then the strain limit ε_csm/ε_y from a continuous base curve (B.5). Built.",
  },
  {
    topic: "Plastic bending",
    is800: "Flat yield: f_y over the full depth gives the plastic moment M_pl for class 1 and 2, and the elastic moment M_el for class 3. No strain hardening.",
    csm: "The stress follows the hardening line up to ε_csm, so a stocky section can go above M_pl (B.6.3). The resistance formulas are planned; the stress picture is on the Visualise tab.",
  },
  {
    topic: "Material curve",
    is800: "Elastic, then flat at f_y (carbon steel has a yield plateau).",
    csm: "Rounded in reality, modelled with two lines: elastic, then a hardening line to f_u (B.4).",
  },
  {
    topic: "Ductility and rotation",
    is800: "Class 1 gives the rotation capacity that a plastic hinge needs. Classes are separate boxes.",
    csm: "ε_csm/ε_y measures it directly for each section, up to the cap Ω.",
  },
];

export function BucklingBending() {
  return (
    <div className="help-stack">
      <section className="help-card" aria-labelledby="bb-three">
        <h2 id="bb-three">Three different things</h2>
        <p>
          Buckling and plastic bending are often mixed up. One is about <em>shape</em> becoming
          unstable, the other about the <em>material</em> yielding, and local buckling decides how far
          the second can go.
        </p>
        <FailureKindsDiagram />
        <dl className="facts">
          <div>
            <dt>Overall buckling</dt>
            <dd>
              The whole member bows sideways under compression. It depends on length and stiffness,
              not on how thin the walls are. Not part of Annex B and not built in this tool.
            </dd>
          </div>
          <div>
            <dt>Local buckling</dt>
            <dd>
              A thin flange, web or tube wall wrinkles while the member as a whole stays straight. It
              depends on width against thickness (the slenderness <Sym text="λ_cs" />), and it
              limits the strain the section can reach before it loses capacity. This is what step 3
              calculates.
            </dd>
          </div>
          <div>
            <dt>Plastic bending</dt>
            <dd>
              The steel yields across the section and a hinge forms. How much moment a section can
              carry at that point depends on how far past <Sym text="ε_y" /> the strain is allowed to go, and
              that is set by local buckling.
            </dd>
          </div>
        </dl>
      </section>

      <section className="help-card" aria-labelledby="bb-order">
        <h2 id="bb-order">Local buckling decides how far bending can go</h2>
        <p>
          A stocky section yields all through and keeps going. A slender one wrinkles first and
          never gets there. IS 800 sorts sections into four classes and gives each class its own
          rule. The CSM keeps one continuous curve instead, so each section gets the strain that its
          own slenderness allows, and for stainless steel that strain can be well past yield.
        </p>
        <MomentRotationDiagram />
      </section>

      <section className="help-card" aria-labelledby="bb-compare">
        <h2 id="bb-compare">Mild steel (IS 800) against this tool</h2>
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
        <StatusBox kind="info">
          Written from general knowledge of both codes. Check clause numbers, limits and amendments
          against your own copies before quoting it. No IS 800 number is calculated anywhere in this
          tool.
        </StatusBox>
      </section>

      <section className="help-card" aria-labelledby="bb-try">
        <h2 id="bb-try">See it with your own section</h2>
        <p>
          The <strong>4 · Visualise</strong> tab uses the material and section you enter and redraws
          everything as you change them: a slider makes the same section thicker or thinner, the
          3D view puts stocky and slender versions side by side, and the charts show where each one
          sits on the base curve and on the material curve.
        </p>
        <ul className="plain">
          <li>
            The wave size in 3D is only a picture of &quot;more slender, more buckling&quot;. The CSM
            does not calculate a buckled shape.
          </li>
          <li>
            The bending picture shows stress across the depth, not a moment, because the bending
            resistance (B.6.3) is not built yet.
          </li>
        </ul>
      </section>
    </div>
  );
}
