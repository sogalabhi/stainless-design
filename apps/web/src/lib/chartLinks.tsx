/**
 * Linked charts: the latest pinned value of each named quantity (λ_p,cs, ε_csm / ε_y, ε, ...)
 * and the chart it was pinned on. The provider sits above the tabs, so a pin on one tab shows
 * on the charts of every other tab that has an axis for that quantity.
 *
 * Each chart's own pin card is kept here too, so it is still there when its tab comes back.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Pin, PinnedQuantity, Readout } from "./chartReadout";

export type ChartPin = {
  pin: Pin;
  /** The server readout the pin was read from: a new figure makes the pin out of date. */
  readout: Readout;
};

export type ChartLinks = {
  quantities: Record<string, PinnedQuantity>;
  pins: Record<string, ChartPin>;
  /** Pins `pin` on `chart`; replaces that chart's earlier pin and the quantities it set. */
  setPin: (chart: string, pin: ChartPin, quantities: Record<string, PinnedQuantity>) => void;
  /** Clears the pin of `chart` and every link that came from it. */
  clearPin: (chart: string) => void;
};

type State = Pick<ChartLinks, "quantities" | "pins">;

const EMPTY: State = { quantities: {}, pins: {} };

function withoutChart(quantities: Record<string, PinnedQuantity>, chart: string) {
  return Object.fromEntries(Object.entries(quantities).filter(([, value]) => value.chart !== chart));
}

/** The store behind the provider; also used alone by a chart rendered without a provider. */
export function useChartLinkStore(): ChartLinks {
  const [state, setState] = useState<State>(EMPTY);
  const setPin = useCallback<ChartLinks["setPin"]>((chart, pin, quantities) => {
    setState((old) => ({
      pins: { ...old.pins, [chart]: pin },
      quantities: { ...withoutChart(old.quantities, chart), ...quantities },
    }));
  }, []);
  const clearPin = useCallback<ChartLinks["clearPin"]>((chart) => {
    setState((old) => {
      if (!(chart in old.pins) && !Object.values(old.quantities).some((q) => q.chart === chart)) return old;
      const pins = { ...old.pins };
      delete pins[chart];
      return { pins, quantities: withoutChart(old.quantities, chart) };
    });
  }, []);
  return useMemo(() => ({ ...state, setPin, clearPin }), [state, setPin, clearPin]);
}

const ChartLinkContext = createContext<ChartLinks | null>(null);

export function ChartLinkProvider({ children }: { children: ReactNode }) {
  const links = useChartLinkStore();
  return <ChartLinkContext.Provider value={links}>{children}</ChartLinkContext.Provider>;
}

/** The app's links, or a store of this chart's own when there is no provider (tests, say). */
export function useChartLinks(): ChartLinks {
  const shared = useContext(ChartLinkContext);
  const local = useChartLinkStore();
  return shared ?? local;
}
