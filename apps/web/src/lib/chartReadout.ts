/**
 * The server's `readout` (on every figure) and `meta` (on every trace), and what the chart
 * wrapper builds from them: value tags, the "Show values" tables and CSV, the pin card, and the
 * markers of linked charts.
 *
 * Nothing here computes an engineering value. Every number shown is a number the server sent:
 * a point of a trace, a row of a table, or a value pinned on another chart. The only arithmetic
 * is placing things: pixel positions, and value x factor on an axis that declares a factor given
 * by the server (ε_y on a strain axis).
 */
import { formatNumber } from "./format";

export type Column = { label: string; unit: string };

export type AxisInfo = Column & {
  /** The label with HTML subscripts, for Plotly annotations. */
  html: string;
  /** The named quantity the axis shows (lambda_p, lambda_c, strain_ratio, strain), for links. */
  quantity: string | null;
  /** A non-linear map (the schematic strain axis): no x tag and no link marker. */
  schematic: boolean;
  /** Other quantities this axis can place, at x = factor * value (factor from the server). */
  also: { quantity: string; factor: number; label: string }[];
};

export type ReadoutTable = {
  title: string;
  source: string;
  source_kind: string;
  columns: Column[];
  rows: number[][];
};

export type Readout = {
  title: string;
  axes: Record<string, AxisInfo>;
  tables: ReadoutTable[];
};

export type TraceMeta = {
  series: string;
  source: string;
  source_kind: string;
  role: "curve" | "unused" | "reference" | "point";
  /** Which coordinates mean something: both, or x for a vertical line, y for a horizontal one. */
  value: "xy" | "x" | "y";
  x: Column;
  y: Column;
  /** The true x of each point where the plotted x is a schematic map. */
  x_values?: number[];
};

/** The parts of a Plotly axis object (in event data) that the overlay uses. */
export type PlotlyAxis = {
  _id?: string;
  _offset: number;
  _length: number;
  d2p: (value: number) => number;
};

export type PlotlyPoint = {
  x: number;
  y: number;
  curveNumber: number;
  pointIndex?: number;
  pointNumber?: number;
  data?: { meta?: unknown; name?: string };
  xaxis: PlotlyAxis;
  yaxis: PlotlyAxis;
};

export type PlotlyEvent = { points?: PlotlyPoint[]; event?: { clientX?: number; clientY?: number } };

type Figure = Record<string, unknown>;

export function readoutOf(figure: Figure): Readout | null {
  const readout = figure.readout as Readout | undefined;
  if (!readout || !Array.isArray(readout.tables) || typeof readout.axes !== "object") return null;
  return readout;
}

export function metaOf(point: PlotlyPoint): TraceMeta | null {
  const meta = point.data?.meta as TraceMeta | undefined;
  return meta && typeof meta.series === "string" ? meta : null;
}

function indexOf(point: PlotlyPoint): number {
  return point.pointIndex ?? point.pointNumber ?? 0;
}

/** The point's true x: the server's x_values on a schematic axis, else the plotted x. */
export function trueX(point: PlotlyPoint, meta: TraceMeta | null = metaOf(point)): number {
  const values = meta?.x_values;
  return values ? values[indexOf(point)] : point.x;
}

