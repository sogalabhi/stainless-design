import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../api/client";
import type { ComparisonResponse } from "../api/types";
import { defaultDeformationForm, missingDeformationItems, type DeformationFormState } from "../lib/geometry";
import type { MissingItem } from "../lib/inputs";
import comparison from "../test/fixtures/comparison.json";
import comparisonTemplate from "../test/fixtures/comparison_template.json";
import { installMockApi } from "../test/mockApi";
import { VisualisePage } from "./VisualisePage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

// WebGL is not available in the test browser: the scene is replaced by a list of what it would draw
const scene = vi.hoisted(() => ({
  items: [] as { id: string; label: string; wrinkle: number; zone: string; governing?: string; section: Record<string, unknown> }[],
}));
vi.mock("../components/SectionScene", () => ({
  default: ({ items }: { items: typeof scene.items }) => {
    scene.items = items;
    return <ul aria-label="3D scene">{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
  },
}));

const tube: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "chs",
  d: 100,
  t: 3,
  poissonRatio: 0.3,
  omega: 15,
};

// the rolled I-section of the recorded fixture: h 200, b 100, t_w 5.6, t_f 8.5, r 12
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

function fake(data?: ComparisonResponse, error?: string): UseQueryResult<ComparisonResponse, ApiError> {
  return {
    data,
    isError: error !== undefined,
    error: error === undefined ? null : new Error(error),
    isFetching: false,
  } as unknown as UseQueryResult<ComparisonResponse, ApiError>;
}

function renderPage(
  props: Partial<{
    form: DeformationFormState;
    query: UseQueryResult<ComparisonResponse, ApiError>;
    waiting: MissingItem[];
    typedStress: boolean;
    onGo: (item: MissingItem) => void;
  }> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VisualisePage
        waiting={props.waiting ?? []}
        materialProblem={false}
        typedStress={props.typedStress ?? false}
        onGo={props.onGo ?? (() => undefined)}
        onOpenMaterial={() => undefined}
        form={props.form ?? tube}
        query={props.query ?? fake(comparison as ComparisonResponse)}
        dark={false}
      />
    </QueryClientProvider>,
  );
}

/** A metric card by the start of its title as read aloud (subscripts are separate elements). */
function metric(title: string): HTMLElement {
  const cards = [...document.querySelectorAll<HTMLElement>(".metric")];
  return cards.find((card) => card.querySelector(".metric-title")?.textContent?.startsWith(title)) as HTMLElement;
}

beforeEach(() => {
  installMockApi();
  plotly.react.mockClear();
  scene.items = [];
});

