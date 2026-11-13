import type { UseQueryResult } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { ApiError } from "../api/client";
import type { BendingAxisKey, SectionPropertiesResponse } from "../api/types";
import type { DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";
import { LAYER_LABELS, loadLayers, saveLayers, type LayerKey, type SketchLayers } from "../lib/layers";
import { NodeLinkPreview, NodeLinkTables } from "./CustomSection";
import { Modal } from "./Modal";
import { PropertiesSection } from "./PropertiesSection";
import { CheckField } from "./ui";

// The shear centre needs a warping analysis a line model does not have, and a line model has no
// fillets or welds: those two layers of the template drawing do not exist here.
const CUSTOM_LAYERS: LayerKey[] = ["dimensions", "flat", "axes", "centroid", "plastic", "principal"];

const CUSTOM_LABELS: Partial<Record<LayerKey, string>> = {
  dimensions: "Node coordinates and thicknesses t",
  flat: "Flat widths b̄",
  principal: "Principal axes u and v",
};

/**
 * The window of a custom section, the counterpart of the template's Section geometry window: the two
 * tables (nodes and links, with paste from Excel), a to-scale drawing of what they describe, and the
 * properties the engine computed from them. Same form state as the dock, not a copy.
 */
export function CustomSectionModal({
  form,
  onFormChange,
  query,
  properties,
  stale,
  missing,
  currentValues,
  bendingAxis,
  onUse,
  onClose,
}: {
  form: DeformationFormState;
  onFormChange: (form: DeformationFormState) => void;
  query: UseQueryResult<SectionPropertiesResponse, ApiError>;
  /** the engine's properties for exactly the tables now typed, or null (none yet, or out of date) */
  properties: SectionPropertiesResponse | null;
  stale: boolean;
  missing: MissingItem[];
  currentValues: Record<string, number | null>;
  bendingAxis: BendingAxisKey | null;
  onUse: (key: string, value: number) => void;
  onClose: () => void;
}) {
  const [layers, setLayers] = useState<SketchLayers>(loadLayers);
  const dialog = useRef<HTMLDivElement>(null);
  const toggle = (key: LayerKey, on: boolean) =>
    setLayers((previous) => {
      const next = { ...previous, [key]: on };
      saveLayers(next);
      return next;
    });
  const go = (item: MissingItem) =>
    dialog.current?.querySelector<HTMLElement>(`[data-field="${item.field}"] input`)?.focus();
  return (
    <Modal title="Custom section: nodes and links" titleId="custom-title" onClose={onClose} dialogRef={dialog}>
      <div className="modal-drawing">
        <NodeLinkPreview
          nodes={form.nodes}
          links={form.links}
          plates={form.plates}
          properties={properties}
          layers={layers}
          maxHeight={560}
        />
      </div>
      <div className="modal-side">
        <fieldset className="layers">
          <legend>Show</legend>
          {CUSTOM_LAYERS.map((key) => (
            <CheckField key={key} label={CUSTOM_LABELS[key] ?? LAYER_LABELS[key]} checked={layers[key]} onChange={(on) => toggle(key, on)} />
          ))}
          <p className="muted">
            Centroid, axes and plastic neutral axes are drawn from the engine&apos;s values, to scale. Your x is the
            y direction of the section and your y is z. No shear centre (it needs a warping analysis) and no fillets
            or welds: a custom section is a set of flat plates.
          </p>
        </fieldset>
        <section aria-label="Nodes and links">
          <h3>Nodes and links</h3>
          <p className="muted">
            Each link is a flat plate between two nodes; its length is the flat width b̄. Paste cells copied from
            Excel into a table. The same tables as the Section group of the dock.
          </p>
          <NodeLinkTables
            nodes={form.nodes}
            links={form.links}
            onChange={(nodes, links, plates) => onFormChange({ ...form, nodes, links, plates })}
          />
        </section>
        <PropertiesSection
          query={query}
                    stale={stale}
          missing={missing}
          onGo={go}
          currentValues={currentValues}
          bendingAxis={bendingAxis}
          onUse={onUse}
        />
      </div>
    </Modal>
  );
}
