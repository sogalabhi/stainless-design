import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { BendingResponse } from "../api/types";
import type { MissingItem } from "../lib/inputs";
import b19 from "../test/fixtures/bending_b19.json";
import b20 from "../test/fixtures/bending_b20.json";
import template from "../test/fixtures/bending_template.json";
import gateError from "../test/fixtures/bending_gate_error.json";
import notBuiltError from "../test/fixtures/bending_not_built_error.json";
import { installMockApi } from "../test/mockApi";
import { BendingPage } from "./BendingPage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

beforeEach(() => {
  installMockApi();
  plotly.react.mockClear();
});

// Recorded from POST /api/v1/bending: a plate 100 x 5 (grade 1.4307, k_σ of bending 8) is stocky and the
// strain limit is held to the cap, so B.20; a plate 250 x 3 gives B.19; `template` is the example rolled
// I-section about its major axis (web 23.9, flange 0.43).
const stocky = b20 as unknown as BendingResponse;
const slender = b19 as unknown as BendingResponse;
const example = template as unknown as BendingResponse;

function fake(
  data: BendingResponse | undefined,
  error?: ApiError,
): UseQueryResult<BendingResponse, ApiError> {
  return {
    data,
    isError: error !== undefined,
    error: error ?? null,
    isFetching: false,
  } as unknown as UseQueryResult<BendingResponse, ApiError>;
}

function renderPage({
  data = stocky,
  waiting = [],
  error,
  onGo = () => undefined,
}: {
  data?: BendingResponse;
  waiting?: MissingItem[];
  error?: ApiError;
  onGo?: (item: MissingItem) => void;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BendingPage
        waiting={waiting}
        materialProblem={false}
        onGo={onGo}
        onOpenMaterial={() => undefined}
        query={fake(error ? undefined : data, error)}
        dark={false}
      />
    </QueryClientProvider>,
  );
}

const card = (title: RegExp) => {
  const found = [...document.querySelectorAll(".metric")].find((el) =>
    title.test(el.querySelector(".metric-title")?.textContent ?? ""),
  );
  if (!found) throw new Error(`no result card ${title}`);
  return found as HTMLElement;
};

describe("Formula B.20 (the strain limit reaches or passes yield)", () => {
  it("shows ε_csm/ε_y, α and M_csm,c,Rd in kN m, converted only for display", () => {
    renderPage({ data: example });
    expect(card(/εcsm \/ εy/)).toHaveTextContent("15");
    expect(card(/εcsm \/ εy/)).toHaveTextContent("held to the cap");
    expect(card(/^α$/)).toHaveTextContent("2.0");
    expect(card(/Mcsm,c,Rd/)).toHaveTextContent("50.30"); // 50 299 323.7 N mm
    expect(card(/Mcsm,c,Rd/)).toHaveTextContent("Formula B.20");
    expect(card(/Mcsm,c,Rd/).querySelector(".metric-title")).toHaveTextContent("[kN m]");
  });

  it("says which formula applied and why, and names the strain-limit source", () => {
    renderPage({ data: example });
    expect(screen.getByText(/Formula B\.20 applies because/)).toHaveTextContent(/at least 1\.0.*α = 2\.0 \(Table B\.2\)/);
    expect(screen.getByText(/The strain limit is found for the section in bending/)).toHaveTextContent(
      /λp,cs = 0\.21525.*set by the flange.*bending k_σ|bending kσ/,
    );
  });

  it("shows Table B.2 as printed, with only the used row lit", () => {
    renderPage({ data: example });
    const table = screen.getByRole("heading", { name: /Table B\.2/ }).closest(".table-wrap") as HTMLElement;
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(13);
    const lit = rows.filter((row) => row.getAttribute("aria-selected") === "true");
    expect(lit).toHaveLength(1);
    expect(lit[0]).toHaveTextContent(/I-section\s*Major\s*Any\s*2\.0/);
    expect(lit[0]).toHaveClass("selected");
    expect(within(table).getByText("Equal angle")).toBeInTheDocument();
    expect(within(table).getAllByText("Unequal angle")).toHaveLength(2);
  });

  it("draws both charts from the engine's figures", () => {
    renderPage({ data: example });
    expect(plotly.react).toHaveBeenCalledTimes(2);
    const drawn = plotly.react.mock.calls as unknown as [unknown, { name?: string }[]][];
    const names = drawn.flatMap(([, data]) => data.map((trace) => trace.name));
    expect(names).toContain("Your section");
    expect(names.some((n) => n?.includes("B.19"))).toBe(true);
    expect(names.some((n) => n?.includes("B.20"))).toBe(true);
    expect(names).toContain("Strain");
    expect(names).toContain("Stress");
    expect(screen.getByRole("img", { name: /Bending resistance against the strain limit ratio/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Strain and stress across the depth/ })).toBeInTheDocument();
  });

  it("has the working, B.5 before B.6.3.1 before B.6.3.2, and the symbols panel", async () => {
    renderPage({ data: example });
    const user = userEvent.setup();
    await user.click(screen.getByText(/Show working: B\.5 and B\.6\.3/));
    const chips = [...document.querySelectorAll(".working .chip")].map((el) => el.textContent);
    expect(chips.indexOf("8.2.2(5)")).toBeLessThan(chips.indexOf("B.5.2"));
    expect(chips.indexOf("B.5.1")).toBeLessThan(chips.indexOf("B.6.3.1"));
    expect(chips.indexOf("B.6.3.1")).toBeLessThan(chips.indexOf("B.6.3.2"));
    expect(chips.filter((chip) => chip === "B.6.3.1")).toHaveLength(1);
    expect(chips.filter((chip) => chip === "B.6.3.2").length).toBeGreaterThanOrEqual(4);
    expect(chips).not.toContain("B.4");
    expect(screen.getByText("Symbols used on this page")).toBeInTheDocument();
  });

  it("has no inputs of its own and no verdict, utilisation or classic comparison", () => {
    renderPage({ data: example });
    const main = screen.getByRole("region", { name: "Bending results" });
    expect(within(main).queryAllByRole("spinbutton")).toEqual([]);
    expect(main.textContent).not.toMatch(/PASS|FAIL|utilisation|classic|\bgain\b|M_Ed/i);
  });

  it("stocky plate fixture is also B.20", () => {
    renderPage({ data: stocky });
    expect(card(/Mcsm,c,Rd/)).toHaveTextContent("50.31");
  });
});