/** A value with its unit, as the tags, the card and the tables show it. */
export function withUnit(value: number, unit: string): string {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** A column heading with its unit: "M_csm,c,Rd [kN m]", or the label alone. */
export function heading(column: Column): string {
  return column.unit ? `${column.label} [${column.unit}]` : column.label;
}

function axisOf(readout: Readout | null, axis: PlotlyAxis | undefined, letter: "x" | "y"): AxisInfo | null {
  if (!readout) return null;
  return readout.axes[axis?._id ?? letter] ?? readout.axes[letter] ?? null;
}

// ---------------------------------------------------------------- value tags on the axes

export type HoverTags = {
  /** Under the plot area at the hovered x; null on a schematic axis. */
  x: { left: number; top: number; text: string } | null;
  /** Just inside the left edge of the plot area at the hovered y, with a guide across the plot. */
  y: { top: number; left: number; width: number; text: string } | null;
};

function hasAxes(point: PlotlyPoint): boolean {
  return typeof point.xaxis?.d2p === "function" && typeof point.yaxis?.d2p === "function";
}

/**
 * The value tags for a hover. x is the point Plotly hovers first (the one its x spike and the
 * unified header snap to). y is the series nearest the cursor height (`cursorY`, in chart
 * pixels), so the tag and its guide sit on the line under the cursor. Both are server values.
 */
export function hoverTags(
  event: PlotlyEvent,
  readout: Readout | null,
  cursorY: number | null,
): HoverTags | null {
  const points = (event.points ?? []).filter(hasAxes);
  if (points.length === 0) return null;
  const primary = points[0];
  const xa = primary.xaxis;
  const ya = primary.yaxis;
  const xInfo = axisOf(readout, xa, "x");
  const x: HoverTags["x"] = xInfo?.schematic
    ? null
    : {
        left: xa._offset + xa.d2p(primary.x),
        top: ya._offset + ya._length,
        text: withUnit(primary.x, xInfo?.unit ?? ""),
      };
  // vertical reference lines have no meaningful y
  const candidates = points.filter((point) => metaOf(point)?.value !== "x");
  let y: HoverTags["y"] = null;
  if (candidates.length > 0) {
    const pixel = (point: PlotlyPoint) => point.yaxis._offset + point.yaxis.d2p(point.y);
    let chosen = candidates[0];
    if (cursorY !== null) {
      for (const point of candidates) {
        if (Math.abs(pixel(point) - cursorY) < Math.abs(pixel(chosen) - cursorY)) chosen = point;
      }
    }
    const unit = metaOf(chosen)?.y.unit ?? axisOf(readout, chosen.yaxis, "y")?.unit ?? "";
    y = {
      top: pixel(chosen),
      left: chosen.xaxis._offset,
      width: chosen.xaxis._length,
      text: withUnit(chosen.y, unit),
    };
  }
  return { x, y };
}

// ---------------------------------------------------------------- "Show values" and CSV

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One CSV for the whole figure: a row per data row of every series, with a `series` column, the
 * source kind and source of each series, then one column per distinct heading (with its unit).
 * A series leaves the columns it does not have empty. Values are written in full (the shortest
 * exact form of the server's float), not rounded.
 */
export function readoutCsv(readout: Readout): string {
  const headings: string[] = [];
  for (const table of readout.tables) {
    for (const column of table.columns) {
      const text = heading(column);
      if (!headings.includes(text)) headings.push(text);
    }
  }
  const lines = [["series", "source kind", "source", ...headings].map(csvField).join(",")];
  for (const table of readout.tables) {
    const where = table.columns.map((column) => headings.indexOf(heading(column)));
    for (const row of table.rows) {
      const cells = headings.map(() => "");
      row.forEach((value, index) => {
        cells[where[index]] = String(value);
      });
      lines.push([table.title, table.source_kind, table.source, ...cells].map(csvField).join(","));
    }
  }
  // a byte-order mark, so spreadsheet programs read ε, σ and λ as UTF-8
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Saves text as a file: a Blob behind a temporary object URL and a clicked link. */
export function downloadText(fileName: string, text: string, type = "text/csv;charset=utf-8"): void {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------- click to pin

export type PinValue = Column & { value: number };

export type PinRow = {
  series: string;
  source: string;
  value: PinValue;
  /** The row's own x, when it is not the pinned x (a nearby marker, say). */
  at: PinValue | null;
};

export type Pin = {
  /** The pinned x with the axis label and unit (the true strain on a schematic axis). */
  x: PinValue;
  rows: PinRow[];
};

export type PinnedQuantity = {
  value: number;
  label: string;
  html: string;
  unit: string;
  /** The chart (its label) and its short title, where the value was pinned. */
  chart: string;
  title: string;
};

/**
 * The card for a click: the x of the clicked point, and every series Plotly lists there (in
 * "x unified" mode a click carries all of them) with value, unit and source from `meta`.
 * Also the quantities the pin sets for linked charts: the x axis quantity, and the y axis
 * quantity read from the first computed curve in the click.
 */
export function buildPin(
  event: PlotlyEvent,
  readout: Readout,
  chart: string,
): { pin: Pin; quantities: Record<string, PinnedQuantity> } | null {
  const points = (event.points ?? []).filter((point) => metaOf(point) !== null);
  if (points.length === 0) return null;
  // a level line has no x of its own: take the x from a point that has one, if any
  const primary = points.find((point) => metaOf(point)?.value !== "y") ?? points[0];
  const primaryMeta = metaOf(primary) as TraceMeta;
  const xInfo = axisOf(readout, primary.xaxis, "x");
  const yInfo = axisOf(readout, primary.yaxis, "y");
  const xValue = trueX(primary, primaryMeta);
  const x: PinValue = {
    label: xInfo?.label ?? primaryMeta.x.label,
    unit: xInfo?.unit ?? primaryMeta.x.unit,
    value: xValue,
  };

  const rows: PinRow[] = [];
  const seen = new Set<number>();
  for (const point of points) {
    if (seen.has(point.curveNumber)) continue;
    seen.add(point.curveNumber);
    const meta = metaOf(point) as TraceMeta;
    const ownX = trueX(point, meta);
    if (meta.value === "x") {
      rows.push({ series: meta.series, source: meta.source, value: { ...meta.x, value: ownX }, at: null });
    } else {
      rows.push({
        series: meta.series,
        source: meta.source,
        value: { ...meta.y, value: point.y },
        at: meta.value === "xy" && ownX !== xValue ? { ...meta.x, value: ownX } : null,
      });
    }
  }

  const quantities: Record<string, PinnedQuantity> = {};
  const base = { chart, title: readout.title };
  if (xInfo?.quantity && primaryMeta.value !== "y") {
    quantities[xInfo.quantity] = { value: xValue, label: xInfo.label, html: xInfo.html, unit: xInfo.unit, ...base };
  }
  if (yInfo?.quantity) {
    const curve = points.find((point) => {
      const meta = metaOf(point);
      return meta?.role === "curve" && meta.value === "xy";
    });
    if (curve) {
      quantities[yInfo.quantity] = { value: curve.y, label: yInfo.label, html: yInfo.html, unit: yInfo.unit, ...base };
    }
  }
  return { pin: { x, rows }, quantities };
}

// ---------------------------------------------------------------- linked charts

export type LinkMarker = {
  axis: string;
  /** Where the line goes on this axis (plotted coordinate). */
  position: number;
  vertical: boolean;
  quantity: string;
  pinned: PinnedQuantity;
};

/** The quantities pinned on other charts that this figure's axes show. */
export function linkMarkers(
  readout: Readout | null,
  quantities: Record<string, PinnedQuantity>,
  chart: string,
): LinkMarker[] {
  if (!readout) return [];
  const markers: LinkMarker[] = [];
  for (const [axis, info] of Object.entries(readout.axes)) {
    if (info.schematic) continue;
    const vertical = axis.startsWith("x");
    const options = [
      ...(info.quantity ? [{ quantity: info.quantity, factor: 1 }] : []),
      ...(info.also ?? []).map(({ quantity, factor }) => ({ quantity, factor })),
    ];
    for (const { quantity, factor } of options) {
      const pinned = quantities[quantity];
      if (!pinned || pinned.chart === chart) continue;
      markers.push({ axis, position: pinned.value * factor, vertical, quantity, pinned });
    }
  }
  return markers;
}

/** "pinned on Base curve (B.6): λ<sub>p,cs</sub> = 0.512", with the value as it was pinned. */
export function linkText(pinned: PinnedQuantity, html = true): string {
  return `pinned on ${pinned.title}: ${html ? pinned.html : pinned.label} = ${withUnit(pinned.value, pinned.unit)}`;
}

/**
 * The layout with the link markers added as new shapes and annotations. The server's layout is
 * copied, never changed.
 */
export function withLinkMarkers(
  layout: Record<string, unknown>,
  markers: LinkMarker[],
  colour: string,
): Record<string, unknown> {
  if (markers.length === 0) return layout;
  const shapes = [...((layout.shapes as unknown[] | undefined) ?? [])];
  const annotations = [...((layout.annotations as unknown[] | undefined) ?? [])];
  const line = { color: colour, width: 1.5, dash: "dashdot" };
  const font = { size: 11, color: colour };
  for (const marker of markers) {
    const { axis, position } = marker;
    if (marker.vertical) {
      shapes.push({ type: "line", xref: axis, yref: "paper", x0: position, x1: position, y0: 0, y1: 1, line });
      annotations.push({
        xref: axis, yref: "paper", x: position, y: 0.9, text: linkText(marker.pinned),
        showarrow: false, xanchor: "left", yanchor: "top", xshift: 4, font,
      });
    } else {
      shapes.push({ type: "line", xref: "paper", yref: axis, x0: 0, x1: 1, y0: position, y1: position, line });
      annotations.push({
        xref: "paper", yref: axis, x: 0.02, y: position, text: linkText(marker.pinned),
        showarrow: false, xanchor: "left", yanchor: "bottom", font,
      });
    }
  }
  return { ...layout, shapes, annotations };
}

export type NearestPoint = {
  series: string;
  source: string;
  x: PinValue;
  y: PinValue;
  /** The marker lies outside the x range this curve was computed over. */
  outside: boolean;
};

/**
 * For a vertical link marker: on each computed curve of the figure, the server's data point
 * nearest the marker. Not an interpolation: both values are a point the server computed.
 */
export function nearestComputedPoints(figure: Figure, marker: LinkMarker): NearestPoint[] {
  if (!marker.vertical) return [];
  const found: NearestPoint[] = [];
  for (const trace of (figure.data as Record<string, unknown>[] | undefined) ?? []) {
    const meta = trace.meta as TraceMeta | undefined;
    if (!meta || meta.role !== "curve" || meta.value !== "xy") continue;
    if (((trace.xaxis as string | undefined) ?? "x") !== marker.axis) continue;
    const xs = trace.x as number[] | undefined;
    const ys = trace.y as number[] | undefined;
    if (!xs || !ys || xs.length === 0) continue;
    let best = 0;
    for (let i = 1; i < xs.length; i += 1) {
      if (Math.abs(xs[i] - marker.position) < Math.abs(xs[best] - marker.position)) best = i;
    }
    found.push({
      series: meta.series,
      source: meta.source,
      x: { ...meta.x, value: meta.x_values ? meta.x_values[best] : xs[best] },
      y: { ...meta.y, value: ys[best] },
      outside: marker.position < Math.min(...xs) || marker.position > Math.max(...xs),
    });
  }
  return found;
}
