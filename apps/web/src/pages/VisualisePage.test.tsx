import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../api/client";
import type { ComparisonResponse, GradeOut } from "../api/types";
import { defaultDeformationForm, type DeformationFormState } from "../lib/geometry";
import { defaultMaterialForm, type MaterialFormState } from "../lib/material";
import comparison from "../test/fixtures/comparison.json";
import grades from "../test/fixtures/grades.json";
import { installMockApi } from "../test/mockApi";
import { VisualisePage } from "./VisualisePage";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

// WebGL is not available in the test browser: the scene is replaced by a list of what it would draw
const scene = vi.hoisted(() => ({ items: [] as { id: string; label: string; wrinkle: number; zone: string }[] }));
vi.mock("../components/SectionScene", () => ({
  default: ({ items }: { items: typeof scene.items }) => {
    scene.items = items;
    return <ul aria-label="3D scene">{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
  },
}));

const material: MaterialFormState = {
  ...defaultMaterialForm,
  designation: "1.4307",
  family: "austenitic",
  fy: 210,
  fu: 500,
  elasticModulus: 200000,
};
const tube: DeformationFormState = {
  ...defaultDeformationForm,
  kind: "chs",
  d: 100,
  t: 3,
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
  props: Partial<{ material: MaterialFormState; form: DeformationFormState; query: UseQueryResult<ComparisonResponse, ApiError> }> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VisualisePage
        materialForm={props.material ?? material}
        onMaterialChange={() => undefined}
        grades={grades as GradeOut[]}
        form={props.form ?? tube}
        onChange={() => undefined}
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

  it("says what is missing instead of drawing anything, and never fills a value in", () => {
    renderPage({ form: { ...tube, omega: null, poissonRatio: null }, query: fake() });
    expect(screen.getByText(/Still to enter \(section\)/)).toHaveTextContent("Ω");
    expect(screen.queryByLabelText("3D scene")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("explains that a typed critical stress has nothing to draw", () => {
    renderPage({ form: { ...tube, kind: "sigma_cr", sigmaCr: 500 }, query: fake() });
    expect(screen.getByText(/no plate or tube to draw/)).toBeInTheDocument();
  });

  it("shows the API's message when the request is rejected", () => {
    renderPage({ query: fake(undefined, "Wall thickness must be less than half the diameter.") });
    expect(screen.getByRole("alert")).toHaveTextContent("less than half the diameter");
  });
});
