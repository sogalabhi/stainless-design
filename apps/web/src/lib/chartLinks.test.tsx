import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChartLinkProvider, useChartLinks } from "./chartLinks";
import type { Pin, PinnedQuantity, Readout } from "./chartReadout";

const READOUT: Readout = { title: "Base curve (B.6)", axes: {}, tables: [] };
const PIN: Pin = { x: { label: "λ_p,cs", unit: "", value: 0.5 }, rows: [] };

function quantity(value: number, chart: string): PinnedQuantity {
  return { value, label: "λ_p,cs", html: "λ", unit: "", chart, title: chart };
}

const wrapper = ({ children }: { children: ReactNode }) => <ChartLinkProvider>{children}</ChartLinkProvider>;

describe("chart links", () => {
  it("keeps the latest pin of each quantity and the chart it came from", () => {
    const { result } = renderHook(() => useChartLinks(), { wrapper });
    act(() => result.current.setPin("base", { pin: PIN, readout: READOUT }, { lambda_p: quantity(0.5, "base"), strain_ratio: { ...quantity(2.6, "base") } }));
    act(() => result.current.setPin("bending", { pin: PIN, readout: READOUT }, { strain_ratio: quantity(4.2, "bending") }));
    expect(result.current.quantities.lambda_p).toMatchObject({ value: 0.5, chart: "base" });
    expect(result.current.quantities.strain_ratio).toMatchObject({ value: 4.2, chart: "bending" });
    expect(Object.keys(result.current.pins).sort()).toEqual(["base", "bending"]);
  });

  it("a new pin on a chart replaces what that chart set before", () => {
    const { result } = renderHook(() => useChartLinks(), { wrapper });
    act(() => result.current.setPin("base", { pin: PIN, readout: READOUT }, { lambda_p: quantity(0.5, "base"), strain_ratio: quantity(2.6, "base") }));
    act(() => result.current.setPin("base", { pin: PIN, readout: READOUT }, { lambda_p: quantity(0.9, "base") }));
    expect(result.current.quantities).toEqual({ lambda_p: quantity(0.9, "base") });
  });

  it("clearing a chart's pin clears its links and nothing else", () => {
    const { result } = renderHook(() => useChartLinks(), { wrapper });
    act(() => result.current.setPin("base", { pin: PIN, readout: READOUT }, { lambda_p: quantity(0.5, "base") }));
    act(() => result.current.setPin("bending", { pin: PIN, readout: READOUT }, { strain_ratio: quantity(4.2, "bending") }));
    act(() => result.current.clearPin("base"));
    expect(result.current.quantities).toEqual({ strain_ratio: quantity(4.2, "bending") });
    expect(Object.keys(result.current.pins)).toEqual(["bending"]);
    const before = result.current;
    act(() => result.current.clearPin("nothing pinned here"));
    expect(result.current.quantities).toBe(before.quantities);
  });

  it("works without a provider, for one chart alone", () => {
    const { result } = renderHook(() => useChartLinks());
    act(() => result.current.setPin("solo", { pin: PIN, readout: READOUT }, {}));
    expect(result.current.pins.solo.pin).toBe(PIN);
  });
});
