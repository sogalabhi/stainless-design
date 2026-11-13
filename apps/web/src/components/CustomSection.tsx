import type { SectionPropertiesResponse } from "../api/types";
import { platesFromLinks, type LinkRow, type NodeRow, type PlateRow } from "../lib/geometry";
import type { SketchLayers } from "../lib/layers";
import { DataTable, type DataColumn } from "./DataTable";

const NODE_LIMIT = 40;
const LINK_LIMIT = 40;

const NODE_COLUMNS: DataColumn<NodeRow>[] = [
  {
    key: "id",
    label: "Node",
    kind: "number",
    get: (row) => row.id,
    set: (row, value) => ({ ...row, id: value as number | null }),
  },
  {
    key: "x",
    label: "x",
    unit: "mm",
    kind: "number",
    get: (row) => row.x,
    set: (row, value) => ({ ...row, x: value as number | null }),
    fieldKey: (row) => `node-${row.uid}-x`,
  },
  {
    key: "y",
    label: "y",
    unit: "mm",
    kind: "number",
    get: (row) => row.y,
    set: (row, value) => ({ ...row, y: value as number | null }),
    fieldKey: (row) => `node-${row.uid}-y`,
  },
];

const LINK_COLUMNS: DataColumn<LinkRow>[] = [
  {
    key: "label",
    label: "Name",
    kind: "text",
    get: (row) => row.label,
    set: (row, value) => ({ ...row, label: String(value ?? "") }),
  },
  {
    key: "from",
    label: "From node",
    short: "From",
    kind: "number",
    get: (row) => row.from,
    set: (row, value) => ({ ...row, from: value as number | null }),
    fieldKey: (row) => `plate-${row.uid}-width`,
  },
  {
    key: "to",
    label: "To node",
    short: "To",
    kind: "number",
    get: (row) => row.to,
    set: (row, value) => ({ ...row, to: value as number | null }),
  },
  {
    key: "thickness",
    label: "Thickness t",
    short: "t",
    unit: "mm",
    kind: "number",
    get: (row) => row.thickness,
    set: (row, value) => ({ ...row, thickness: value as number | null }),
    fieldKey: (row) => `plate-${row.uid}-thickness`,
    helpKey: "plate-1-thickness",
  },
  {
    key: "kSigma",
    label: "k_σ",
    kind: "number",
    get: (row) => row.kSigma,
    set: (row, value) => ({ ...row, kSigma: value as number | null }),
    fieldKey: (row) => `plate-${row.uid}-kSigma`,
    helpKey: "plate-1-kSigma",
  },
];

/** A new node gets the next free number; x and y start empty. */
export function newNodeRow(rows: NodeRow[]): NodeRow {
  const uid = Math.max(0, ...rows.map((row) => row.uid)) + 1;
  const id = Math.max(0, ...rows.map((row) => row.id ?? 0)) + 1;
  return { uid, id, x: null, y: null };
}

export function newLinkRow(rows: LinkRow[]): LinkRow {
  const uid = Math.max(0, ...rows.map((row) => row.uid)) + 1;
  return { uid, label: `link ${uid}`, from: null, to: null, thickness: null, kSigma: null };
}

/**
 * The custom section is two tables, as in a finite-strip or FE model: the nodes (x, y) and the links
 * between them (from node, to node, thickness, k_σ). The flat width b̄ of each link is the distance
 * between its nodes, so the geometry is drawn, not listed. Paste cells copied from Excel into either.
 */
