import { useMemo } from "react";
import { exploreItems, type SceneItem } from "../lib/exploreScene";
import type { LegendEntry } from "./viewer3d/types";
import Viewer3D from "./viewer3d/Viewer3D";

export type { SceneItem } from "../lib/exploreScene";

const LEGEND: LegendEntry[] = [
  { key: "stocky", label: "Stocky", tone: "stocky" },
  { key: "slender", label: "Slender", tone: "slender" },
  { key: "not_allowed", label: "Beyond the limit of the method", tone: "not_allowed" },
  { key: "arrow", label: "Compression", arrow: true },
];

/**
 * The Explore tab's 3D comparison: each section in its own view of the shared viewer, all through one
 * camera and at one scale. Loaded lazily, so three.js stays out of the main bundle.
 */
export default function SectionScene({ items, dark }: { items: SceneItem[]; dark: boolean }) {
  const viewerItems = useMemo(() => exploreItems(items), [items]);
  return <Viewer3D items={viewerItems} dark={dark} label="3D view of the sections, side by side" legend={LEGEND} />;
}
