import type { ReactNode } from "react";
import { renderSymbols } from "../components/Symbols";

const arrow = "url(#dg-arrow)";

/** Hand-drawn sketches for the Help page. They explain ideas and are never to scale. */

const SUB = /_([\p{L}\p{N},]+)/u;

type Anchor = "start" | "middle" | "end";

/** SVG text where ε_y is drawn as ε with a real subscript. */
export function T({
  x,
  y,
  children,
  anchor = "middle",
  className = "dg-text",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: Anchor;
  className?: string;
}) {
  const parts = children.split(SUB);
  return (
    <text x={x} y={y} textAnchor={anchor} className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <tspan key={index} dy={4} fontSize="75%">
            {part}
          </tspan>
        ) : (
          <tspan key={index} dy={index > 0 ? -4 : 0}>
            {part}
          </tspan>
        ),
      )}
    </text>
  );
}

export function Figure({
  label,
  caption,
  width,
  height,
  children,
}: {
  label: string;
  caption: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        {children}
      </svg>
      <figcaption>{renderSymbols(caption)}</figcaption>
    </figure>
  );
}

export function Axes({ x0, y0, x1, y1, xLabel, yLabel, yOffset = 52 }: { x0: number; y0: number; x1: number; y1: number; xLabel: string; yLabel: string; yOffset?: number }) {
  return (
    <g>
      <line x1={x0} y1={y0} x2={x1} y2={y0} className="dg-axis" markerEnd={arrow} />
      <line x1={x0} y1={y0} x2={x0} y2={y1} className="dg-axis" markerEnd={arrow} />
      <T x={x1} y={y0 + 34} anchor="end" className="dg-text dg-muted">{xLabel}</T>
      <text x={x0 - yOffset} y={(y0 + y1) / 2} textAnchor="middle" className="dg-text dg-muted" transform={`rotate(-90 ${x0 - yOffset} ${(y0 + y1) / 2})`}>
        {yLabel}
      </text>
    </g>
  );
}

/** B.4: the two lines of the CSM model on top of the real, rounded curve. */
export function CsmCurveDiagram() {
  return (
    <Figure
      label="The CSM stress-strain model: an elastic line up to yield, then a straight hardening line"
      caption="The CSM replaces the rounded curve of real stainless steel (dashed) with two straight lines. The hardening line is cut at the ductility cap C₁ε_u, and that is the largest strain the design may use. Not to scale."
      width={560}
      height={330}
    >
      <Axes x0={70} y0={280} x1={540} y1={20} xLabel="strain ε" yLabel="stress σ" />
      <path d="M 70 280 C 100 200, 112 160, 150 138 C 230 100, 360 80, 480 66" className="dg-real dg-dash" />
      <line x1={70} y1={280} x2={140} y2={150} className="dg-line dg-blue" />
      <line x1={140} y1={150} x2={480} y2={70} className="dg-line dg-blue" />
      <line x1={140} y1={150} x2={140} y2={280} className="dg-guide" />
      <line x1={340} y1={102} x2={340} y2={280} className="dg-guide" />
      <line x1={480} y1={70} x2={480} y2={280} className="dg-guide" />
      <line x1={70} y1={150} x2={140} y2={150} className="dg-guide" />
      <line x1={70} y1={102} x2={340} y2={102} className="dg-guide" />
      <line x1={70} y1={70} x2={480} y2={70} className="dg-guide" />
      <circle cx={140} cy={150} r={5} className="dg-dot dg-blue-fill" />
      <circle cx={340} cy={102} r={6} className="dg-dot dg-orange-fill" />
      <circle cx={480} cy={70} r={5} className="dg-dot dg-blue-fill" />
      <T x={140} y={300}>ε_y</T>
      <T x={340} y={300}>C₁ε_u</T>
      <T x={480} y={300}>C₂ε_u</T>
      <T x={62} y={154} anchor="end">f_y</T>
      <T x={62} y={106} anchor="end">σ(C₁ε_u)</T>
      <T x={62} y={74} anchor="end">f_u</T>
      <T x={106} y={240} anchor="start" className="dg-text dg-blue-text">slope E</T>
      <T x={236} y={146} anchor="middle" className="dg-text dg-blue-text">slope E_sh</T>
      <T x={346} y={126} anchor="start" className="dg-text dg-orange-text">design limit</T>
      <T x={490} y={110} anchor="start" className="dg-text dg-muted">real curve</T>
    </Figure>
  );
}

