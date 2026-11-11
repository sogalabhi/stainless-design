import { Sym } from "../components/Symbols";

const MOMENTS: { external: string; internal: string }[] = [
  { external: "+ve face and +ve direction (+M₀)", internal: "Sagging (+M_z)" },
  { external: "−ve face and −ve direction (−M₀)", internal: "Sagging (+M_z)" },
  { external: "+ve face and −ve direction (−M₀)", internal: "Hogging (−M_z)" },
  { external: "−ve face and +ve direction (+M₀)", internal: "Hogging (−M_z)" },
];

const CURVATURE: { centre: string; kappa: string }[] = [
  { centre: "Towards the +ve axis", kappa: "+ve" },
  { centre: "Towards the −ve axis", kappa: "−ve" },
  { centre: "Right-hand rule (Y up) and sagging", kappa: "+ve" },
  { centre: "Right-hand rule (Y up) and hogging", kappa: "−ve" },
];

/** Sagging and hogging, drawn as a simply supported beam: compression is the shortened side. */
function BendingSigns() {
  const beam = (hogging: boolean, x: number) => {
    const sign = hogging ? -1 : 1;
    return (
      <g transform={`translate(${x} 0)`}>
        <path
          d={`M10 ${70 - sign * 0}Q90 ${70 + sign * 34} 170 70`}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.65"
        />
        <text x="90" y="24" textAnchor="middle" fontWeight="700">
          {hogging ? "Hogging  (−M)" : "Sagging  (+M)"}
        </text>
        <text x="90" y={hogging ? 128 : 112} textAnchor="middle" fontSize="12">
          {hogging ? "compression at the bottom" : "compression at the top"}
        </text>
        <text x="90" y={hogging ? 112 : 128} textAnchor="middle" fontSize="12">
          {hogging ? "tension at the top, κ −ve" : "tension at the bottom, κ +ve"}
        </text>
      </g>
    );
  };
  return (
    <svg
      viewBox="0 0 400 140"
      role="img"
      aria-label="A sagging beam curves up with compression at the top. A hogging beam curves down with compression at the bottom."
      style={{ width: "100%", maxWidth: 520 }}
      fill="currentColor"
    >
      {beam(false, 0)}
      {beam(true, 210)}
    </svg>
  );
}

function Table({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SignConvention() {
  return (
    <div className="help-stack">
      <p className="lead">
        Which way is positive, and what sagging and hogging mean. This is the convention the tool draws and prints.
      </p>

      <section className="help-card" aria-labelledby="sc-axes">
        <h2 id="sc-axes">Axes: a right-hand coordinate system</h2>
        <p>
          X is longitudinal, along the member. Y is transverse, up the page. Z is lateral, across the member. A positive
          face is the one whose outward normal points along a positive axis; a negative face points along a negative axis.
        </p>
        <p>
          The Eurocode names the section axes differently: x along the member, y-y the major (horizontal) axis of the
          section and z-z the minor (vertical) one. The tool and the clauses of EN 1993-1-4 use the Eurocode names, so
          &ldquo;major axis (y-y)&rdquo; in the Bending group is bending that turns the section about its horizontal axis,
          the M_z of the right-hand system above, with Y up.
        </p>
      </section>

      <section className="help-card" aria-labelledby="sc-moments">
        <h2 id="sc-moments">Bending moment: external and internal</h2>
        <Table
          head={["External (the applied moment M₀)", "Internal (the moment in the section)"]}
          rows={MOMENTS.map((row): [string, string] => [row.external, row.internal])}
        />
        <p>
          Sagging is positive and hogging is negative. A sagging member is concave upward: the top fibres shorten
          (compression) and the bottom fibres lengthen (tension).
        </p>
        <BendingSigns />
      </section>

      <section className="help-card" aria-labelledby="sc-curvature">
        <h2 id="sc-curvature">Curvature κ</h2>
        <Table
          head={["Centre of curvature", "Curvature κ"]}
          rows={CURVATURE.map((row): [string, string] => [row.centre, row.kappa])}
        />
        <p>
          Under pure bending plane sections stay plane, so the strain at a distance y from the neutral axis is
          ε = −κy (Gere &amp; Timoshenko, eq. 10-1) and κ at the extreme fibre is ε divided by the distance to it.
        </p>
      </section>

      <section className="help-card" aria-labelledby="sc-tool">
        <h2 id="sc-tool">How this tool uses it</h2>
        <dl className="facts">
          <div>
            <dt>Direction of bending</dt>
            <dd>
              The Bending group has a choice: sagging (+M, compression at the top, the default) or hogging (−M,
              compression at the bottom). It changes only what is drawn and the sign printed. The resistance itself is a
              magnitude, as Annex B gives it.
            </dd>
          </div>
          <div>
            <dt>Stress and strain</dt>
            <dd>
              Compression is positive and tension negative in the diagrams and the profiles. The depth runs from the
              tension edge to the compression edge. In hogging the whole picture is turned over: compression at the
              bottom, and the 3D member curves downward.
            </dd>
          </div>
          <div>
            <dt>M and κ on the Stage</dt>
            <dd>
              Shown with their sign: +M and +κ for sagging, −M and −κ for hogging. κ is the strain at the extreme fibre
              over the half depth of the section as drawn, so for a section that is not symmetric it is approximate.
            </dd>
          </div>
          <div>
            <dt>Sections that are not symmetric</dt>
            <dd>
              Which flange is in compression decides W_el and W_pl. They are inputs: give <Sym text="W_el" /> and{" "}
              <Sym text="W_pl" /> for the side in compression.
            </dd>
          </div>
          <div>
            <dt>Tension and compression</dt>
            <dd>An axial force along +X that pulls is tension; one that presses is compression. They carry no sagging or hogging.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