export function NodeLinkTables({
  nodes,
  links,
  onChange,
}: {
  nodes: NodeRow[];
  links: LinkRow[];
  onChange: (nodes: NodeRow[], links: LinkRow[], plates: PlateRow[]) => void;
}) {
  const update = (nextNodes: NodeRow[], nextLinks: LinkRow[]) =>
    onChange(nextNodes, nextLinks, platesFromLinks(nextNodes, nextLinks));
  return (
    <div className="node-editor">
      <DataTable
        caption="Nodes: the corner and end points of the section (x, y)"
        columns={NODE_COLUMNS}
        rows={nodes}
        onChange={(next) => update(next, links)}
        rowKey={(row) => row.uid}
        rowName={(row) => `node ${row.id ?? row.uid}`}
        newRow={newNodeRow}
        isEmpty={(row) => row.x === null && row.y === null}
        minRows={2}
        maxRows={NODE_LIMIT}
      />
      <DataTable
        caption="Links: the flat plates between two nodes"
        columns={LINK_COLUMNS}
        rows={links}
        onChange={(next) => update(nodes, next)}
        rowKey={(row) => row.uid}
        rowName={(row) => row.label || `link ${row.uid}`}
        newRow={newLinkRow}
        isEmpty={(row) =>
          row.from === null &&
          row.to === null &&
          row.thickness === null &&
          row.kSigma === null &&
          (row.label.trim() === "" || row.label === `link ${row.uid}`)
        }
        minRows={1}
        maxRows={LINK_LIMIT}
      />
    </div>
  );
}

/**
 * The section the tables describe: each link a line as thick as the plate (to scale), nodes numbered.
 * With the engine's properties for exactly these tables it can also mark the centroid and the plastic
 * neutral axes (the x of the tables is the y direction of the section and the y of the tables is z).
 */
