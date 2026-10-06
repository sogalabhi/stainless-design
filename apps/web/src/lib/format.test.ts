import { describe, expect, it } from "vitest";
import { formatKn, formatNumber, formatPercent } from "./format";

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
  it("formats signed percentages", () => {
    expect(formatPercent(0.2194, true)).toBe("+22 %");
    expect(formatPercent(0.43)).toBe("43 %");
    expect(formatPercent(-0.1, true)).toBe("-10 %");
  });
});
