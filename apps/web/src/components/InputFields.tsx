import { Ruler } from "lucide-react";
import type { ReactNode } from "react";
import type { BendingAxisKey, FamilyKey, GradeOut, SectionType, StainlessFamily } from "../api/types";
import { asksForAxis, type BendingFormState } from "../lib/bending";
import {
  CIRCULAR,
  dimsOf,
  geometryKind,
  usesDimensions,
  withCustom,
  type DeformationFormState,
  platesFromLinks,
  type LinkRow,
  type NodeRow,
  type PlateRow,
} from "../lib/geometry";
import {
  needsFabrication,
  plateRoles,
  sectionFields,
  type DimField,
  type DimKey,
  type Fabrication,
  type SketchDims,
} from "../lib/sectionTemplates";
import {
  CUSTOM,
  equivalentGrades,
  selectGrade,
  withFu,
  withFy,
  type MaterialFormState,
} from "../lib/material";
import type { TensionFormState } from "../lib/tension";
import { renderSymbols } from "./Symbols";
import { SectionThumbnail } from "./SectionSketch";
import { DataTable, type DataColumn } from "./DataTable";
import { CheckField, NumberField, SelectField } from "./ui";

const FAMILIES: { value: StainlessFamily; label: string }[] = [
  { value: "austenitic", label: "Austenitic" },
  { value: "duplex", label: "Duplex" },
  { value: "ferritic", label: "Ferritic" },
];

export const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "I-section", label: "I-section" },
  { value: "channel", label: "Channel" },
  { value: "T-section", label: "T-section" },
  { value: "angle", label: "Angle" },
  { value: "rectangular hollow section", label: "Rectangular hollow section" },
  { value: "circular hollow section", label: "Circular hollow section" },
];

const FAMILY_LABEL: Record<FamilyKey, string> = {
  flat_plates: "flat plates",
  circular_hollow: "circular hollow section",
};

/** The Material group of the dock. Every number starts empty; a grade only fills in f_y, f_u and the family. */
export function MaterialInputs({
  form,
  onChange,
  grades,
}: {
  form: MaterialFormState;
  onChange: (form: MaterialFormState) => void;
  grades: GradeOut[];
}) {
  const custom = form.designation === CUSTOM;
  const options = [
    { value: CUSTOM, label: "Custom (enter f_y and f_u)" },
    ...grades.map((grade) => ({ value: grade.designation, label: grade.label })),
  ];
  const same = equivalentGrades(grades, form);
  return (
    <>
      <p className="muted">
        {renderSymbols(
          "Give f_y, f_u, E and the family, or pick a grade to fill f_y, f_u and the family from Table 5.1. Grade, f_y and f_u are linked: enter any one and the other two follow the table. Values that match no grade make the material Custom.",
        )}
      </p>
      <SelectField
        label="Grade (Table 5.1)"
        value={form.designation}
        options={options}
        fieldKey="grade"
        onChange={(designation) => onChange(selectGrade(grades, designation, form))}
      />
      <NumberField
        label="f_y"
        unit="N/mm²"
        value={form.fy}
        step={10}
        fieldKey="fy"
        onChange={(fy) => onChange(withFy(grades, fy, form))}
      />
      <NumberField
        label="f_u"
        unit="N/mm²"
        value={form.fu}
        step={10}
        fieldKey="fu"
        onChange={(fu) => onChange(withFu(grades, fu, form))}
      />
      <SelectField
        label="Family"
        value={form.family}
        options={FAMILIES}
        placeholder="choose the family"
        fieldKey="family"
        onChange={(family) => onChange({ ...form, family })}
      />
      {custom ? (
        <CheckField
          label="Values enhanced by cold-forming (B.3(3))"
          fieldKey="enhanced"
          checked={form.enhanced}
          onChange={(enhanced) => onChange({ ...form, enhanced })}
        />
      ) : null}
      <NumberField
        label="E"
        unit="N/mm²"
        value={form.elasticModulus}
        step={1000}
        fieldKey="E"
        onChange={(elasticModulus) => onChange({ ...form, elasticModulus })}
      />
      {same.length > 0 ? (
        <p className="muted">
          {renderSymbols("Same f_y and f_u in Table 5.1 (identical in CSM): ")}
          {same.join(", ")}.
        </p>
      ) : null}
    </>
  );
}

