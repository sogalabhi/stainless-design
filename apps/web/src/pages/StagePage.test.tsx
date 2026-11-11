import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../api/client";
import type { BendingResponse, ComparisonResponse, CompressionResponse, TensionResponse } from "../api/types";
import { defaultDeformationForm, type DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";
import { bendingView, compressionView, tensionView, type StageCase } from "../lib/stage";
import bending from "../test/fixtures/bending_template.json";
import comparison from "../test/fixtures/comparison_template.json";
import compression from "../test/fixtures/compression_template.json";
import deformation from "../test/fixtures/deformation_template.json";
import tension from "../test/fixtures/tension.json";
import { installMockApi } from "../test/mockApi";
import { StagePage, type StageCaseInput } from "./StagePage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

// WebGL is not available in the test browser: the 3D cut is replaced by what it would draw
const scene = vi.hoisted(() => ({ calls: [] as { key: string; ratio: number; turned: boolean }[] }));
vi.mock("../components/stage/Stage3D", () => ({
  default: ({ view, frame, section }: { view: { key: string }; frame: { ratio: number }; section: { turned: boolean } }) => {
    scene.calls.push({ key: view.key, ratio: frame.ratio, turned: section.turned });
    return <div aria-label="3D cut scene">{view.key}</div>;
  },
}));

const rolledI: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "template",
  shape: "I-section",
  fabrication: "rolled",
  h: 200,
  b: 100,
  tw: 5.6,
  tf: 8.5,
  r: 12,
  kSigma: { web: 4, flange: 0.43, stem: null, leg: null },
  poissonRatio: 0.3,
  omega: 15,
};

const done = (key: StageCase, view: StageCaseInput["view"]): StageCaseInput => ({
  status: "done",
  waiting: [],
  view,
  notice: null,
  calculating: false,
  fresh: true,
  baseFigure: key === "tension" ? null : (deformation as unknown as { figure: Record<string, unknown> }).figure,
});

const cases = (): Record<StageCase, StageCaseInput> => ({
  tension: done("tension", tensionView(tension as unknown as TensionResponse)),
  compression: done("compression", compressionView(compression as unknown as CompressionResponse)),
  bending: done("bending", bendingView(bending as unknown as BendingResponse)),
});

const sweep = (error?: string): UseQueryResult<ComparisonResponse, ApiError> =>
  ({
    data: error ? undefined : (comparison as unknown as ComparisonResponse),
    isError: error !== undefined,
    error: error ? new Error(error) : null,
    fetchStatus: "idle",
  }) as unknown as UseQueryResult<ComparisonResponse, ApiError>;

function renderPage(
  selected: StageCase,
  over: Partial<Record<StageCase, Partial<StageCaseInput>>> = {},
  props: { form?: DeformationFormState; axis?: "major" | "minor" | null; onGo?: (item: MissingItem) => void; onSelect?: (key: StageCase) => void } = {},
) {
  const base = cases();
  const merged = Object.fromEntries(
    (Object.keys(base) as StageCase[]).map((key) => [key, { ...base[key], ...over[key] }]),
  ) as Record<StageCase, StageCaseInput>;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StagePage
        cases={merged}
        selected={selected}
        onSelect={props.onSelect ?? (() => undefined)}
        materialProblem={false}
        onGo={props.onGo ?? (() => undefined)}
        onOpenMaterial={() => undefined}
        form={props.form ?? rolledI}
        axis={props.axis ?? null}
        values={null}
        sweep={sweep()}
        dark={false}
      />
    </QueryClientProvider>,
  );
}

const scrub = () => screen.getByLabelText(/Strain at the extreme fibre, from zero to the strain limit/) as HTMLInputElement;