/** Why the method exists: the classic model stops at f_y, the CSM credits the hardening. */
export function CompareCurvesDiagram() {
  return (
    <Figure
      label="Classic elastic-plastic model compared with the CSM model"
      caption="Both models are the same up to yield. After that, the classic model stays flat at f_y and the CSM model keeps rising. The shaded gap is strength that stainless steel really has and a stocky section can use, and the classic model leaves it unused. Not to scale."
      width={560}
      height={300}
    >
      <Axes x0={70} y0={260} x1={540} y1={20} xLabel="strain ε" yLabel="stress σ" />
      <polygon points="140,140 400,140 400,84" className="dg-gap" />
      <line x1={70} y1={260} x2={140} y2={140} className="dg-line dg-grey" />
      <line x1={140} y1={140} x2={520} y2={140} className="dg-line dg-grey" />
      <line x1={140} y1={140} x2={400} y2={84} className="dg-line dg-blue" />
      <line x1={400} y1={84} x2={400} y2={260} className="dg-guide" />
      <circle cx={400} cy={84} r={6} className="dg-dot dg-orange-fill" />
      <T x={62} y={144} anchor="end">f_y</T>
      <T x={140} y={282}>ε_y</T>
      <T x={400} y={282}>ε_csm</T>
      <T x={526} y={162} anchor="end" className="dg-text dg-muted">classic: flat after yield</T>
      <T x={300} y={78} anchor="end" className="dg-text dg-blue-text">CSM: keeps hardening</T>
      <T x={330} y={126} anchor="middle" className="dg-text dg-gap-text">extra strength</T>
      <T x={408} y={74} anchor="start" className="dg-text dg-orange-text">f_csm</T>
    </Figure>
  );
}

/** B.5.2: a plate in compression, its edges, width and thickness. */
export function PlateDiagram() {
  return (
    <Figure
      label="A flat plate loaded in compression, with its flat width and thickness"
      caption="Left: the plate seen from the front with compression σ along its length. The small hatches mark the held long edges, which set k_σ. Right: a cut across the plate, showing the buckled shape (dashed) that gives σ_cr,p. Not to scale."
      width={560}
      height={290}
    >
      <rect x={90} y={80} width={190} height={120} className="dg-plate" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <line x1={84} y1={86 + i * 20} x2={90} y2={92 + i * 20} className="dg-guide" />
          <line x1={280} y1={86 + i * 20} x2={286} y2={92 + i * 20} className="dg-guide" />
        </g>
      ))}
      <line x1={140} y1={40} x2={140} y2={76} className="dg-line dg-orange" markerEnd={arrow} />
      <line x1={230} y1={40} x2={230} y2={76} className="dg-line dg-orange" markerEnd={arrow} />
      <line x1={140} y1={240} x2={140} y2={204} className="dg-line dg-orange" markerEnd={arrow} />
      <line x1={230} y1={240} x2={230} y2={204} className="dg-line dg-orange" markerEnd={arrow} />
      <T x={185} y={32} className="dg-text dg-orange-text">compression σ</T>
      <line x1={90} y1={262} x2={280} y2={262} className="dg-dim" markerStart={arrow} markerEnd={arrow} />
      <T x={185} y={280}>b̄ (flat width)</T>

      <line x1={330} y1={150} x2={530} y2={150} className="dg-guide" />
      <path d="M 330 150 C 370 100, 410 100, 430 150 C 450 200, 490 200, 530 150" className="dg-real dg-dash" />
      <rect x={330} y={150} width={200} height={10} className="dg-plate" />
      <line x1={542} y1={150} x2={542} y2={160} className="dg-dim" markerStart={arrow} markerEnd={arrow} />
      <T x={550} y={159} anchor="start">t</T>
      <T x={430} y={90} className="dg-text dg-muted">buckled shape</T>
      <T x={430} y={230} className="dg-text dg-muted">section across the plate</T>
    </Figure>
  );
}

