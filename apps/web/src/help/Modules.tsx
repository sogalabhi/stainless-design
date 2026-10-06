import type { ReactNode } from "react";
import { Sym } from "../components/Symbols";
import { Collapsible } from "../components/ui";
import { BaseCurveDiagram, CsmCurveDiagram, PlateDiagram, SectionDiagram, TensionDiagram } from "./diagrams";

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([term, body]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{body}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Modules() {
  return (
    <div className="help-stack">
      <p className="lead">
        The three steps are separate on purpose. Each one answers one question, and the later ones
        read the answer of the earlier ones.
      </p>

      <section className="help-card" aria-labelledby="mod-material">
        <h2 id="mod-material">1 · Material (B.4)</h2>
        <p className="lead">How does this steel behave once it is past yield?</p>
        <Facts
          rows={[
            [
              "What it does",
              <>
                Builds the CSM stress-strain model: an elastic line up to <Sym text="f_y" />, then a
                straight hardening line that reaches <Sym text="f_u" /> at <Sym text="C₂ε_u" />. The
                coefficients <Sym text="C₁" />, <Sym text="C₂" /> and <Sym text="C₃" /> come from
                Table B.1 for the chosen material family.
              </>,
            ],
            [
              "Why it is needed",
              <>
                Every later step reads a stress from this curve. Without it there is no way to say
                how much strength a section gains beyond yield, and no ductility cap{" "}
                <Sym text="C₁ε_u" /> to stop the design from using strain the material may not
                reach.
              </>,
            ],
            [
              "You give",
              <>
                A grade (or custom <Sym text="f_y" />, <Sym text="f_u" /> and family) and{" "}
                <Sym text="E" />. Nothing is pre-filled.
              </>,
            ],
            [
              "You get",
              <>
                <Sym text="ε_y" />, <Sym text="ε_u" />, <Sym text="E_sh" />, <Sym text="C₁ε_u" />,{" "}
                <Sym text="C₂ε_u" />, <Sym text="σ(C₁ε_u)" /> and the two ratios{" "}
                <Sym text="E_sh/E" /> and <Sym text="C₁ε_u/ε_y" />, each with its working.
              </>,
            ],
            [
              "Reading the chart",
              <>
                Blue is the CSM curve, grey is the classic elastic-plastic curve. The band between
                them is the extra strength stainless steel gives. <em>Schematic</em> spaces the key
                strains evenly so every label is readable; <em>true scale</em> shows the real
                proportions, where the elastic part is a very small sliver.
              </>,
            ],
            [
              "Watch for",
              <>
                If <Sym text="f_y" /> is very close to <Sym text="f_u" />, the hardening line
                would have no length (<Sym text="C₂ε_u" /> not above <Sym text="ε_y" />) and the
                tool refuses with a message instead of drawing a meaningless curve.
              </>,
            ],
          ]}
        />
        <CsmCurveDiagram />
      </section>

      <section className="help-card" aria-labelledby="mod-tension">
        <h2 id="mod-tension">2 · Tension (B.6.1)</h2>
        <p className="lead">How much pull can a member take, counting the hardening?</p>
        <Facts
          rows={[
            [
              "What it does",
              <>
                Finds the strain limit <Sym text="ε_csm,t" /> (B.14), reads the stress{" "}
                <Sym text="f_csm,t" /> there from the hardening line (B.13) and turns it into a
                force <Sym text="N_csm,t,Rd" /> (B.12).
              </>,
            ],
            [
              "Why it is needed",
              <>
                Tension is the simplest place to see the CSM gain. A tension member does not buckle,
                so only the material limits the strain. The result is directly comparable with the
                classic <Sym text="A f_y / γ_M0" /> idea: the only change is that the stress is{" "}
                <Sym text="f_csm,t" /> instead of <Sym text="f_y" />.
              </>,
            ],
            [
              "You give",
              <>
                The area <Sym text="A" />, the partial factor <Sym text="γ_M0" /> and whether the
                section has holes. The section type is only a label.
              </>,
            ],
            [
              "You get",
              <>
                <Sym text="ε_csm,t/ε_y" /> and which limit governed (the fixed{" "}
                <Sym text="15ε_y" /> or the material's <Sym text="C₁ε_u" />),{" "}
                <Sym text="ε_csm,t" />, <Sym text="f_csm,t" /> and <Sym text="N_csm,t,Rd" />.
              </>,
            ],
            [
              "Reading the chart",
              <>
                The same curve as the Material step, with the design point marked. The shaded band
                is the extra strength this member actually uses.
              </>,
            ],
            [
              "Watch for",
              <>
                B.6.1(1) covers sections without holes. With holes the tool stops and points to the
                other standards named in B.6.1(2). It gives a resistance only: it does not compare
                it with a force, because load combinations are outside Annex B.
              </>,
            ],
          ]}
        />
        <TensionDiagram />
      </section>

      <section className="help-card" aria-labelledby="mod-deformation">
        <h2 id="mod-deformation">3 · Deformation capacity (B.5)</h2>
        <p className="lead">How much strain can this cross-section take before it buckles locally?</p>
        <Facts
          rows={[
            [
              "What it does",
              <>
                Computes how slender the section is (B.5.2), then reads the strain limit{" "}
                <Sym text="ε_csm/ε_y" /> from the base curve (B.6 for flat plates, B.7 for circular
                hollow sections) and applies the cap <Sym text="min(Ω, C₁ε_u/ε_y)" />.
              </>,
            ],
            [
              "Why it is needed",
              <>
                This is what makes the method <em>continuous</em>. A stocky section can reach several
                times <Sym text="ε_y" /> and uses a lot of hardening; a slender one buckles around
                yield or earlier and gets none. Resistances for compression and bending (B.6.2
                onwards, not built yet) will read the stress at this strain from the B.4 curve.
              </>,
            ],
            [
              "You give",
              <>
                The geometry: <Sym text="d" /> and <Sym text="t" /> for a tube, or each plate's{" "}
                <Sym text="b̄" />, <Sym text="t" /> and <Sym text="k_σ" />, or a numerical{" "}
                <Sym text="σ_cr,cs" />; also <Sym text="ν" /> (unless you give{" "}
                <Sym text="σ_cr,cs" />) and <Sym text="Ω" />.
              </>,
            ],
            [
              "You get",
              <>
                Per plate <Sym text="σ_cr,p" /> and <Sym text="λ_p" />, then <Sym text="σ_cr,cs" />,{" "}
                <Sym text="λ_cs" />, the zone, <Sym text="ε_csm/ε_y" /> and whether the cap or the
                formula set it.
              </>,
            ],
            [
              "Reading the chart",
              <>
                Find your slenderness on the bottom axis. Left of the switch the section is stocky
                and capped, then slender and falling, and beyond the upper limit the method does not
                apply.
              </>,
            ],
            [
              "Watch for",
              <>
                For plated sections the tool takes the most slender plate as the section (the
                conservative route of B.5.2(3)). The buckling factor <Sym text="k_σ" /> is yours:
                Annex B refers to it but does not define it, so it is never assumed.
              </>,
            ],
          ]}
        />
        <BaseCurveDiagram />
        <Collapsible title="How slenderness is measured: plates and sections">
          <PlateDiagram />
          <SectionDiagram />
        </Collapsible>
      </section>
    </div>
  );
}