beforeEach(() => {
  installMockApi();
  scene.calls.length = 0;
  plotly.react.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe("the load-case switch", () => {
  it("has the three cases, each with its status, and tells the parent which was picked", async () => {
    const onSelect = vi.fn();
    renderPage("compression", { bending: { status: "later" }, tension: { status: "waiting" } }, { onSelect });
    const group = screen.getByRole("group", { name: "Load case" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Tension"),
      expect.stringContaining("Compression"),
      expect.stringContaining("Bending"),
    ]);
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[0]).toHaveTextContent(/waiting for inputs/);
    expect(buttons[2]).toHaveTextContent(/arrives in a later phase/);
    await userEvent.setup().click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith("bending");
  });
});

describe("the headline", () => {
  it("shows the resistance of the chosen case with its symbol, unit and the plain sentence", () => {
    renderPage("compression");
    expect(document.querySelector(".headline-value")).toHaveTextContent("564.4");
    expect(document.querySelector(".headline-unit")).toHaveTextContent("kN");
    expect(screen.getByText(/Formula B\.16: the web lets the section strain to 3\.41 times yield/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /N csm,Rd 564\.4 kN, against A f y \/ γ M0 543\.7/ })).toBeInTheDocument();
  });

  it("bending in kN m with M_el and M_pl, and its notes folded away", () => {
    renderPage("bending");
    expect(document.querySelector(".headline-value")).toHaveTextContent("50.30");
    expect(document.querySelector(".headline-unit")).toHaveTextContent("kN m");
    expect(screen.getByRole("img", { name: /M el 37\.09 and M pl 42\.11/ })).toBeInTheDocument();
    const notes = screen.getByText(/notes on what this result covers/);
    expect(notes.closest("details")).not.toHaveAttribute("open");
    expect(document.querySelectorAll(".status-info")).toHaveLength(0);
  });

  it("tension has the area-and-gamma reference", () => {
    renderPage("tension");
    expect(document.querySelector(".headline-value")).toHaveTextContent("233.1");
    expect(screen.getByText(/22\.1 % above A f_y|22\.1 % above/)).toBeInTheDocument();
  });
});

describe("when a case has no result", () => {
  it("shows the Waiting links for that case", async () => {
    const onGo = vi.fn();
    const item: MissingItem = { label: "γM0", group: "section", field: "gammaM0" };
    renderPage("bending", { bending: { status: "waiting", waiting: [item], view: null } }, { onGo });
    await userEvent.setup().click(screen.getByRole("button", { name: /γM0/ }));
    expect(onGo).toHaveBeenCalledWith(item);
    expect(document.querySelector(".stage-card")).toBeNull();
  });

  it("shows the engine's refusal or its not-built-yet message as the clause pages do", () => {
    renderPage("bending", {
      bending: { status: "later", view: null, notice: { kind: "info", content: <>Not built yet. B.6.3.3: arrives in phase 3.</> } },
    });
    expect(screen.getByText(/B\.6\.3\.3: arrives in phase 3/)).toBeInTheDocument();
    expect(document.querySelector(".stage-card")).toBeNull();
  });
});