/** B.5.2: a circular tube and a plated section whose most slender plate governs. */
export function SectionDiagram() {
  return (
    <Figure
      label="A circular hollow section and a plated I-section"
      caption="Left: a circular hollow section is described by its diameter d and wall thickness t. Right: a plated section is split into plates. The most slender plate buckles first, so its stress is used as σ_cr,cs. Not to scale."
      width={560}
      height={290}
    >
      <circle cx={130} cy={140} r={80} className="dg-plate" />
      <circle cx={130} cy={140} r={64} className="dg-hole" />
      <line x1={50} y1={250} x2={210} y2={250} className="dg-dim" markerStart={arrow} markerEnd={arrow} />
      <T x={130} y={272}>d (outer diameter)</T>
      <line x1={194} y1={140} x2={210} y2={140} className="dg-dim" markerStart={arrow} markerEnd={arrow} />
      <T x={218} y={144} anchor="start">t</T>

      <rect x={330} y={50} width={160} height={14} className="dg-plate" />
      <rect x={330} y={216} width={160} height={14} className="dg-plate" />
      <rect x={403} y={64} width={14} height={152} className="dg-plate dg-plate-governing" />
      <T x={410} y={40}>flange</T>
      <T x={410} y={252}>flange</T>
      <T x={430} y={146} anchor="start" className="dg-text dg-orange-text">web: most slender</T>
      <T x={430} y={164} anchor="start" className="dg-text dg-orange-text">governs σ_cr,cs</T>
    </Figure>
  );
}

/** B.5.1: the base curve with its three zones and the cap. */
export function BaseCurveDiagram() {
  return (
    <Figure
      label="The base curve: strain limit against slenderness, with stocky, slender and not-allowed zones"
      caption="Read your section's slenderness along the bottom and go up to the curve. A stocky section is capped (the flat part), a slender one follows the falling curve, and beyond the upper limit the method does not apply. Not to scale."
      width={560}
      height={330}
    >
      <rect x={70} y={20} width={160} height={260} className="dg-zone dg-zone-stocky" />
      <rect x={230} y={20} width={170} height={260} className="dg-zone dg-zone-slender" />
      <rect x={400} y={20} width={140} height={260} className="dg-zone dg-zone-bad" />
      <Axes x0={70} y0={280} x1={540} y1={20} xLabel="slenderness λ_cs" yLabel="strain limit ε_csm / ε_y" />
      <line x1={70} y1={180} x2={540} y2={180} className="dg-guide" />
      <T x={64} y={184} anchor="end">1</T>
      <path d="M 100 30 C 125 90, 175 150, 230 180" className="dg-real dg-dash" />
      <path d="M 90 78 L 128 78 C 148 112, 190 156, 230 180 C 290 200, 350 214, 400 222" className="dg-line dg-blue" />
      <line x1={70} y1={78} x2={128} y2={78} className="dg-guide" />
      <T x={64} y={82} anchor="end">cap</T>
      <T x={150} y={66} anchor="start" className="dg-text dg-orange-text">cap: min(Ω, C₁ε_u/ε_y)</T>
      <circle cx={320} cy={204} r={7} className="dg-dot dg-orange-fill" />
      <T x={328} y={194} anchor="start" className="dg-text dg-orange-text">your section</T>
      <T x={150} y={300}>stocky</T>
      <T x={315} y={300}>slender</T>
      <T x={470} y={300}>not allowed</T>
      <T x={186} y={108} anchor="start" className="dg-text dg-muted">raw formula (dashed)</T>
      <T x={186} y={124} anchor="start" className="dg-text dg-muted">is cut by the cap</T>
    </Figure>
  );
}

