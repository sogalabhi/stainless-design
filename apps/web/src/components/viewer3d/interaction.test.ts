import { describe, expect, it } from "vitest";
import { interactionPolicy, isTap, nextActive } from "./interaction";
import { statusBadge } from "./types";

describe("tap to activate", () => {
  it("Interact or a tap activates, Done or Escape releases", () => {
    expect(nextActive("interact")).toBe(true);
    expect(nextActive("tap")).toBe(true);
    expect(nextActive("done")).toBe(false);
    expect(nextActive("escape")).toBe(false);
  });

  it("until active, a finger scrolls the page and the wheel never zooms", () => {
    expect(interactionPolicy(false, "touch")).toEqual({ controls: false, zoom: false, touchAction: "pan-x pan-y pinch-zoom" });
    // a mouse drag never scrolls a page, so it may turn the view at once, but the wheel still scrolls
    expect(interactionPolicy(false, "mouse")).toMatchObject({ controls: true, zoom: false });
  });

  it("once active, every gesture belongs to the view", () => {
    for (const pointer of ["touch", "mouse", "pen"]) {
      expect(interactionPolicy(true, pointer)).toEqual({ controls: true, zoom: true, touchAction: "none" });
    }
  });

  it("a short press in place is a tap, a drag or a long press is not", () => {
    const down = { x: 10, y: 10, time: 0 };
    expect(isTap(down, { x: 13, y: 12, time: 120 })).toBe(true);
    expect(isTap(down, { x: 40, y: 10, time: 120 })).toBe(false);
    expect(isTap(down, { x: 10, y: 10, time: 900 })).toBe(false);
  });
});

describe("the shape badge", () => {
  it("says Illustrative for a drawn wave and names the source of a computed shape", () => {
    expect(statusBadge({ kind: "illustrative" })?.text).toBe("Illustrative");
    expect(statusBadge({ kind: "illustrative", note: "not a result" })?.detail).toBe("not a result");
    expect(statusBadge({ kind: "computed", source: "finite strip, B.5.2(2)" })?.text).toBe(
      "Computed (finite strip, B.5.2(2))",
    );
    expect(statusBadge(undefined)).toBeNull();
  });
});
