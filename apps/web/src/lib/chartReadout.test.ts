import { describe, expect, it } from "vitest";
import {
  buildPin,
  hoverTags,
  linkMarkers,
  nearestComputedPoints,
  readoutCsv,
  readoutOf,
  withLinkMarkers,
  type PinnedQuantity,
  type PlotlyAxis,
  type PlotlyPoint,
  type Readout,
  type TraceMeta,
} from "./chartReadout";

/** A linear axis: data 0..10 over 200 px, starting `offset` px into the chart. */
function axis(id: string, offset: number, scale = 20): PlotlyAxis {
  return { _id: id, _offset: offset, _length: 200, d2p: (value: number) => value * scale };
}

const XA = axis("x", 50);
const YA: PlotlyAxis = { _id: "y", _offset: 20, _length: 300, d2p: (value: number) => 300 - value * 6 };

function meta(series: string, extra: Partial<TraceMeta> = {}): TraceMeta {
  return {
    series,
    source: `EN 1993-1-4:2025, ${series}`,
    source_kind: "Code",
    role: "curve",
    value: "xy",
    x: { label: "ε_csm / ε_y", unit: "" },
    y: { label: "M_csm,c,Rd", unit: "kN m" },
    ...extra,
  };
}

function point(x: number, y: number, curveNumber: number, m: TraceMeta | null, index = 0): PlotlyPoint {
  return { x, y, curveNumber, pointIndex: index, data: m ? { meta: m } : {}, xaxis: XA, yaxis: YA };
}

const READOUT: Readout = {
  title: "Bending resistance (B.19, B.20)",
  axes: {
    x: { label: "ε_csm / ε_y", unit: "", html: "ε<sub>csm</sub> / ε<sub>y</sub>", quantity: "strain_ratio", schematic: false, also: [] },
    y: { label: "M_csm,c,Rd", unit: "kN m", html: "M", quantity: null, schematic: false, also: [] },
  },
  tables: [
    {
      title: "Formula B.20 (ε_csm/ε_y ≥ 1)",
      source: "EN 1993-1-4:2025, B.20, α = 2 from Table B.2",
      source_kind: "Code",
      columns: [
        { label: "ε_csm / ε_y", unit: "" },
        { label: "M_csm,c,Rd", unit: "kN m" },
      ],
      rows: [
        [1, 37.097072727272725],
        [2.5, 41.12345678901234],
      ],
    },
    {
      title: "Elastic moment M_el",
      source: 'EN 1993-1-4:2025, B.19; W_el "input"',
      source_kind: "Code",
      columns: [{ label: "M_el", unit: "kN m" }],
      rows: [[37.097072727272725]],
    },
  ],
};

const B20 = meta("Formula B.20");
const M_EL = meta("Elastic moment", { role: "reference", value: "y", y: { label: "M_el", unit: "kN m" } });
const CAP = meta("Strain cap", { role: "reference", value: "x", x: { label: "cap ε_csm / ε_y", unit: "" } });

describe("readoutOf", () => {
  it("finds the readout, or null on a figure without one", () => {
    expect(readoutOf({ data: [], readout: READOUT })).toBe(READOUT);
    expect(readoutOf({ data: [] })).toBeNull();
  });
});

describe("hoverTags", () => {
  it("puts the hovered x under the plot area and the y of the series nearest the cursor", () => {
    const event = { points: [point(2.5, 41.1, 0, B20), point(2.5, 37.1, 1, M_EL)] };
    const tags = hoverTags(event, READOUT, YA._offset + YA.d2p(37.5));
    expect(tags?.x).toEqual({ left: 50 + 50, top: 20 + 300, text: "2.5" });
    // the M_el line is nearer the cursor than the curve
    expect(tags?.y).toMatchObject({ text: "37.1 kN m", top: 20 + YA.d2p(37.1), left: 50, width: 200 });
  });

  it("uses the first point when there is no cursor height, and skips vertical lines for y", () => {
    const event = { points: [point(15, 2, 2, CAP), point(14.9, 46, 0, B20)] };
    const tags = hoverTags(event, READOUT, null);
    expect(tags?.x?.text).toBe("15");
    expect(tags?.y?.text).toBe("46 kN m");
  });

  it("shows no x tag on a schematic axis (its x is a map, not a strain)", () => {
    const schematic = { ...READOUT, axes: { ...READOUT.axes, x: { ...READOUT.axes.x, schematic: true } } };
    const tags = hoverTags({ points: [point(1.5, 210, 0, B20)] }, schematic, null);
    expect(tags?.x).toBeNull();
    expect(tags?.y?.text).toBe("210 kN m");
  });

  it("adds how many ε_y and f_y the hovered strain and stress are, when the axes declare a reference", () => {
    const ratio = {
      ...READOUT,
      axes: {
        x: { ...READOUT.axes.x, label: "ε", unit: "", ratio: { label: "ε<sub>y</sub>", factor: 0.0012 } },
        y: { ...READOUT.axes.y, label: "σ", unit: "N/mm²", ratio: { label: "f<sub>y</sub>", factor: 200 } },
      },
    };
    const tags = hoverTags({ points: [point(0.0015, 250, 0, meta("Curve", { y: { label: "σ", unit: "N/mm²" } }))] }, ratio, null);
    expect(tags?.x?.text).toBe("0.0015 = 1.25 ε_y");
    expect(tags?.y?.text).toBe("250 N/mm² = 1.25 f_y");
  });

  it("returns nothing without points or axis functions (as in tests that mock Plotly)", () => {
    expect(hoverTags({ points: [] }, READOUT, null)).toBeNull();
    const bare = { x: 1, y: 1, curveNumber: 0 } as unknown as PlotlyPoint;
    expect(hoverTags({ points: [bare] }, READOUT, null)).toBeNull();
  });
});

