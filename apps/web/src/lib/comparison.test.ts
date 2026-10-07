import { describe, expect, it } from "vitest";
import comparison from "../test/fixtures/comparison.json";
import type { ComparisonPointOut } from "../api/types";
import { comparisonRequest, nearestPoint, sceneSection, withTrace, wrinkleAmount } from "./comparison";
import { defaultDeformationForm, type DeformationFormState } from "./geometry";

const points = comparison.points as ComparisonPointOut[];
const material = { designation: "1.4307", elastic_modulus: 200000 };

const tube: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "chs",
  d: 100,
  t: 3,
  poissonRatio: 0.3,
  omega: 15,
};

describe("comparison helpers", () => {
  it("finds the sweep point closest to a thickness factor, on a log scale", () => {
    const one = nearestPoint(points, 1);
    expect(points[one].factor).toBe(1);
    expect(nearestPoint(points, 1e-9)).toBe(0);
    expect(nearestPoint(points, 1e9)).toBe(points.length - 1);
    const half = nearestPoint(points, 0.5);
    expect(Math.abs(Math.log(points[half].factor / 0.5))).toBeLessThan(0.1);
  });

  it("draws no waves up to the branch change, full waves at the limit, more beyond", () => {
    expect(wrinkleAmount(0.1, 0.3, 0.6)).toBe(0);
    expect(wrinkleAmount(0.3, 0.3, 0.6)).toBe(0);
    expect(wrinkleAmount(0.45, 0.3, 0.6)).toBeCloseTo(0.5);
    expect(wrinkleAmount(0.6, 0.3, 0.6)).toBeCloseTo(1);
    expect(wrinkleAmount(5, 0.3, 0.6)).toBe(1.3);
  });

  it("scales every thickness and keeps widths, and is null while incomplete", () => {
    expect(sceneSection(tube, 0.5)).toEqual({ kind: "chs", d: 100, t: 1.5 });
    expect(sceneSection({ ...tube, t: null }, 1)).toBeNull();
    const plates: DeformationFormState = {
      ...defaultDeformationForm,
      kind: "plates",
      plates: [
        { id: 1, label: "web", width: 180, thickness: 6, kSigma: 4 },
        { id: 2, label: "", width: 60, thickness: 8, kSigma: 0.43 },
      ],
    };
    expect(sceneSection(plates, 2)).toEqual({
      kind: "plates",
      plates: [
        { label: "web", width: 180, thickness: 12 },
        { label: "plate", width: 60, thickness: 16 },
      ],
    });
    expect(sceneSection({ ...plates, plates: [{ ...plates.plates[0], width: null }] }, 1)).toBeNull();
  });

  it("asks the API only for a tube or plates with everything entered", () => {
    expect(comparisonRequest(material, defaultDeformationForm)).toBeNull();
    expect(comparisonRequest(material, tube)).toMatchObject({ geometry: { kind: "chs", d: 100, t: 3 }, omega: 15 });
    expect(comparisonRequest(material, { ...tube, kind: "sigma_cr", sigmaCr: 500 })).toBeNull();
  });

  it("adds a trace without touching the server's figure", () => {
    const figure = { data: [{ a: 1 }], layout: { height: 430 } };
    const next = withTrace(figure, { b: 2 });
    expect(next.data).toEqual([{ a: 1 }, { b: 2 }]);
    expect(figure.data).toHaveLength(1);
    expect(next.layout).toBe(figure.layout);
  });
});
