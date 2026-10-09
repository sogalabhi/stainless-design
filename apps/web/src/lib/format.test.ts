import { describe, expect, it } from "vitest";
import { formatKn, formatKnM, formatNumber, formatPercent, knM } from "./format";

describe("formatNumber", () => {
  it("keeps significant figures for small values", () => {
    expect(formatNumber(0.00105)).toBe("0.00105");
    expect(formatNumber(0.58)).toBe("0.58");
  });
  it("adds thousands spaces to large values", () => {
    expect(formatNumber(3160.8)).toBe("3 160.8");
  });
  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatKn / formatPercent", () => {
  it("converts newtons to kilonewtons only for display", () => {
    expect(formatKn(233_145)).toBe("233.1");
  });
  it("converts newton millimetres to kilonewton metres only for display", () => {
    expect(knM(46_910_950)).toBeCloseTo(46.91095, 9);
    expect(formatKnM(46_910_950)).toBe("46.91");
    expect(formatKnM(32_504_101.8)).toBe("32.50");
  });
  it("formats signed percentages", () => {
    expect(formatPercent(0.2194, true)).toBe("+22 %");
    expect(formatPercent(0.43)).toBe("43 %");
    expect(formatPercent(-0.1, true)).toBe("-10 %");
  });
});
