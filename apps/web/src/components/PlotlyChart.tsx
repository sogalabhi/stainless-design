import Plotly from "plotly.js-dist-min";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChartLinks } from "../lib/chartLinks";
import {
  buildPin,
  hoverTags,
  linkMarkers,
  readoutOf,
  withLinkMarkers,
  type HoverTags,
  type PlotlyEvent,
} from "../lib/chartReadout";
import { ChartValues, LinkNotes, PinCard, ValueTags } from "./ChartReadout";

type Layout = Record<string, unknown>;

const AXIS_KEY = /^[xy]axis\d*$/;

/** True on phones and tablets, where a finger drag must scroll the page, not zoom the chart. */
export function coarsePointer(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

/**
 * Adapts the server's figure to the light or dark theme without changing its content.
 * Every axis is themed, including the extra axes of side-by-side charts (xaxis2, yaxis2).
 * With a coarse pointer, dragging is switched off: the page scrolls and a tap shows the values.
 * Zoom and pan stay one tap away in the toolbar.
 */
export function themedLayout(layout: Layout, dark: boolean, coarse = false): Layout {
  const text = dark ? "#e8e8e6" : "#1a1a19";
  const grid = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const axis = (value: unknown) => ({
    ...(value as Layout | undefined),
    gridcolor: grid,
    linecolor: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
    zerolinecolor: grid,
    spikecolor: dark ? "#a5a39b" : "#6b6a66",
  });
  // the colour of the panel the chart sits on (.results): Plotly backs its spike line and fills
  // the unified hover box with it, so a transparent background would show white in dark mode
  const surface = dark ? "#1a1a19" : "#ffffff";
  const themed: Layout = {
    ...layout,
    paper_bgcolor: surface,
    hoverlabel: {
      bgcolor: surface,
      bordercolor: dark ? "#33332f" : "#dcdad3",
      ...(layout.hoverlabel as Layout | undefined),
      font: { ...((layout.hoverlabel as Layout | undefined)?.font as Layout | undefined), color: text },
    },
    autosize: true,
    // a redraw (theme, link marker) keeps the user's zoom unless the server's ranges change
    uirevision: "chart",
    font: { ...(layout.font as Layout | undefined), color: text },
    xaxis: axis(layout.xaxis),
    yaxis: axis(layout.yaxis),
  };
  for (const key of Object.keys(layout)) {
    if (AXIS_KEY.test(key)) themed[key] = axis(layout[key]);
  }
  if (coarse) themed.dragmode = false;
  return themed;
}

/** A file name for the PNG export, from the chart's label. */
export function exportName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "chart";
}

/**
 * The toolbar shows on hover with only zoom, pan, reset and PNG export. Scrolling never zooms, so
 * the page still scrolls past the chart; a double click resets the zoom.
 */
export function chartConfig(label: string): Record<string, unknown> {
  return {
    responsive: true,
    displaylogo: false,
    displayModeBar: "hover",
    modeBarButtons: [["zoom2d", "pan2d", "resetScale2d", "toImage"]],
    scrollZoom: false,
    doubleClick: "reset",
    toImageButtonOptions: { format: "png", filename: exportName(label), scale: 2 },
  };
}

/** The dashed line and label of a value pinned on another chart. */
export const LINK_COLOUR = { light: "#8a4bd1", dark: "#c19cf0" };

/** How long after a double click a click is taken as part of it, in ms. */
const DOUBLE_CLICK_GRACE = 400;

/** The parts of the Plotly graph div used here; absent in tests that mock Plotly. */
type PlotlyElement = HTMLDivElement & {
  on?: (event: string, handler: (data: PlotlyEvent) => void) => void;
};

/**
 * A server figure drawn with Plotly.js, plus what the server's `readout` and `meta` allow:
 * value tags on the axes while hovering, a pin card on click (cleared by a double click or the
 * Clear button), markers for values pinned on other charts, and "Show values" with a CSV.
 * `label` names the chart (aria label, file names) and is its key for pins and links.
 */
export function PlotlyChart({
  figure,
  dark,
  label,
}: {
  figure: Record<string, unknown>;
  dark: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // a fixed box, so redraws from the slider cannot change the page layout around the chart
  const height = (figure.layout as Layout | undefined)?.height;
  const readout = useMemo(() => readoutOf(figure), [figure]);
  const { quantities, pins, setPin, clearPin } = useChartLinks();
  const own = pins[label];
  const pin = own && own.readout === readout ? own.pin : null;
  const found = linkMarkers(readout, quantities, label);
  // a pin elsewhere changes `quantities`; redraw only when this chart's markers change
  const markerKey = JSON.stringify(found);
  const markers = useMemo(() => found, [markerKey]);
  const [tags, setTags] = useState<HoverTags | null>(null);

  // the handlers are attached once per graph div; they read the latest values from here
  const live = useRef({ readout, label, setPin, clearPin });
  live.current = { readout, label, setPin, clearPin };
  const attached = useRef(false);

  // new numbers from the server make this chart's pin out of date
  useEffect(() => {
    if (own && own.readout !== readout) clearPin(label);
  }, [own, readout, label, clearPin]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setTags(null);
    const data = (figure.data as unknown[] | undefined) ?? [];
    const layout = withLinkMarkers(
      themedLayout((figure.layout as Layout | undefined) ?? {}, dark, coarsePointer()),
      markers,
      dark ? LINK_COLOUR.dark : LINK_COLOUR.light,
    );
    void Promise.resolve(Plotly.react(element, data, layout, chartConfig(label))).then(() => {
      const graph = element as PlotlyElement;
      if (attached.current || typeof graph.on !== "function") return;
      attached.current = true;
      graph.on("plotly_hover", (event) => {
        const clientY = event.event?.clientY;
        const top = element.getBoundingClientRect().top;
        setTags(hoverTags(event, live.current.readout, typeof clientY === "number" ? clientY - top : null));
      });
      graph.on("plotly_unhover", () => setTags(null));
      // Plotly follows plotly_doubleclick with a plotly_click for the second press; that one
      // must not pin again what the double click has just cleared
      let clearedAt = -Infinity;
      graph.on("plotly_click", (event) => {
        if (Date.now() - clearedAt < DOUBLE_CLICK_GRACE) return;
        const { readout: current, label: chart, setPin: pinIt } = live.current;
        if (!current) return;
        const built = buildPin(event, current, chart);
        if (built) pinIt(chart, { pin: built.pin, readout: current }, built.quantities);
      });
      graph.on("plotly_doubleclick", () => {
        clearedAt = Date.now();
        live.current.clearPin(live.current.label);
      });
    });
  }, [figure, dark, label, markers]);

  useEffect(() => {
    const element = ref.current;
    return () => {
      attached.current = false;
      if (element) Plotly.purge(element);
    };
  }, []);

  return (
    <div className="chart">
      <div className="chart-frame" onMouseLeave={() => setTags(null)}>
        <div
          ref={ref}
          className="plot"
          role="img"
          aria-label={label}
          style={typeof height === "number" ? { height } : undefined}
        />
        <ValueTags tags={tags} />
      </div>
      <LinkNotes markers={markers} figure={figure} onClear={clearPin} />
      {pin && readout ? <PinCard pin={pin} title={readout.title} onClear={() => clearPin(label)} /> : null}
      {readout ? <ChartValues readout={readout} fileName={exportName(label)} /> : null}
    </div>
  );
}