describe("Visualise page", () => {
  it("starts on your section and shows the 3D scene, both charts and the bending picture", async () => {
    renderPage();
    expect(await screen.findByLabelText("3D scene")).toBeInTheDocument();
    expect(within(metric("thickness factor")).getByText("× 1.00")).toBeInTheDocument();
    expect(plotly.react).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: /Bending: what each model credits/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Strain and stress across the depth/ })).toBeInTheDocument();
  });

  it("draws the slider section first and then every reference section, stocky to slender", async () => {
    renderPage();
    await screen.findByLabelText("3D scene");
    expect(scene.items.map((item) => item.id)).toEqual(["slider", "capped", "yours", "yield", "limit"]);
    expect(scene.items.find((item) => item.id === "yours")?.wrinkle).toBe(0);
    expect(scene.items.find((item) => item.id === "limit")?.wrinkle).toBeCloseTo(1);
  });

  it("moving the slider changes the numbers, the zone and the wrinkles at once", async () => {
    renderPage();
    const slider = await screen.findByRole("slider");
    const last = Number(slider.getAttribute("max"));
    fireEvent.change(slider, { target: { value: "0" } });
    expect(within(metric("εcsm / εy")).getByText("not allowed")).toBeInTheDocument();
    expect(screen.getByText(/too slender for the CSM/)).toBeInTheDocument();
    expect(scene.items[0].zone).toBe("not_allowed");
    expect(scene.items[0].wrinkle).toBeGreaterThan(1);

    fireEvent.change(slider, { target: { value: String(last) } });
    expect(scene.items[0].wrinkle).toBe(0);
    expect(screen.getByText(/Stocky: on the first branch/)).toBeInTheDocument();
  });

  it("jumps to a reference section and back to yours", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("3D scene");
    await user.click(screen.getByRole("button", { name: "Thinnest allowed" }));
    expect(within(metric("λcs")).getByText("0.6")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back to your section/ }));
    expect(within(metric("thickness factor")).getByText("× 1.00")).toBeInTheDocument();
  });

  it("says what is missing, as links into the dock, instead of drawing anything", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const form = { ...tube, omega: null, poissonRatio: null };
    renderPage({ form, waiting: missingDeformationItems(form), query: fake(), onGo });
    expect(screen.getByRole("status")).toHaveTextContent(/Waiting for:.*Ω/);
    await user.click(screen.getByRole("button", { name: "Ω" }));
    expect(onGo).toHaveBeenCalledWith({ label: "Ω", group: "deformation", field: "omega" });
    expect(screen.queryByLabelText("3D scene")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("explains that a typed critical stress has nothing to draw", () => {
    renderPage({ form: { ...tube, kind: "sigma_cr", sigmaCr: 500 }, typedStress: true, query: fake() });
    expect(screen.getByText(/no plate or tube to draw/)).toBeInTheDocument();
  });

  it("shows the API's message when the request is rejected", () => {
    renderPage({ query: fake(undefined, "Wall thickness must be less than half the diameter.") });
    expect(screen.getByRole("alert")).toHaveTextContent("less than half the diameter");
  });
});

describe("Explore with a section template", () => {
  const live = () => renderPage({ form: rolledI, query: fake(comparisonTemplate as ComparisonResponse) });

  it("draws the assembled section from the typed dimensions: web and flanges in place", async () => {
    live();
    await screen.findByLabelText("3D scene");
    const yours = scene.items.find((item) => item.id === "yours")!;
    expect(yours.section).toMatchObject({ kind: "template", width: 100, depth: 200 });
    const plates = (yours.section as { plates: { role: string; thickness: number }[] }).plates;
    expect(plates.map((p) => p.role).sort()).toEqual(["flange", "flange", "web"]);
    expect(plates.find((p) => p.role === "web")?.thickness).toBeCloseTo(5.6);
    expect(plates.find((p) => p.role === "flange")?.thickness).toBeCloseTo(8.5);
  });

  it("every item names the plate the engine reports as governing, so only that plate wrinkles", async () => {
    live();
    await screen.findByLabelText("3D scene");
    const fromEngine = (comparisonTemplate as ComparisonResponse).references.map((ref) => ref.point.governing_label);
    expect(fromEngine.every((label) => label === "web" || label === "flange")).toBe(true);
    const yours = scene.items.find((item) => item.id === "yours")!;
    expect(yours.governing).toBe("web");
  });

  it("the slider section has the thicknesses multiplied and h and b unchanged", async () => {
    live();
    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "0" } });
    const section = scene.items[0].section as { width: number; depth: number; plates: { role: string; thickness: number }[] };
    const factor = (comparisonTemplate as ComparisonResponse).points[0].factor;
    expect(section.width).toBe(100);
    expect(section.depth).toBe(200);
    expect(section.plates.find((p) => p.role === "flange")?.thickness).toBeCloseTo(8.5 * factor);
    expect(section.plates.find((p) => p.role === "web")?.thickness).toBeCloseTo(5.6 * factor);
  });

  it("says in a caption that fillets and weld triangles are left out of the 3D view", async () => {
    live();
    await screen.findByLabelText("3D scene");
    expect(screen.getByText(/Fillets and weld triangles are left out of the 3D view/)).toBeInTheDocument();
  });
});
