import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlotlyChart, chartConfig, exportName, themedLayout } from "./PlotlyChart";

const plotly = vi.hoisted(() => ({
  react: vi.fn((..._args: unknown[]) => Promise.resolve()),
  purge: vi.fn(),
}));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

function pointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => plotly.react.mockClear());

const FIGURE = {
  data: [{ type: "scatter", x: [0, 1], y: [0, 1] }],
  layout: { height: 300, xaxis: { range: [0, 1] }, xaxis2: { range: [0, 2] }, yaxis2: {} },
};

describe("PlotlyChart", () => {
  it("keeps only zoom, pan, reset and PNG export, and never zooms on scroll", () => {
    pointer(false);
    render(<PlotlyChart figure={FIGURE} dark={false} label="Base curve: strain limit ratio" />);
    const config = plotly.react.mock.calls[0][3] as Record<string, unknown>;
    expect(config.modeBarButtons).toEqual([["zoom2d", "pan2d", "resetScale2d", "toImage"]]);
    expect(config.scrollZoom).toBe(false);
    expect(config.displaylogo).toBe(false);
    expect(config.toImageButtonOptions).toMatchObject({
      format: "png",
      filename: "base-curve-strain-limit-ratio",
    });
  });

  it("lets a finger scroll the page on a phone; a tap shows the values", () => {
    pointer(true);
    render(<PlotlyChart figure={FIGURE} dark={false} label="chart" />);
    const layout = plotly.react.mock.calls[0][2] as Record<string, unknown>;
    expect(layout.dragmode).toBe(false);
  });

  it("leaves dragging to zoom on a desktop", () => {
    pointer(false);
    render(<PlotlyChart figure={FIGURE} dark={false} label="chart" />);
    const layout = plotly.react.mock.calls[0][2] as Record<string, unknown>;
    expect(layout).not.toHaveProperty("dragmode");
  });
});

describe("themedLayout", () => {
  it("themes every axis, including those of side-by-side charts, and keeps their content", () => {
    const layout = themedLayout(FIGURE.layout, true);
    for (const key of ["xaxis", "yaxis", "xaxis2", "yaxis2"]) {
      expect(layout[key]).toMatchObject({ gridcolor: "rgba(255,255,255,0.10)" });
    }
    expect(layout.xaxis2).toMatchObject({ range: [0, 2] });
    expect(layout.font).toMatchObject({ color: "#e8e8e6" });
  });

  it("colours the spike lines for the theme and keeps the zoom across redraws", () => {
    expect(themedLayout(FIGURE.layout, true).xaxis).toMatchObject({ spikecolor: "#a5a39b" });
    expect(themedLayout(FIGURE.layout, false).xaxis2).toMatchObject({ spikecolor: "#6b6a66" });
    expect(themedLayout(FIGURE.layout, false).uirevision).toBe("chart");
  });

  it("fills the unified hover box and the chart with the panel colour of the theme", () => {
    const dark = themedLayout(FIGURE.layout, true);
    expect(dark.paper_bgcolor).toBe("#1a1a19");
    expect(dark.hoverlabel).toMatchObject({ bgcolor: "#1a1a19", font: { color: "#e8e8e6" } });
    expect(themedLayout(FIGURE.layout, false).hoverlabel).toMatchObject({ bgcolor: "#ffffff" });
  });
});

describe("exportName and chartConfig", () => {
  it("makes a short file name from a long label", () => {
    expect(exportName("Strain and stress across the depth (B.6.3)")).toBe(
      "strain-and-stress-across-the-depth-b-6-3",
    );
    expect(exportName("???")).toBe("chart");
    expect(exportName("x".repeat(80))).toHaveLength(60);
  });

  it("resets the zoom on a double click", () => {
    expect(chartConfig("a").doubleClick).toBe("reset");
  });
});