describe("Formula B.19 (the section buckles before it yields)", () => {
  it("says W_pl and α are not used, and the cards say so", () => {
    renderPage({ data: slender });
    expect(card(/εcsm \/ εy/)).toHaveTextContent("0.77554");
    expect(card(/^α$/)).toHaveTextContent("not used by B.19");
    expect(card(/Mcsm,c,Rd/)).toHaveTextContent("28.77");
    expect(card(/Mcsm,c,Rd/)).toHaveTextContent("Formula B.19");
    expect(screen.getByText(/Formula B\.19 applies because/)).toHaveTextContent(
      /below 1\.0.*W_?pl and α are not used/,
    );
  });
});

describe("refusals, not built yet, and waiting", () => {
  it("λ_LT above 0.4 is the engine's refusal, shown as an error with its own words", () => {
    renderPage({ error: new ApiError(gateError.detail, gateError.error_type) });
    expect(screen.getByRole("alert")).toHaveTextContent("B.6.3.1 does not apply; use 8.2.4");
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
    expect(plotly.react).not.toHaveBeenCalled();
  });

  it("a case that arrives in phase 3 is plain information, not an error, and not called a refusal", () => {
    renderPage({ error: new ApiError(notBuiltError.detail, notBuiltError.error_type) });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const box = screen.getByRole("status");
    expect(box).toHaveTextContent("Not built yet");
    expect(box).toHaveTextContent("B.6.3.3: arrives in phase 3");
    expect(box.textContent).not.toMatch(/refus|does not apply/i);
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
  });

  it("beyond the B.5 limit is the engine's message as an error", () => {
    renderPage({ error: new ApiError("The cross-section is too slender for the CSM.", "NotApplicableError") });
    expect(screen.getByRole("alert")).toHaveTextContent("too slender for the CSM");
  });

  it("missing inputs are links into the dock, and nothing is calculated", async () => {
    const onGo = vi.fn();
    const items: MissingItem[] = [
      { label: "W_el", group: "bending", field: "wEl" },
      { label: "λ_LT", group: "bending", field: "lambdaLT" },
    ];
    renderPage({ waiting: items, onGo });
    expect(screen.getByRole("status")).toHaveTextContent(/Waiting for:.*Wel.*λLT/);
    expect(document.querySelector(".metric")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "λLT" }));
    expect(onGo).toHaveBeenCalledWith(items[1]);
  });
});

describe("Help", () => {
  it("has a bending module with its sketch in the Modules topic", async () => {
    const { HelpPage } = await import("./HelpPage");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HelpPage />
      </QueryClientProvider>,
    );
    await userEvent.setup().click(screen.getByRole("radio", { name: "Modules" }));
    expect(screen.getByRole("heading", { name: /5 · Bending \(B\.6\.3\)/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /An I-section bent about its major axis/ })).toBeInTheDocument();
  });
});