describe("the stage", () => {
  it("steps frame to frame: the slider has one position per engine frame and ends on the limit", () => {
    renderPage("bending");
    const frames = bendingView(bending as unknown as BendingResponse).frames.frames;
    expect(scrub()).toHaveAttribute("max", String(frames.length - 1));
    expect(scrub()).toHaveAttribute("step", "1");
    expect(scrub().value).toBe(String(frames.length - 1));
    expect(screen.getByText(/at this section's limit/)).toBeInTheDocument();
  });

  it("a mid frame reads the engine's strain, stress and resistance for that frame", () => {
    renderPage("bending");
    const frames = bendingView(bending as unknown as BendingResponse).frames.frames;
    const index = frames.findIndex((f) => f.marks.includes("first_yield"));
    fireEvent.change(scrub(), { target: { value: String(index) } });
    const readout = document.querySelector(".readout") as HTMLElement;
    expect(readout).toHaveTextContent("1.00");
    expect(readout).toHaveTextContent("210.0");
    expect(readout).toHaveTextContent("37.09"); // M_el: the engine's resistance at the first-yield frame
    expect(readout).toHaveTextContent(/Formula B\.20 branch/);
    expect(readout).toHaveTextContent(/below the limit of 15\.0/);
  });

  it("names the ticks: unloaded, first yield, passes M_pl, the limit", () => {
    renderPage("bending");
    const track = document.querySelector(".track") as HTMLElement;
    // a middle tick that would crowd another is dropped: first yield sits too close to unloaded here
    for (const text of ["unloaded", "passes M", "limit"]) expect(within(track).getByText(new RegExp(text))).toBeInTheDocument();
  });

  it("Load it plays the slider and Stop ends it", async () => {
    renderPage("compression");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load it" }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(scrub().value).toBe("0");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Load it" })).toBeInTheDocument();
  });

  it("draws the section to scale with the governing plate lit, and says what is lit", () => {
    renderPage("compression");
    expect(document.querySelector('[data-lit="web"]')).not.toBeNull();
    expect(screen.getByText(/web governs the strain limit/)).toBeInTheDocument();
    expect(screen.getByText(/Plate that sets the strain limit/)).toBeInTheDocument();
  });

  it("lights the flange when the flange governs in bending", () => {
    renderPage("bending");
    expect(document.querySelector('[data-lit="flange"]')).not.toBeNull();
  });

  it("names the source of the frames", () => {
    renderPage("compression");
    expect(screen.getByText(/Where the frames come from/)).toBeInTheDocument();
    expect(document.querySelector(".stage-source .source-badge")).toHaveTextContent("Code");
  });

  it("without dimensions draws no section and says so, keeping the strain and stress panels", () => {
    renderPage("compression", {}, { form: { ...defaultDeformationForm, kind: "plates" } });
    expect(screen.getByText(/No section is drawn/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /strain .* stress/ })).toBeInTheDocument();
  });

  it("a stale answer is drawn without engine widths or a lit plate", () => {
    renderPage("compression", { compression: { fresh: false } });
    expect(document.querySelector("[data-lit]")).toBeNull();
    expect(document.querySelector('[data-band="c_w"]')).toBeNull();
  });

  it("a section turned for minor-axis bending is sent to the 3D cut turned", async () => {
    renderPage("bending", {}, { axis: "minor" });
    await userEvent.setup().click(screen.getByRole("radio", { name: "3D cut" }));
    expect(await screen.findByLabelText("3D cut scene")).toBeInTheDocument();
    expect(scene.calls[scene.calls.length - 1]).toMatchObject({ key: "bending", turned: true });
  });
});

describe("Drawing and 3D cut", () => {
  it("toggles to the 3D cut with the frame the slider shows", async () => {
    renderPage("compression");
    const user = userEvent.setup();
    fireEvent.change(scrub(), { target: { value: "20" } });
    await user.click(screen.getByRole("radio", { name: "3D cut" }));
    expect(await screen.findByLabelText("3D cut scene")).toBeInTheDocument();
    expect(scene.calls[scene.calls.length - 1].ratio).toBeCloseTo(
      compressionView(compression as unknown as CompressionResponse).frames.frames[20].ratio,
    );
    await user.click(screen.getByRole("radio", { name: "Drawing" }));
    expect(screen.queryByLabelText("3D cut scene")).toBeNull();
  });

  it("says why there is no 3D cut when no dimensions were given", async () => {
    renderPage("tension", {}, { form: { ...defaultDeformationForm, kind: "sigma_cr" } });
    await userEvent.setup().click(screen.getByRole("radio", { name: "3D cut" }));
    expect(screen.getByText(/The 3D cut needs the section's dimensions/)).toBeInTheDocument();
    expect(screen.queryByLabelText("3D cut scene")).toBeNull();
  });
});

describe("how the number is reached", () => {
  it("has three linked cards, each with an in-to-out line, one chart and its working", () => {
    renderPage("compression");
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Step 1: how far can it strain",
      "Step 2: what stress is that",
      "Step 3: what does it resist",
    ]);
    expect(cards[0].querySelector(".io")).toHaveTextContent(/0\.484/);
    expect(cards[0].querySelector(".io")).toHaveTextContent(/3\.41/);
    expect(cards[1].querySelector(".io")).toHaveTextContent(/218\.0 N\/mm²/);
    expect(cards[2].querySelector(".io")).toHaveTextContent(/564\.4 kN/);
    for (const card of cards) {
      expect(card.querySelectorAll(".plot")).toHaveLength(1);
      expect(within(card).getByText(/Show working: step/)).toBeInTheDocument();
    }
  });

  it("the plate table marks the governing row", () => {
    renderPage("compression");
    const row = screen.getByRole("row", { name: /web \(governs\)/ });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(within(row).getByText("28.4")).toBeInTheDocument();
  });

  it("each card's working is filtered to its own step, by clause", () => {
    renderPage("compression");
    const cards = screen.getAllByRole("article");
    const symbols = (card: HTMLElement) => Array.from(card.querySelectorAll(".working .chip")).map((c) => c.textContent);
    expect(symbols(cards[0])).toContain("B.5.1");
    expect(symbols(cards[1])).toEqual(["B.4", "B.4", "B.4", "B.6.2"]);
    expect(symbols(cards[2])).toEqual(["B.6.2", "B.6.2"]);
  });

  it("bending shows only the selected row of Table B.2, the whole table behind a disclosure", () => {
    renderPage("bending");
    const card = screen.getByRole("article", { name: /Step 3/ });
    const tables = card.querySelectorAll("table");
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelectorAll("tbody tr")).toHaveLength(1);
    expect(tables[1].querySelectorAll("tbody tr").length).toBeGreaterThan(5);
    expect(screen.getByText(/Show the whole of Table B\.2/).closest("details")).not.toHaveAttribute("open");
  });

  it("tension needs no slenderness: two bars and the grade's ductility", () => {
    renderPage("tension");
    const card = screen.getByRole("article", { name: /Step 1/ });
    expect(card).toHaveTextContent(/Tension has no buckling/);
    expect(within(card).getByRole("img", { name: /two strain limits of Formula B\.14/ })).toBeInTheDocument();
  });
});