export function NodeLinkPreview({
  nodes,
  links,
  plates,
  properties = null,
  layers = null,
  maxHeight = 240,
}: {
  nodes: NodeRow[];
  links: LinkRow[];
  plates: PlateRow[];
  properties?: SectionPropertiesResponse | null;
  layers?: Pick<SketchLayers, "dimensions" | "flat" | "axes" | "centroid" | "plastic" | "principal"> | null;
  maxHeight?: number;
}) {
  const pts = nodes.filter((n) => n.id !== null && n.x !== null && n.y !== null) as {
    id: number;
    x: number;
    y: number;
  }[];
  if (pts.length < 2) return null;
  const xs = pts.map((n) => n.x);
  const ys = pts.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1);
  const pad = span * 0.14;
  const W = x1 - x0 + 2 * pad;
  const H = y1 - y0 + 2 * pad;
  const at = (id: number | null) => pts.find((n) => n.id === id);
  const fy = (y: number) => y1 - y + pad; // y points up on the page
  const fx = (x: number) => x - x0 + pad;
  const centroid = properties && layers?.centroid ? properties.centroid : null;
  const plastic = properties && layers?.plastic ? properties : null;
  const axes = properties && layers?.axes ? properties.centroid : null;
  const principal = properties?.principal && layers?.principal ? properties : null;
  const fontSize = span * 0.04;
  const num = (v: number) => String(Math.round(v * 100) / 100);
  return (
    <svg
      className="node-preview"
      role="img"
      aria-label="Section drawn from the nodes and links"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxHeight }}
    >
      {links.map((link) => {
        const a = at(link.from);
        const b = at(link.to);
        if (!a || !b) return null;
        const plate = plates.find((p) => p.id === link.uid);
        const t = Math.max(link.thickness ?? span * 0.012, span * 0.008);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        // the unit normal on the page (y points down there), to set labels beside the link
        const nx = length > 0 ? (b.y - a.y) / length : 0;
        const ny = length > 0 ? (b.x - a.x) / length : 0;
        const offset = span * 0.06;
        const flat = layers?.flat && plate?.width != null;
        return (
          <g key={link.uid}>
            <line
              x1={fx(a.x)}
              y1={fy(a.y)}
              x2={fx(b.x)}
              y2={fy(b.y)}
              stroke="currentColor"
              strokeOpacity={0.75}
              strokeWidth={t}
              strokeLinecap="butt"
            >
              <title>{`${plate?.label ?? "link"}: b̄ = ${plate?.width ?? "?"} mm`}</title>
            </line>
            {flat ? (
              <g data-layer="flat" stroke="var(--accent, #c0392b)" strokeWidth={span * 0.004} fill="var(--accent, #c0392b)">
                <line
                  x1={fx(a.x) + nx * offset}
                  y1={fy(a.y) - ny * offset}
                  x2={fx(b.x) + nx * offset}
                  y2={fy(b.y) - ny * offset}
                />
                <text
                  x={fx(mid.x) + nx * offset * 1.9}
                  y={fy(mid.y) - ny * offset * 1.9}
                  fontSize={fontSize}
                  textAnchor="middle"
                  stroke="none"
                >
                  {`b̄ ${num(length)}`}
                </text>
              </g>
            ) : null}
            {layers?.dimensions && link.thickness !== null ? (
              <text
                data-layer="dimensions"
                x={fx(mid.x) - nx * offset * 1.6}
                y={fy(mid.y) + ny * offset * 1.6}
                fontSize={fontSize}
                textAnchor="middle"
                fill="currentColor"
              >
                {`t ${num(link.thickness)}`}
              </text>
            ) : null}
          </g>
        );
      })}
      {plastic ? (
        <g stroke="var(--accent, #c0392b)" strokeWidth={span * 0.006} strokeDasharray={`${span * 0.03} ${span * 0.02}`}>
          <line x1={0} x2={W} y1={fy(plastic.plastic_axis_y)} y2={fy(plastic.plastic_axis_y)}>
            <title>Plastic neutral axis for y-y</title>
          </line>
          <line y1={0} y2={H} x1={fx(plastic.plastic_axis_z)} x2={fx(plastic.plastic_axis_z)}>
            <title>Plastic neutral axis for z-z</title>
          </line>
        </g>
      ) : null}
      {axes ? (
        <g data-layer="axes" stroke="currentColor" strokeOpacity={0.5} strokeWidth={span * 0.004} strokeDasharray={`${span * 0.05} ${span * 0.015} ${span * 0.005} ${span * 0.015}`}>
          <line x1={0} x2={W} y1={fy(axes.z)} y2={fy(axes.z)} />
          <line y1={0} y2={H} x1={fx(axes.y)} x2={fx(axes.y)} />
          <text x={W - span * 0.01} y={fy(axes.z) - span * 0.012} fontSize={fontSize} textAnchor="end" fill="currentColor" stroke="none">y-y</text>
          <text x={fx(axes.y) + span * 0.012} y={fontSize} fontSize={fontSize} fill="currentColor" stroke="none">z-z</text>
        </g>
      ) : null}
      {principal && principal.principal ? (
        <g data-layer="principal" stroke="var(--accent, #c0392b)" strokeWidth={span * 0.004}>
          {(
            [
              ["u", principal.principal.angle_deg],
              ["v", principal.principal.angle_deg + 90],
            ] as const
          ).map(([name, degrees]) => {
            const dx = Math.cos((degrees * Math.PI) / 180);
            const dy = -Math.sin((degrees * Math.PI) / 180); // z up on the page
            const c = { x: fx(principal.centroid.y), y: fy(principal.centroid.z) };
            const reach = span * 0.6;
            return (
              <g key={name}>
                <line x1={c.x - dx * reach} y1={c.y - dy * reach} x2={c.x + dx * reach} y2={c.y + dy * reach} />
                <text x={c.x + dx * reach} y={c.y + dy * reach} fontSize={fontSize} fill="var(--accent, #c0392b)" stroke="none">{name}</text>
              </g>
            );
          })}
        </g>
      ) : null}
      {centroid ? (
        <g stroke="var(--accent, #c0392b)" strokeWidth={span * 0.008}>
          <line x1={fx(centroid.y) - span * 0.03} x2={fx(centroid.y) + span * 0.03} y1={fy(centroid.z)} y2={fy(centroid.z)} />
          <line y1={fy(centroid.z) - span * 0.03} y2={fy(centroid.z) + span * 0.03} x1={fx(centroid.y)} x2={fx(centroid.y)} />
          <circle cx={fx(centroid.y)} cy={fy(centroid.z)} r={span * 0.018} fill="none">
            <title>Centroid</title>
          </circle>
        </g>
      ) : null}
      {pts.map((n) => (
        <g key={n.id}>
          <circle cx={fx(n.x)} cy={fy(n.y)} r={span * 0.012} fill="var(--accent, #c0392b)" />
          <text x={fx(n.x) + span * 0.025} y={fy(n.y) - span * 0.025} fontSize={span * 0.05} fill="currentColor">
            {layers?.dimensions ? `${n.id} (${num(n.x)}, ${num(n.y)})` : n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
