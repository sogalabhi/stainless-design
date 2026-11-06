/**
 * Where the HTML labels go in a viewport: each anchor is projected to pixels (by the viewer), then the
 * labels are placed one after another, each moved up or down past the labels already placed so that
 * none overlaps another; a label that cannot be placed inside the viewport is hidden.
 */

export type LabelBox = {
  id: string;
  /** the anchor in viewport pixels, y down */
  x: number;
  y: number;
  width: number;
  height: number;
  /** false when the anchor is behind the camera or outside the clip volume */
  inView?: boolean;
};

export type PlacedLabel = { id: string; left: number; top: number; visible: boolean };

/** Normalised device coordinates (-1 to 1, y up) to viewport pixels (y down). */
export function ndcToPixels(ndc: [number, number, number], width: number, height: number) {
  return {
    x: ((ndc[0] + 1) / 2) * width,
    y: ((1 - ndc[1]) / 2) * height,
    inView: ndc[2] >= -1 && ndc[2] <= 1 && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1,
  };
}

type Rect = { left: number; top: number; right: number; bottom: number };

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

/**
 * Place labels to the upper right of their anchors (offset `offset` px), in the order given. Each one
 * tries its own spot, then steps of one label height up and down; it is hidden when every spot overlaps
 * a placed label or leaves the viewport.
 */
export function placeLabels(
  boxes: LabelBox[],
  width: number,
  height: number,
  { offset = 6, gap = 2, tries = 4 }: { offset?: number; gap?: number; tries?: number } = {},
): PlacedLabel[] {
  const placed: Rect[] = [];
  return boxes.map((box) => {
    if (box.inView === false) return { id: box.id, left: 0, top: 0, visible: false };
    const left = Math.min(Math.max(box.x + offset, 0), Math.max(width - box.width, 0));
    const base = box.y - offset - box.height;
    const step = box.height + gap;
    const candidates = [0];
    for (let i = 1; i <= tries; i += 1) candidates.push(-i * step, i * step);
    for (const shift of candidates) {
      const top = base + shift;
      const rect = { left, top, right: left + box.width, bottom: top + box.height };
      if (rect.top < 0 || rect.bottom > height) continue;
      if (placed.some((other) => overlaps(rect, other, gap))) continue;
      placed.push(rect);
      return { id: box.id, left, top, visible: true };
    }
    return { id: box.id, left, top: base, visible: false };
  });
}