describe("the thickness what-if (compression)", () => {
  const points = (comparison as unknown as ComparisonResponse).points;

  it("is a slider over the engine's sweep, starting at the user's section", () => {
    renderPage("compression");
    const slider = screen.getByLabelText(/What if every thickness changed/) as HTMLInputElement;
    expect(slider).toHaveAttribute("max", String(points.length - 1));
    expect(slider.value).toBe(String(points.findIndex((p) => p.factor === 1)));
    expect(screen.queryByText(/Back to your section/)).toBeNull();
  });

  it("is not offered for tension or bending", () => {
    renderPage("bending");
    expect(screen.queryByLabelText(/What if every thickness changed/)).toBeNull();
  });

  it("a what-if position says so, keeps the headline, and uses the sweep point's engine values", () => {
    renderPage("compression");
    const index = points.findIndex((p) => p.zone === "slender" && p.strain_ratio !== null);
    fireEvent.change(screen.getByLabelText(/What if every thickness changed/), { target: { value: String(index) } });
    expect(screen.getByText(/What-if: every thickness ×/)).toBeInTheDocument();
    expect(screen.getByText(/the resistance above is still your section's/)).toBeInTheDocument();
    expect(document.querySelector(".headline-value")).toHaveTextContent("564.4");
    const last = scrubMax();
    expect(scrub()).toHaveAttribute("max", String(last));
    const readout = document.querySelector(".readout") as HTMLElement;
    expect(readout).toHaveTextContent(/What-if section/);
    expect(readout).toHaveTextContent(String(points[index].stress!.toFixed(1)));
    expect(screen.getByText(/The flat widths c are not returned/)).toBeInTheDocument();
  });

  it("Back to your section returns to the user's section", async () => {
    renderPage("compression");
    const index = points.findIndex((p) => p.zone === "slender");
    fireEvent.change(screen.getByLabelText(/What if every thickness changed/), { target: { value: String(index) } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to your section" }));
    expect(screen.queryByText(/What-if: every thickness/)).toBeNull();
    expect(screen.getByText(/at this section's limit/)).toBeInTheDocument();
  });

  it("beyond the method's limit it says Annex B does not apply and draws no strain limit", () => {
    renderPage("compression");
    const index = points.findIndex((p) => p.zone === "not_allowed");
    fireEvent.change(screen.getByLabelText(/What if every thickness changed/), { target: { value: String(index) } });
    expect(screen.getByText(/Annex B does not apply \(B\.2\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load it" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: /strain .* stress/ })).toBeNull();
  });
});

function scrubMax(): number {
  return Number(scrub().max);
}