describe("readoutCsv", () => {
  const csv = readoutCsv(READOUT);
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("starts with a byte-order mark and has a series, source kind and source column", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('series,source kind,source,ε_csm / ε_y,"M_csm,c,Rd [kN m]",M_el [kN m]');
  });

  it("writes every row with the exact value and leaves other series' columns empty", () => {
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      'Formula B.20 (ε_csm/ε_y ≥ 1),Code,"EN 1993-1-4:2025, B.20, α = 2 from Table B.2",1,37.097072727272725,',
    );
    expect(lines[2]).toContain(",2.5,41.12345678901234,");
    // quotes in a source are doubled
    expect(lines[3]).toBe('Elastic moment M_el,Code,"EN 1993-1-4:2025, B.19; W_el ""input""",,,37.097072727272725');
  });
});

describe("buildPin", () => {
  it("lists every series at the clicked x with its unit and source, and pins the x quantity", () => {
    const built = buildPin({ points: [point(2.5, 41.1, 0, B20), point(2.5, 37.1, 1, M_EL)] }, READOUT, "bending");
    expect(built?.pin.x).toEqual({ label: "ε_csm / ε_y", unit: "", value: 2.5 });
    expect(built?.pin.rows).toEqual([
      { series: "Formula B.20", source: "EN 1993-1-4:2025, Formula B.20", value: { label: "M_csm,c,Rd", unit: "kN m", value: 41.1 }, at: null },
      { series: "Elastic moment", source: "EN 1993-1-4:2025, Elastic moment", value: { label: "M_el", unit: "kN m", value: 37.1 }, at: null },
    ]);
    expect(built?.quantities).toEqual({
      strain_ratio: {
        value: 2.5,
        label: "ε_csm / ε_y",
        html: "ε<sub>csm</sub> / ε<sub>y</sub>",
        unit: "",
        chart: "bending",
        title: "Bending resistance (B.19, B.20)",
      },
    });
  });

  it("takes the x from a point that has one when a level line is listed first", () => {
    const built = buildPin({ points: [point(2.4, 37.1, 1, M_EL), point(2.5, 41.1, 0, B20)] }, READOUT, "c");
    expect(built?.pin.x.value).toBe(2.5);
  });

  it("gives a nearby point's own x, and a vertical line's x as its value", () => {
    const yours = meta("Your section", { role: "point" });
    const built = buildPin(
      { points: [point(2.5, 41.1, 0, B20), point(2.6, 41.5, 3, yours), point(15, 3, 2, CAP)] },
      READOUT,
      "c",
    );
    expect(built?.pin.rows[1].at).toEqual({ label: "ε_csm / ε_y", unit: "", value: 2.6 });
    expect(built?.pin.rows[2].value).toEqual({ label: "cap ε_csm / ε_y", unit: "", value: 15 });
  });

  it("pins the true strain on a schematic axis, from the server's x_values", () => {
    const strain: Readout = {
      title: "Stress-strain curve (B.4)",
      axes: {
        x: { label: "ε", unit: "", html: "ε", quantity: "strain", schematic: true, also: [] },
        y: { label: "σ", unit: "N/mm²", html: "σ", quantity: null, schematic: false, also: [] },
      },
      tables: [],
    };
    const csm = meta("CSM bilinear (B.4)", { x: { label: "ε", unit: "" }, y: { label: "σ", unit: "N/mm²" }, x_values: [0, 0.00105, 0.0021] });
    const built = buildPin({ points: [point(1.0, 210, 0, csm, 1)] }, strain, "material");
    expect(built?.pin.x.value).toBe(0.00105);
    expect(built?.quantities.strain.value).toBe(0.00105);
  });

  it("pins the y quantity from the computed curve only", () => {
    const base: Readout = {
      ...READOUT,
      axes: {
        x: { ...READOUT.axes.x, label: "λ_p,cs", quantity: "lambda_p" },
        y: { ...READOUT.axes.y, label: "ε_csm / ε_y", unit: "", quantity: "strain_ratio" },
      },
    };
    const capLine = meta("Strain cap", { role: "reference", value: "y" });
    const curve = meta("Base curve");
    const built = buildPin({ points: [point(0.5, 15, 1, capLine), point(0.5, 2.6, 0, curve)] }, base, "base");
    expect(built?.quantities.lambda_p.value).toBe(0.5);
    expect(built?.quantities.strain_ratio.value).toBe(2.6);
  });

  it("ignores points without meta (the slider marker of the Explore page)", () => {
    expect(buildPin({ points: [point(1, 1, 5, null)] }, READOUT, "c")).toBeNull();
  });
});