/**
 * The dimension fields of a section template, in the order they are asked. The Section group of the
 * dock and the geometry window both show this component on the same form state, so a value typed in
 * either is the value in both. `highlighted` lights one field (the matching dimension line is under the
 * pointer in the big drawing); `onFocusKey` reports which field has the cursor, so the drawing can light its line.
 */
export function DimensionFields({
  fields,
  dims,
  onChange,
  highlighted = null,
  onFocusKey,
}: {
  fields: DimField[];
  dims: SketchDims;
  onChange: (key: DimKey, value: number | null) => void;
  highlighted?: DimKey | null;
  onFocusKey?: (key: DimKey | null) => void;
}) {
  if (fields.length === 0) return null;
  const keys = new Set<string>(fields.map((field) => field.key));
  const keyOf = (target: EventTarget | null): DimKey | null => {
    const key = (target as HTMLElement | null)?.closest<HTMLElement>("[data-field]")?.dataset.field;
    return key && keys.has(key) ? (key as DimKey) : null;
  };
  return (
    <div
      onFocus={onFocusKey ? (event) => onFocusKey(keyOf(event.target)) : undefined}
      onBlur={onFocusKey ? () => onFocusKey(null) : undefined}
      className="dimension-fields"
    >
      {fields.map((field) => (
        <NumberField
          key={field.key}
          label={field.label}
          unit={field.unit}
          value={dims[field.key]}
          step={field.key === "r" || field.key === "s" || field.key === "rO" ? 1 : 0.5}
          fieldKey={field.key}
          hint={field.hint}
          highlighted={highlighted === field.key}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

/** The fabrication choice of an I-section, channel or T-section (rolled radius r, or weld leg s). */
export function FabricationField({
  value,
  onChange,
}: {
  value: Fabrication | null;
  onChange: (fabrication: Fabrication) => void;
}) {
  return (
    <SelectField
      label="Fabrication"
      value={value}
      options={[
        { value: "rolled", label: "Rolled (root radius r)" },
        { value: "welded", label: "Welded (weld leg s)" },
      ]}
      placeholder="choose rolled or welded"
      fieldKey="fabrication"
      onChange={onChange}
    />
  );
}

/**
 * The Section group: the section type, how it is made, a "Section geometry" button with a small
 * thumbnail (the big drawing, layers and properties are in the window it opens), the dimensions,
 * then the area, γM0 and holes. The dimension fields are the same state as the window's.
 */
export function SectionInputs({
  sectionType,
  onSectionType,
  tension,
  onTensionChange,
  form,
  onFormChange,
  onOpenGeometry,
  areaNote,
}: {
  sectionType: SectionType | null;
  onSectionType: (type: SectionType) => void;
  tension: TensionFormState;
  onTensionChange: (form: TensionFormState) => void;
  form: DeformationFormState;
  onFormChange: (form: DeformationFormState) => void;
  onOpenGeometry: () => void;
  /** what to say under the area field: where its value came from, and whether it matches the geometry */
  areaNote: ReactNode;
}) {
  const set = (patch: Partial<DeformationFormState>) => onFormChange({ ...form, ...patch });
  const showDimensions = sectionType !== null && usesDimensions(form);
  const fields = showDimensions ? sectionFields(sectionType, form.fabrication) : [];
  const dims = dimsOf(form);
  return (
    <div>
      <SelectField
        label="Section type"
        value={sectionType}
        options={SECTION_TYPES}
        placeholder="choose the section type"
        fieldKey="sectionType"
        onChange={onSectionType}
      />
      {sectionType !== null && sectionType !== CIRCULAR && form.kind !== "sigma_cr" ? (
        <SelectField
          label="Geometry"
          value={form.custom ? "custom" : "template"}
          options={[
            { value: "template", label: "Template: the standard dimensions" },
            { value: "custom", label: "Custom: nodes and links in two tables (paste from Excel)" },
          ]}
          fieldKey="geometry"
          onChange={(choice) => onFormChange(withCustom(form, choice === "custom"))}
        />
      ) : null}
      {sectionType !== null && form.kind === "template" && needsFabrication(sectionType) ? (
        <FabricationField value={form.fabrication} onChange={(fabrication) => set({ fabrication })} />
      ) : null}
      {sectionType !== null && showDimensions ? (
        <button type="button" className="geometry-button" aria-haspopup="dialog" onClick={onOpenGeometry}>
          <SectionThumbnail shape={sectionType} fabrication={form.fabrication} dims={dims} />
          <span className="geometry-button-text">
            <span className="geometry-button-title">
              <Ruler size={16} aria-hidden="true" /> Section geometry
            </span>
            <span className="muted">Large drawing, layers and the properties computed from your dimensions</span>
          </span>
        </button>
      ) : null}
      {form.kind === "plates" ? <PlatesEditor form={form} onChange={onFormChange} /> : null}
      {sectionType !== null && form.kind === "sigma_cr" ? (
        <p className="muted">{renderSymbols("A typed σ_cr,cs needs no section dimensions.")}</p>
      ) : null}
      <DimensionFields
        fields={fields}
        dims={dims}
        onChange={(key, value) => set({ [key]: value } as Partial<DeformationFormState>)}
      />
      <NumberField
        label="Area A"
        unit="mm²"
        value={tension.area}
        step={100}
        fieldKey="area"
        onChange={(area) => onTensionChange({ ...tension, area })}
        note={areaNote}
      />
      <NumberField
        label="γM0"
        value={tension.gammaM0}
        step={0.05}
        fieldKey="gammaM0"
        onChange={(gammaM0) => onTensionChange({ ...tension, gammaM0 })}
      />
      <CheckField
        label="Section has holes (bolt holes, slots)"
        fieldKey="hasHoles"
        checked={tension.hasHoles}
        onChange={(hasHoles) => onTensionChange({ ...tension, hasHoles })}
      />
    </div>
  );
}

/** The Deformation group (B.5). The section type has already chosen the template, tube or plates. */
export function DeformationInputs({
  form,
  onChange,
  sectionType,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
  sectionType: SectionType | null;
}) {
  const set = (patch: Partial<DeformationFormState>) => onChange({ ...form, ...patch });
  if (sectionType === null || form.kind === null) {
    return <p className="muted">Choose the section type in the Section group first: it decides which fields apply here.</p>;
  }
  const circular = sectionType === CIRCULAR;
  const roles = plateRoles(sectionType, form.fabrication);
  return (
    <>
      <SelectField
        label="Slenderness from"
        value={form.kind}
        options={
          circular
            ? [
                { value: "chs", label: "Diameter and thickness (B.10, B.11)" },
                { value: "sigma_cr", label: "A typed critical stress σ_cr,cs" },
              ]
            : [
                {
                  value: geometryKind(form, sectionType),
                  label: form.custom
                    ? "The custom plates of the Section group (B.9)"
                    : "Section dimensions (8.2.2(5))",
                },
                { value: "sigma_cr", label: "A typed critical stress σ_cr,cs" },
              ]
        }
        fieldKey="route"
        onChange={(kind) => set({ kind })}
      />
      {form.kind === "template" ? (
        <>
          <p className="muted">
            {renderSymbols(
              "The engine derives the flat width c of each plate from the dimensions in the Section group. k_σ of each plate is yours to give (EN 1993-1-5, 6.4.1): internal plates and outstands use different cases.",
            )}
          </p>
          {roles.map((plate) => (
            <NumberField
              key={plate.role}
              label={`k_σ, ${plate.name.toLowerCase()} (${plate.kind})`}
              value={form.kSigma[plate.role]}
              step={0.01}
              fieldKey={`kSigma-${plate.role}`}
              hint={`${plate.name}, ${plate.kind} plate: ${plate.formula}.`}
              onChange={(value) => set({ kSigma: { ...form.kSigma, [plate.role]: value } })}
            />
          ))}
        </>
      ) : null}
      {form.kind === "plates" ? (
        <p className="muted">
          {renderSymbols("b̄ is the length of each link between its two nodes; t and k_σ are columns of the links table in the Section group.")}
        </p>
      ) : null}
      {form.kind === "sigma_cr" ? (
        <>
          <NumberField
            label="σ_cr,cs"
            unit="N/mm²"
            value={form.sigmaCr}
            step={10}
            fieldKey="sigmaCr"
            onChange={(sigmaCr) => set({ sigmaCr })}
          />
          {form.family ? (
            <p className="muted">
              Treated as {FAMILY_LABEL[form.family]}, from the section type.
            </p>
          ) : null}
        </>
      ) : null}
      {form.kind !== "sigma_cr" ? (
        <NumberField
          label="Poisson's ratio ν"
          value={form.poissonRatio}
          step={0.05}
          fieldKey="nu"
          onChange={(poissonRatio) => set({ poissonRatio })}
        />
      ) : null}
      <NumberField label="Ω" value={form.omega} step={1} fieldKey="omega" onChange={(omega) => set({ omega })} />
    </>
  );
}

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
 * between its nodes, so the geometry is drawn, not listed.
 */
function PlatesEditor({
  form,
  onChange,
}: {
  form: DeformationFormState;
  onChange: (form: DeformationFormState) => void;
}) {
  const update = (nodes: NodeRow[], links: LinkRow[]) =>
    onChange({ ...form, nodes, links, plates: platesFromLinks(nodes, links) });
  const area = form.plates.reduce<number | null>(
    (sum, p) => (sum === null || p.width === null || p.thickness === null ? null : sum + p.width * p.thickness),
    0,
  );
  return (
    <div className="node-editor">
      <DataTable
        caption="Nodes: the corner and end points of the section (x, y)"
        columns={NODE_COLUMNS}
        rows={form.nodes}
        onChange={(nodes) => update(nodes, form.links)}
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
        rows={form.links}
        onChange={(links) => update(form.nodes, links)}
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
      <NodeLinkPreview nodes={form.nodes} links={form.links} plates={form.plates} />
      {area !== null && form.plates.length > 0 ? (
        <p className="muted">
          {renderSymbols(`Σ b̄·t = ${Math.round(area * 10) / 10} mm² from the links; the link lengths are the flat widths b̄.`)}
        </p>
      ) : null}
    </div>
  );
}

/** The section the tables describe: each link a line as thick as the plate (to scale), nodes numbered. */
function NodeLinkPreview({ nodes, links, plates }: { nodes: NodeRow[]; links: LinkRow[]; plates: PlateRow[] }) {
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
  return (
    <svg
      className="node-preview"
      role="img"
      aria-label="Section drawn from the nodes and links"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxHeight: 240 }}
    >
      {links.map((link) => {
        const a = at(link.from);
        const b = at(link.to);
        if (!a || !b) return null;
        const plate = plates.find((p) => p.id === link.uid);
        const t = Math.max(link.thickness ?? span * 0.012, span * 0.008);
        return (
          <line
            key={link.uid}
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
        );
      })}
      {pts.map((n) => (
        <g key={n.id}>
          <circle cx={fx(n.x)} cy={fy(n.y)} r={span * 0.012} fill="var(--accent, #c0392b)" />
          <text
            x={fx(n.x) + span * 0.025}
            y={fy(n.y) - span * 0.025}
            fontSize={span * 0.05}
            fill="currentColor"
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

const AXES: { value: BendingAxisKey; label: string }[] = [
  { value: "major", label: "Major axis (y-y)" },
  { value: "minor", label: "Minor axis (z-z)" },
];

/**
 * The Bending group (B.6.3.1(1), B.6.3.2). Everything here starts empty: the axis of bending, W_el and
 * W_pl about it, λ_LT, and the plate buckling factors of the bending stress pattern, which are
 * separate from the compression ones in the Deformation group. α is not typed: Table B.2 is in the
 * PDF, so the engine looks it up from the section type and the axis.
 */
export function BendingInputs({
  sectionType,
  deformation,
  form,
  onChange,
  wElNote,
  wPlNote,
}: {
  sectionType: SectionType | null;
  deformation: DeformationFormState;
  form: BendingFormState;
  onChange: (form: BendingFormState) => void;
  /** under W_el and W_pl: where a copied value came from (the Use button in the geometry window) */
  wElNote?: ReactNode;
  wPlNote?: ReactNode;
}) {
  const set = (patch: Partial<BendingFormState>) => onChange({ ...form, ...patch });
  // W_el, W_pl and λ_LT do not depend on the shape; the axis and the plate k_σ do, so they wait for the type.
  const known = sectionType !== null && deformation.kind !== null;
  const roles = plateRoles(sectionType, deformation.fabrication);
  return (
    <>
      <p className="muted">
        {renderSymbols(
          "Bending about an axis of symmetry (B.6.3.2). W_el, W_pl and λ_LT are outside Annex B, so they are yours to give. The bending k_σ are separate from the compression ones: the stress pattern is different. α comes from Table B.2.",
        )}
      </p>
      {!known ? (
        <p className="muted">Choose the section type in the Section group first: it decides the axis and the plate k_σ asked for here.</p>
      ) : null}
      {known && asksForAxis(sectionType) ? (
        <SelectField
          label="Axis of bending"
          value={form.axis}
          options={AXES}
          placeholder="choose the axis"
          fieldKey="axis"
          onChange={(axis) => set({ axis })}
        />
      ) : null}
      <SelectField
        label="Direction of bending"
        value={form.direction}
        options={[
          { value: "sagging", label: "Sagging (+M): compression at the top" },
          { value: "hogging", label: "Hogging (−M): compression at the bottom" },
        ]}
        fieldKey="direction"
        onChange={(direction) => set({ direction })}
      />
      <p className="muted">
        {renderSymbols("Sets the compression side on the Stage and the sign of M and κ; the resistance is a magnitude. For a section that is not symmetric, give W_el and W_pl for the side in compression.")}
      </p>
      {known && !asksForAxis(sectionType) ? (
        <p className="muted">A circular hollow section bends alike about every axis, so no axis is asked for (Table B.2: any).</p>
      ) : null}
      <NumberField
        label="Elastic modulus W_el"
        unit="mm³"
        value={form.wEl}
        step={1000}
        fieldKey="wEl"
        onChange={(wEl) => set({ wEl })}
        note={wElNote}
      />
      <NumberField
        label="Plastic modulus W_pl"
        unit="mm³"
        value={form.wPl}
        step={1000}
        fieldKey="wPl"
        onChange={(wPl) => set({ wPl })}
        note={wPlNote}
      />
      <NumberField
        label="Relative slenderness λ_LT"
        value={form.lambdaLT}
        step={0.05}
        fieldKey="lambdaLT"
        onChange={(lambdaLT) => set({ lambdaLT })}
      />
      {deformation.kind === "template"
        ? roles.map((plate) => (
            <NumberField
              key={plate.role}
              label={`k_σ in bending, ${plate.name.toLowerCase()} (${plate.kind})`}
              value={form.kSigma[plate.role]}
              step={0.01}
              fieldKey={`kSigmaB-${plate.role}`}
              hint={`${plate.name}, ${plate.kind} plate, with its stress ratio ψ when the section bends about the chosen axis.`}
              onChange={(value) => set({ kSigma: { ...form.kSigma, [plate.role]: value } })}
            />
          ))
        : null}
      {deformation.kind === "plates"
        ? deformation.plates.map((row) => (
            <NumberField
              key={row.id}
              label={`k_σ in bending, ${row.label || "plate"}`}
              value={form.plateKSigma[row.id] ?? null}
              step={0.01}
              fieldKey={`plate-${row.id}-kSigmaB`}
              onChange={(value) => set({ plateKSigma: { ...form.plateKSigma, [row.id]: value } })}
            />
          ))
        : null}
      {deformation.kind === "sigma_cr" ? (
        <NumberField
          label="σ_cr,cs in bending"
          unit="N/mm²"
          value={form.sigmaCr}
          step={10}
          fieldKey="sigmaCrBending"
          onChange={(sigmaCr) => set({ sigmaCr })}
        />
      ) : null}
      {deformation.kind === "chs" ? (
        <p className="muted">{renderSymbols("The tube formula B.11 holds for compression and bending, so a circular hollow section needs no k_σ here.")}</p>
      ) : null}
    </>
  );
}