/** B.6.1: a member in tension and where its design point sits on the curve. */
export function TensionDiagram() {
  return (
    <Figure
      label="A member in tension and the point on the stress-strain curve used for its design"
      caption="Left: the member with area A and force N. Right: the design strain ε_csm,t is the smaller of 15ε_y and C₁ε_u, and the stress read from the hardening line there is f_csm,t. Not to scale."
      width={560}
      height={290}
    >
      <rect x={60} y={110} width={150} height={44} className="dg-plate" />
      <line x1={58} y1={132} x2={20} y2={132} className="dg-line dg-orange" markerEnd={arrow} />
      <line x1={212} y1={132} x2={250} y2={132} className="dg-line dg-orange" markerEnd={arrow} />
      <T x={30} y={104} className="dg-text dg-orange-text">N</T>
      <T x={240} y={104} className="dg-text dg-orange-text">N</T>
      <line x1={135} y1={96} x2={135} y2={168} className="dg-guide dg-dash" />
      <T x={135} y={190}>area A</T>
      <T x={135} y={220} className="dg-text dg-muted">resistance N_csm,t,Rd = A f_csm,t / γ_M0</T>

      <Axes x0={320} y0={250} x1={540} y1={30} xLabel="strain ε" yLabel="stress σ" yOffset={68} />
      <line x1={320} y1={250} x2={350} y2={170} className="dg-line dg-blue" />
      <line x1={350} y1={170} x2={500} y2={80} className="dg-line dg-blue" />
      <line x1={320} y1={170} x2={350} y2={170} className="dg-guide" />
      <line x1={320} y1={128} x2={430} y2={128} className="dg-guide" />
      <line x1={430} y1={128} x2={430} y2={250} className="dg-guide" />
      <line x1={470} y1={98} x2={470} y2={250} className="dg-guide dg-dash" />
      <circle cx={430} cy={128} r={6} className="dg-dot dg-orange-fill" />
      <T x={312} y={174} anchor="end">f_y</T>
      <T x={312} y={132} anchor="end">f_csm,t</T>
      <T x={350} y={270}>ε_y</T>
      <T x={430} y={270}>15ε_y</T>
      <T x={478} y={270}>C₁ε_u</T>
      <T x={538} y={206} anchor="end" className="dg-text dg-orange-text">design point ε_csm,t:</T>
      <T x={538} y={224} anchor="end" className="dg-text dg-orange-text">the smaller of the two</T>
    </Figure>
  );
}

/** How the three modules feed each other. */
export function WorkflowDiagram() {
  const box = (x: number, y: number, w: number, title: string, line: string, built: boolean) => (
    <g>
      <rect x={x} y={y} width={w} height={64} rx={8} className={built ? "dg-box dg-box-built" : "dg-box"} />
      <T x={x + w / 2} y={y + 26} className="dg-text dg-strong">{title}</T>
      <T x={x + w / 2} y={y + 46} className="dg-text dg-muted">{line}</T>
    </g>
  );
  const link = (x1: number, x2: number, y: number) => (
    <line x1={x1} y1={y} x2={x2} y2={y} className="dg-line dg-grey" markerEnd={arrow} />
  );
  return (
    <Figure
      label="How the three modules connect"
      caption="Tension needs no slenderness (a tension member does not buckle), so it goes straight from the material curve to the resistance. Resistances that involve buckling start from the section's slenderness and read the stress at ε_csm from the same material curve. Filled boxes are built in this tool."
      width={560}
      height={250}
    >
      <T x={20} y={22} anchor="start" className="dg-text dg-muted">Tension (built)</T>
      {box(20, 34, 150, "B.4 Material", "curve, ε_y, C₁ε_u, E_sh", true)}
      {link(172, 198, 66)}
      {box(200, 34, 160, "B.14 strain limit", "min{15 ; C₁ε_u/ε_y}", true)}
      {link(362, 388, 66)}
      {box(390, 34, 150, "B.12 / B.13", "f_csm,t and N_csm,t,Rd", true)}

      <T x={20} y={142} anchor="start" className="dg-text dg-muted">Compression and bending (B.5 built, resistances to come)</T>
      {box(20, 154, 126, "B.5.2", "slenderness λ_cs", true)}
      {link(148, 164, 186)}
      {box(166, 154, 134, "B.5.1", "curve and cap Ω", true)}
      {link(302, 318, 186)}
      {box(320, 154, 104, "B.4", "stress at ε_csm", true)}
      {link(426, 442, 186)}
      {box(444, 154, 96, "B.6.2 on", "resistance", false)}
    </Figure>
  );
}

