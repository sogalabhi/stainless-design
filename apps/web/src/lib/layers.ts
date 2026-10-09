/**
 * The layers of the big section drawing in the geometry window. Which are shown is a view choice, so
 * it is remembered in localStorage (and works without it). The first four are on at first; the layers
 * that show engine values (centroid, plastic neutral axis, shear centre, principal axes) start off.
 */

export type LayerKey =
  | "dimensions"
  | "flat"
  | "axes"
  | "corners"
  | "centroid"
  | "plastic"
  | "shear"
  | "principal";

export type SketchLayers = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: SketchLayers = {
  dimensions: true,
  flat: true,
  axes: true,
  corners: true,
  centroid: false,
  plastic: false,
  shear: false,
  principal: false,
};

export const LAYER_LABELS: Record<LayerKey, string> = {
  dimensions: "Dimensions",
  flat: "Flat widths c",
  axes: "y-y and z-z axes",
  corners: "Fillets and welds",
  centroid: "Centroid",
  plastic: "Plastic neutral axis",
  shear: "Shear centre",
  principal: "Principal axes (angles)",
};

export const LAYER_ORDER: LayerKey[] = [
  "dimensions",
  "flat",
  "axes",
  "corners",
  "centroid",
  "plastic",
  "shear",
  "principal",
];

const STORAGE_KEY = "stainless-csm.geometry-layers";

/** The remembered layers, or the defaults when nothing is stored or storage is not available. */
export function loadLayers(): SketchLayers {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return DEFAULT_LAYERS;
    const stored = JSON.parse(text) as Partial<Record<LayerKey, unknown>>;
    const layers = { ...DEFAULT_LAYERS };
    for (const key of LAYER_ORDER) {
      if (typeof stored[key] === "boolean") layers[key] = stored[key];
    }
    return layers;
  } catch {
    return DEFAULT_LAYERS;
  }
}

export function saveLayers(layers: SketchLayers): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // storage blocked or full: the choice just is not remembered
  }
}
