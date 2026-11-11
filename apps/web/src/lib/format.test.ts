import { describe, expect, it } from "vitest";
import {
  formatFixed,
  formatKn,
  formatKnM,
  formatNumber,
  formatPercent,
  formatPercentOne,
  formatRatio,
  knM,
} from "./format";

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

describe("the Section Stage number formats", () => {
  it("rounds as the stage shows it: 3.41, 218.0, 564.4, 50.30", () => {
    expect(formatFixed(3.41109, 2)).toBe("3.41");
    expect(formatFixed(218.002, 1)).toBe("218.0");
    expect(formatFixed(564.4268, 1)).toBe("564.4");
    expect(formatFixed(50.2993, 2)).toBe("50.30");
    expect(formatFixed(0.483877, 3)).toBe("0.484");
  });
  it("puts thousands spaces in large values", () => {
    expect(formatFixed(1234.56, 1)).toBe("1 234.6");
  });
  it("shows a strain ratio with two decimals below 10 and one from 10", () => {
    expect(formatRatio(3.41109)).toBe("3.41");
    expect(formatRatio(0.5278)).toBe("0.53");
    expect(formatRatio(15)).toBe("15.0");
  });
  it("shows an engine fraction as an unsigned percentage", () => {
    expect(formatPercentOne(0.22125)).toBe("22.1 %");
    expect(formatPercentOne(-0.4)).toBe("40.0 %");
  });
});
