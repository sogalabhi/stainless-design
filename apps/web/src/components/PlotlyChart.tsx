import Plotly from "plotly.js-dist-min";
import { useEffect, useRef } from "react";

type Layout = Record<string, unknown>;

/** Adapts the server's figure to the light or dark theme without changing its content. */
export function themedLayout(layout: Layout, dark: boolean): Layout {
  const text = dark ? "#e8e8e6" : "#1a1a19";
  const grid = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const axis = (value: unknown) => ({
    ...(value as Layout | undefined),
    gridcolor: grid,
    linecolor: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
    zerolinecolor: grid,
  });
  return {
    ...layout,
    autosize: true,
    font: { ...(layout.font as Layout | undefined), color: text },
    xaxis: axis(layout.xaxis),
    yaxis: axis(layout.yaxis),
  };
}

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

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const data = (figure.data as unknown[] | undefined) ?? [];
    const layout = (figure.layout as Layout | undefined) ?? {};
    void Plotly.react(element, data, themedLayout(layout, dark), {
      responsive: true,
      displaylogo: false,
    });
  }, [figure, dark]);

  useEffect(() => {
    const element = ref.current;
    return () => {
      if (element) Plotly.purge(element);
    };
  }, []);

  return <div ref={ref} className="plot" role="img" aria-label={label} />;
}
