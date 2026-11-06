import { describe, expect, it } from "vitest";
import { ndcToPixels, placeLabels } from "./labels";

describe("label placement", () => {
  it("maps the clip square to viewport pixels, y down", () => {
    expect(ndcToPixels([0, 0, 0], 200, 100)).toEqual({ x: 100, y: 50, inView: true });
    expect(ndcToPixels([-1, 1, 0], 200, 100)).toMatchObject({ x: 0, y: 0 });
    expect(ndcToPixels([0, 0, 1.5], 200, 100).inView).toBe(false);
  });

  it("puts a label above and to the right of its anchor", () => {
    const [placed] = placeLabels([{ id: "a", x: 50, y: 60, width: 40, height: 14 }], 200, 100);
    expect(placed).toEqual({ id: "a", left: 56, top: 40, visible: true });
  });

  it("moves a label that would overlap one already placed", () => {
    const boxes = [
      { id: "a", x: 50, y: 60, width: 40, height: 14 },
      { id: "b", x: 52, y: 62, width: 40, height: 14 },
    ];
    const [a, b] = placeLabels(boxes, 200, 100);
    expect(a.visible && b.visible).toBe(true);
    expect(Math.abs(a.top - b.top)).toBeGreaterThanOrEqual(14);
  });

  it("keeps labels inside the viewport and hides what cannot fit or is out of view", () => {
    const [edge] = placeLabels([{ id: "a", x: 195, y: 60, width: 40, height: 14 }], 200, 100);
    expect(edge.left).toBe(160);
    const [hidden] = placeLabels([{ id: "a", x: 50, y: 60, width: 40, height: 14, inView: false }], 200, 100);
    expect(hidden.visible).toBe(false);
    const crowd = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, x: 50, y: 50, width: 40, height: 14 }));
    expect(placeLabels(crowd, 200, 60).filter((p) => p.visible).length).toBeLessThan(12);
  });
});