/** Why stepped classes lose strength at boundaries and a continuous method does not. */
export function ClassesDiagram() {
  return (
    <Figure
      label="Section capacity against slenderness: stepped classes compared with a continuous curve"
      caption="A class-based method gives every section in a class the same capacity, so capacity drops in steps at the class limits. A continuous method gives each section its own value, so two nearly identical sections get nearly identical capacities, and stocky stainless sections are credited for strain hardening. Not to scale."
      width={560}
      height={310}
    >
      <Axes x0={70} y0={260} x1={540} y1={20} xLabel="section slenderness" yLabel="section capacity" />
      <path d="M 70 130 L 210 130 L 210 160 L 320 160 L 320 190 L 420 190 L 420 225 L 520 225" className="dg-line dg-grey" fill="none" />
      <path d="M 70 70 C 150 76, 200 110, 250 148 C 330 196, 420 220, 520 232" className="dg-line dg-blue" />
      <T x={140} y={124} className="dg-text dg-muted">class 1</T>
      <T x={265} y={154} className="dg-text dg-muted">class 2</T>
      <T x={370} y={184} className="dg-text dg-muted">class 3</T>
      <T x={470} y={219} className="dg-text dg-muted">class 4</T>
      <T x={150} y={60} anchor="start" className="dg-text dg-blue-text">continuous (CSM): above yield when stocky</T>
      <T x={526} y={252} anchor="end" className="dg-text dg-muted">steps: same value inside a class</T>
    </Figure>
  );
}


/** The three things that can end a member's capacity, drawn side by side. */
export function FailureKindsDiagram() {
  const support = (x: number, y: number) => (
    <polygon points={`${x},${y} ${x - 9},${y + 14} ${x + 9},${y + 14}`} className="dg-box" />
  );
  const load = (x: number, y0: number, y1: number) => (
    <line x1={x} y1={y0} x2={x} y2={y1} className="dg-line dg-orange" markerEnd={arrow} />
  );
  return (
    <Figure
      label="Overall buckling, local buckling and plastic bending"
      caption="Left: overall buckling, the whole member bows sideways. Middle: local buckling, a thin wall wrinkles while the member stays straight. Right: plastic bending, the steel yields and a hinge forms. Not to scale."
      width={560}
      height={290}
    >
      {load(95, 14, 44)}
      <path d="M 95 50 C 135 100, 135 170, 95 216" className="dg-line dg-blue" />
      <line x1={95} y1={50} x2={95} y2={216} className="dg-guide dg-dash" />
      {support(95, 218)}
      <T x={95} y={262} className="dg-text dg-strong">Overall buckling</T>
      <T x={95} y={280} className="dg-text dg-muted">the whole member bows</T>

      {load(280, 14, 44)}
      <path
        d="M 240 50 C 252 85, 228 115, 240 125 C 252 135, 228 165, 240 215 L 320 215 C 308 165, 332 135, 320 125 C 308 115, 332 85, 320 50 Z"
        className="dg-plate"
      />
      <T x={280} y={262} className="dg-text dg-strong">Local buckling</T>
      <T x={280} y={280} className="dg-text dg-muted">a thin wall wrinkles</T>

      {load(465, 60, 128)}
      <path d="M 395 150 L 465 176 L 535 150" className="dg-line dg-blue" />
      {support(395, 152)}
      {support(535, 152)}
      <circle cx={465} cy={176} r={9} className="dg-dot dg-orange-fill" />
      <T x={465} y={262} className="dg-text dg-strong">Plastic bending</T>
      <T x={465} y={280} className="dg-text dg-muted">yielding forms a hinge</T>
    </Figure>
  );
}