const PINNED: PinnedQuantity = {
  value: 3.2,
  label: "ε_csm / ε_y",
  html: "ε<sub>csm</sub> / ε<sub>y</sub>",
  unit: "",
  chart: "base",
  title: "Base curve (B.6)",
};

describe("linkMarkers and withLinkMarkers", () => {
  it("marks a quantity pinned on another chart, never this chart's own pin", () => {
    expect(linkMarkers(READOUT, { strain_ratio: PINNED }, "bending")).toEqual([
      { axis: "x", position: 3.2, vertical: true, quantity: "strain_ratio", pinned: PINNED },
    ]);
    expect(linkMarkers(READOUT, { strain_ratio: { ...PINNED, chart: "bending" } }, "bending")).toEqual([]);
    expect(linkMarkers(null, { strain_ratio: PINNED }, "bending")).toEqual([]);
  });

  it("draws a horizontal marker for a y quantity", () => {
    const base = { ...READOUT, axes: { ...READOUT.axes, y: { ...READOUT.axes.y, quantity: "strain_ratio" }, x: { ...READOUT.axes.x, quantity: "lambda_p" } } };
    const [marker] = linkMarkers(base, { strain_ratio: PINNED }, "deformation");
    expect(marker).toMatchObject({ axis: "y", vertical: false, position: 3.2 });
  });

  it("places a strain ratio on a strain axis with the server's factor, and skips schematic axes", () => {
    const strain: Readout = {
      title: "Stress-strain curve (B.4)",
      axes: {
        x: { label: "ε", unit: "", html: "ε", quantity: "strain", schematic: false, also: [{ quantity: "strain_ratio", factor: 0.00105, label: "ε / ε_y" }] },
        y: { label: "σ", unit: "N/mm²", html: "σ", quantity: null, schematic: false, also: [] },
      },
      tables: [],
    };
    const [marker] = linkMarkers(strain, { strain_ratio: PINNED }, "material");
    expect(marker.position).toBeCloseTo(3.2 * 0.00105, 15);
    const schematic = { ...strain, axes: { ...strain.axes, x: { ...strain.axes.x, schematic: true } } };
    expect(linkMarkers(schematic, { strain_ratio: PINNED }, "material")).toEqual([]);
  });

  it("adds a labelled line to a copy of the layout and leaves the server's layout alone", () => {
    const layout = { shapes: [{ type: "rect" }], annotations: [], height: 300 };
    const frozen = JSON.stringify(layout);
    const markers = linkMarkers(READOUT, { strain_ratio: PINNED }, "bending");
    const out = withLinkMarkers(layout, markers, "#8a4bd1");
    expect(JSON.stringify(layout)).toBe(frozen);
    expect(out.shapes).toHaveLength(2);
    expect((out.shapes as Record<string, unknown>[])[1]).toMatchObject({ type: "line", xref: "x", x0: 3.2, x1: 3.2, yref: "paper" });
    expect((out.annotations as Record<string, unknown>[])[0].text).toBe(
      "pinned on Base curve (B.6): ε<sub>csm</sub> / ε<sub>y</sub> = 3.2",
    );
    expect(withLinkMarkers(layout, [], "#000")).toBe(layout);
  });
});

describe("nearestComputedPoints", () => {
  const figure = {
    data: [
      { x: [1, 2, 3, 4], y: [10, 20, 30, 40], meta: meta("Formula B.20") },
      { x: [0, 10], y: [37, 37], meta: M_EL },
      { x: [3.3], y: [99], meta: meta("Your section", { role: "point" }) },
    ],
  };
  const [marker] = linkMarkers(READOUT, { strain_ratio: PINNED }, "bending");

  it("reads the nearest point the server computed on each curve, not an interpolation", () => {
    expect(nearestComputedPoints(figure, marker)).toEqual([
      {
        series: "Formula B.20",
        source: "EN 1993-1-4:2025, Formula B.20",
        x: { label: "ε_csm / ε_y", unit: "", value: 3 },
        y: { label: "M_csm,c,Rd", unit: "kN m", value: 30 },
        outside: false,
      },
    ]);
  });

  it("says when the pinned value lies outside the curve", () => {
    const far = { ...marker, position: 7 };
    expect(nearestComputedPoints(figure, far)[0]).toMatchObject({ outside: true, x: { value: 4 } });
  });

  it("gives nothing for a horizontal marker", () => {
    expect(nearestComputedPoints(figure, { ...marker, vertical: false, axis: "y" })).toEqual([]);
  });
});
