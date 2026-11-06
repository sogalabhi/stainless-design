/**
 * The item format of the shared 3D viewer (Viewer3D). Plain data and functions only: nothing here
 * imports three.js, so a page can build items in the main bundle and the viewer stays in a lazy chunk.
 *
 * Axes: the cross-section lies in the x-y plane (x to the right, y up, in mm) and the member runs along
 * z, from -length / 2 to +length / 2. The Front view looks along the member, at the cross-section.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** One region of the cross-section: an outer boundary and its holes, as polygons in mm. */
export type Solid = { outer: Vec2[]; holes?: Vec2[][] };

/**
 * Where a drawn shape comes from, shown as a badge on the view. "illustrative": a picture, not a result
 * (for example waves sized from the slenderness). "computed": a shape an analysis returned, with its
 * source, for example { kind: "computed", source: "finite strip, B.5.2(2)" }.
 */
export type ShapeStatus = { kind: "illustrative"; note?: string } | { kind: "computed"; source: string };

/**
 * The movement of a point (x, y) of the cross-section at s along the member (0 at z = -length / 2, 1 at
 * +length / 2), in mm, in the section plane. A finite strip mode is its cross-section shape times
 * sin(m pi s); an illustrative wave is any such function.
 */
export type Displacement = (x: number, y: number, s: number) => Vec2;

/** The data colours of the viewer: the three zones of the base curve, and one neutral tone. */
export type Tone = "stocky" | "slender" | "not_allowed" | "neutral";

/** An arrow, for example a load: it starts at `from` and points along `direction` for `length` mm. */
export type Arrow = { from: Vec3; direction: Vec3; length: number };

/** A text label anchored to a point of the item (mm). It is HTML: crisp, never rotated or scaled. */
export type AnchoredLabel = { id: string; text: string; at: Vec3 };

export type ViewerItem = {
  id: string;
  /** shown above the item's viewport */
  title: string;
  subtitle?: string;
  /** the cross-section, extruded along z */
  section: Solid[];
  /** drawn member length in mm */
  length: number;
  tone: Tone;
  /** where the drawn shape comes from; no badge when absent (an undeformed section drawn from its dimensions) */
  status?: ShapeStatus;
  displacement?: Displacement;
  /** stations along the member when it is displaced (default 48) */
  stations?: number;
  arrows?: Arrow[];
  labels?: AnchoredLabel[];
};

export type ViewName = "front" | "side" | "top" | "iso";

export type Projection = "orthographic" | "perspective";

/** One legend line, drawn in HTML outside the canvas: a tone swatch or the arrow mark, and its text. */
export type LegendEntry = { key: string; label: string; tone?: Tone; arrow?: boolean };

/** The badge text and its longer explanation (title / screen-reader text). */
export function statusBadge(status: ShapeStatus | undefined): { text: string; detail: string } | null {
  if (!status) return null;
  if (status.kind === "computed") {
    return { text: `Computed (${status.source})`, detail: `The drawn shape is computed: ${status.source}.` };
  }
  return {
    text: "Illustrative",
    detail: status.note ?? "The drawn shape is a picture, not a calculated result.",
  };
}
