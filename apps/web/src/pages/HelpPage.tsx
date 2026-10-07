import { useState } from "react";
import { Sym } from "../components/Symbols";
import { Segmented } from "../components/ui";
import { CompareCurvesDiagram, DiagramDefs, WorkflowDiagram } from "../help/diagrams";
import { BucklingBending } from "../help/BucklingBending";
import { Modules } from "../help/Modules";
import { SymbolsBrowser } from "../help/SymbolsBrowser";
import { WhyNotIs800 } from "../help/WhyNotIs800";

type Topic = "overview" | "buckling" | "is800" | "modules" | "symbols";

function Overview() {
  return (
    <div className="help-stack">
      <section className="help-card" aria-labelledby="ov-what">
        <h2 id="ov-what">What the Continuous Strength Method is</h2>
        <p>
          Stainless steel does not have a sharp yield point. Its stress-strain curve is rounded, and
          after yielding it keeps gaining a lot of strength before it fails. The Continuous Strength
          Method (CSM), Annex B of EN 1993-1-4:2025, is a way of using that extra strength in a
          design check, instead of stopping at the yield stress <Sym text="f_y" />.
        </p>
        <CompareCurvesDiagram />
      </section>

      <section className="help-card" aria-labelledby="ov-steps">
        <h2 id="ov-steps">The idea in four steps</h2>
        <ol className="plain">
          <li>
            <strong>Describe the material</strong> with a simple two-line curve (B.4).
          </li>
          <li>
            <strong>Measure how slender the section is:</strong> how easily its plates buckle
            (B.5.2).
          </li>
          <li>
            <strong>Read how much strain it can reach</strong> before it buckles locally, from a
            base curve (B.5.1). A stocky section reaches a lot, a slender one very little.
          </li>
          <li>
            <strong>Read the stress at that strain</strong> from the material curve and turn it into
            a resistance (B.6).
          </li>
        </ol>
        <WorkflowDiagram />
      </section>

      <section className="help-card" aria-labelledby="ov-use">
        <h2 id="ov-use">Using this website</h2>
        <ul className="plain">
          <li>Inputs are on the left and results on the right, one tab per step.</li>
          <li>
            Every value that Annex B does not define (such as <Sym text="E" />, <Sym text="ν" />,{" "}
            <Sym text="γ_M0" />, <Sym text="Ω" /> and <Sym text="k_σ" />) starts empty. Nothing is
            assumed for you.
          </li>
          <li>
            Each result has a working: the clause, the formula, the numbers put in and the answer.
          </li>
          <li>
            The Symbols tab here explains every symbol in detail, with sketches. The Modules tab
            explains why each step exists. Buckling and bending explains local buckling and plastic
            bending, and the 4 · Visualise tab shows them live for your own section.
          </li>
        </ul>
      </section>
    </div>
  );
}

export function HelpPage() {
  const [topic, setTopic] = useState<Topic>("overview");
  return (
    <div className="help">
      <DiagramDefs />
      <Segmented
        label="Topic"
        value={topic}
        options={[
          { value: "overview", label: "Overview" },
          { value: "buckling", label: "Buckling and bending" },
          { value: "is800", label: "Why not IS 800" },
          { value: "modules", label: "Modules" },
          { value: "symbols", label: "Symbols" },
        ]}
        onChange={setTopic}
      />
      {topic === "overview" ? <Overview /> : null}
      {topic === "buckling" ? <BucklingBending /> : null}
      {topic === "is800" ? <WhyNotIs800 /> : null}
      {topic === "modules" ? <Modules /> : null}
      {topic === "symbols" ? <SymbolsBrowser /> : null}
    </div>
  );
}
