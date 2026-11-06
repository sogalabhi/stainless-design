import { describe, expect, it } from "vitest";
import { VIEW_DIRECTION, boxCorners, fitHalfHeight, fitKey, perspectiveDistance, screenAxes } from "./camera";

function close(a: number[], b: number[], digits = 3) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], digits));
}

describe("camera presets", () => {
  it("Front looks along the member: the cross-section with x to the right and y up", () => {
    const { right, up } = screenAxes(VIEW_DIRECTION.front);
    close(right, [1, 0, 0]);
    close(up, [0, 1, 0]);
  });

  it("Side and Top show the member running left to right (+z to the right)", () => {
    close(screenAxes(VIEW_DIRECTION.side).right, [0, 0, 1]);
    close(screenAxes(VIEW_DIRECTION.side).up, [0, 1, 0]);
    close(screenAxes(VIEW_DIRECTION.top).right, [0, 0, 1]);
    close(screenAxes(VIEW_DIRECTION.top).up, [1, 0, 0]);
  });

  it("Iso is equally inclined to the three axes, from above", () => {
    const [x, y, z] = VIEW_DIRECTION.iso;
    expect(Math.abs(x)).toBeCloseTo(1 / Math.sqrt(3));
    expect(y).toBeCloseTo(1 / Math.sqrt(3));
    expect(Math.abs(z)).toBeCloseTo(1 / Math.sqrt(3));
  });
});

describe("fit", () => {
  // a member 100 wide, 200 high and 400 long, centred
  const box = boxCorners([-50, -100, -200], [50, 100, 200]);

  it("from the front, the height governs in a wide viewport", () => {
    expect(fitHalfHeight(box, VIEW_DIRECTION.front, 2, 1)).toBeCloseTo(100);
  });

  it("from the side, the length governs unless the viewport is wide enough", () => {
    expect(fitHalfHeight(box, VIEW_DIRECTION.side, 1, 1)).toBeCloseTo(200);
    expect(fitHalfHeight(box, VIEW_DIRECTION.side, 4, 1)).toBeCloseTo(100);
  });

  it("adds the margin, and one half-height serves every item (one scale)", () => {
    const small = boxCorners([-10, -10, -10], [10, 10, 10]);
    expect(fitHalfHeight([...box, ...small], VIEW_DIRECTION.front, 2, 1.1)).toBeCloseTo(110);
  });

  it("a perspective camera stands back far enough to show the same half-height", () => {
    const distance = perspectiveDistance(100, 30, 0);
    expect(distance * Math.tan(Math.PI / 12)).toBeCloseTo(100);
  });

  it("refits only for other items or another overall size", () => {
    expect(fitKey(["a", "b"], 123.456)).toBe(fitKey(["a", "b"], 123.4));
    expect(fitKey(["a", "b"], 123.4)).not.toBe(fitKey(["a"], 123.4));
    expect(fitKey(["a"], 100)).not.toBe(fitKey(["a"], 200));
  });
});