/** Moment against rotation: IS 800 classes as separate curves, the CSM as one continuous one. */
export function MomentRotationDiagram() {
  return (
    <Figure
      label="Moment against rotation for the four IS 800 classes and for a continuous CSM curve"
      caption="Each grey curve is a class: class 1 holds the plastic moment M_pl through a long rotation, class 2 reaches it and falls soon, class 3 reaches only the elastic moment M_el, class 4 buckles before it. The blue curve is a stainless section under the CSM: one continuous curve, rising above M_pl, and each section stops at its own point where local buckling ends it. Not to scale."
      width={560}
      height={320}
    >
      <Axes x0={70} y0={280} x1={540} y1={20} xLabel="rotation" yLabel="moment" />
      <line x1={70} y1={118} x2={500} y2={118} className="dg-guide dg-dash" />
      <line x1={70} y1={158} x2={500} y2={158} className="dg-guide dg-dash" />
      <T x={62} y={122} anchor="end">M_pl</T>
      <T x={62} y={162} anchor="end">M_el</T>
      <path d="M 70 280 L 130 158 C 150 130, 170 118, 200 118 L 380 118 C 410 120, 430 140, 450 190" className="dg-line dg-grey" />
      <path d="M 70 280 L 130 158 C 150 130, 170 118, 200 118 L 250 118 C 280 122, 300 150, 320 205" className="dg-line dg-grey" />
      <path d="M 70 280 L 130 158 L 150 158 C 175 160, 190 185, 200 225" className="dg-line dg-grey" />
      <path d="M 70 280 L 112 196 C 125 194, 135 210, 140 245" className="dg-line dg-grey" />
      <T x={456} y={196} anchor="start" className="dg-text dg-muted">class 1</T>
      <T x={326} y={210} anchor="start" className="dg-text dg-muted">class 2</T>
      <T x={206} y={232} anchor="start" className="dg-text dg-muted">class 3</T>
      <T x={146} y={252} anchor="start" className="dg-text dg-muted">class 4</T>
      <path d="M 130 158 C 160 112, 220 78, 380 62" className="dg-line dg-blue" />
      <line x1={70} y1={158} x2={130} y2={158} className="dg-guide" />
      <circle cx={159} cy={122} r={6} className="dg-dot dg-blue-fill" />
      <circle cx={218} cy={93} r={6} className="dg-dot dg-blue-fill" />
      <circle cx={380} cy={62} r={6} className="dg-dot dg-orange-fill" />
      <T x={170} y={146} anchor="start" className="dg-text dg-blue-text">slender</T>
      <T x={206} y={82} anchor="end" className="dg-text dg-blue-text">less stocky</T>
      <T x={374} y={50} anchor="end" className="dg-text dg-orange-text">stocky: above M_pl</T>
    </Figure>
  );
}

export const DIAGRAMS: Record<string, () => ReactNode> = {
  csm_curve: CsmCurveDiagram,
  plate: PlateDiagram,
  section: SectionDiagram,
  base_curve: BaseCurveDiagram,
  tension: TensionDiagram,
};

/** Arrow heads shared by every sketch. Render it once on the page, outside any hidden section. */
export function DiagramDefs() {
  return (
    <svg width={0} height={0} className="dg-defs" aria-hidden="true" focusable="false">
      <defs>
        <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrow-head" />
        </marker>
      </defs>
    </svg>
  );
}
