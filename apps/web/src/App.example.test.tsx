import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { EXAMPLE_SOURCES } from "./lib/example";
import { installMockApi } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  installMockApi();
  plotly.react.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const group = (name: RegExp) => within(dock()).getByRole("button", { name });

async function openGroup(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  if (group(name).getAttribute("aria-expanded") !== "true") await user.click(group(name));
}

async function loadExample(user: ReturnType<typeof userEvent.setup>) {
  const button = within(dock()).getByRole("button", { name: /Load example/ });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

describe("Load example", () => {
  it("starts with every field empty, no banner, and nothing filled until it is clicked", () => {
    renderApp();
    expect(within(dock()).getByRole("button", { name: /Load example/ })).toBeInTheDocument();
    expect(within(dock()).queryByText(/Example values loaded/)).not.toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^f_?y/)).toHaveValue(null);
    expect(within(dock()).getByLabelText(/^E/)).toHaveValue(null);
  });

  it("fills the material, section and deformation inputs and the tabs stop waiting", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);

    // Material: the grade came through selectGrade (Table 5.1)
    expect(within(dock()).getByLabelText(/^Grade/)).toHaveValue("1.4301");
    expect(within(dock()).getByLabelText(/^f_?y/)).toHaveValue(210);
    expect(within(dock()).getByLabelText(/^f_?u/)).toHaveValue(500);
    expect(within(dock()).getByLabelText(/^Family/)).toHaveValue("austenitic");
    expect(within(dock()).getByLabelText(/^E/)).toHaveValue(200000);

    // Section
    await openGroup(user, /^Section/);
    expect(within(dock()).getByLabelText(/^Section type/)).toHaveValue("I-section");
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveValue(2848);
    expect(within(dock()).getByLabelText(/^γM0/)).toHaveValue(1.1);
    expect(within(dock()).getByLabelText(/^Section has holes/)).not.toBeChecked();
    // the rolled I-section of the example, typed into the dimension fields (the template route)
    expect(within(dock()).getByLabelText(/^Fabrication/)).toHaveValue("rolled");
    for (const [label, value] of [
      [/^Overall height h/, 200],
      [/^Overall width b/, 100],
      [/^Web thickness/, 5.6],
      [/^Flange thickness/, 8.5],
      [/^Root radius r/, 12],
    ] as const) {
      expect(within(dock()).getByLabelText(label)).toHaveValue(value);
    }
    expect(within(dock()).queryByLabelText(/^Weld leg s/)).not.toBeInTheDocument();
    // the thumbnail is to scale once the dimensions are complete; the big drawing is in the geometry window
    expect(within(dock()).getByRole("img", { name: /^Thumbnail of the I-section$/ })).toBeInTheDocument();
    expect(within(dock()).queryByRole("img", { name: /sketch/ })).not.toBeInTheDocument();

    // Deformation
    await openGroup(user, /^Deformation capacity/);
    expect(within(dock()).getByLabelText(/^Poisson/)).toHaveValue(0.3);
    expect(within(dock()).getByLabelText(/^Ω/)).toHaveValue(15);
    expect(within(dock()).getByLabelText(/^Slenderness from/)).toHaveValue("template");
    expect(within(dock()).getByLabelText(/^k_?σ, web/)).toHaveValue(4);
    expect(within(dock()).getByLabelText(/^k_?σ, flange outstand/)).toHaveValue(0.43);
    expect(within(dock()).queryByLabelText(/^Flat width/)).not.toBeInTheDocument();

    // Bending: the major axis, W_el,y and W_pl,y of the example section, λ_LT and the bending k_σ
    await openGroup(user, /^Bending/);
    expect(within(dock()).getByLabelText(/^Axis of bending/)).toHaveValue("major");
    expect(within(dock()).getByLabelText(/^Elastic modulus/)).toHaveValue(194300);
    expect(within(dock()).getByLabelText(/^Plastic modulus/)).toHaveValue(220600);
    expect(within(dock()).getByLabelText(/^Relative slenderness/)).toHaveValue(0.15);
    expect(within(dock()).getByLabelText(/^k_?σ in bending, web/)).toHaveValue(23.9);
    expect(within(dock()).getByLabelText(/^k_?σ in bending, flange outstand/)).toHaveValue(0.43);
    // the compression k_σ (checked above, in the Deformation group) are separate fields
    expect(within(dock()).queryByLabelText(/^k_?σ, web/)).not.toBeInTheDocument();

    for (const name of [/Material/, /Deformation/, /Tension/, /Compression/, /Bending/]) {
      await waitFor(() => expect(tab(name)).not.toHaveTextContent("waiting for inputs"));
    }
    expect(screen.getByRole("button", { name: /^Inputs/ })).not.toHaveTextContent("to enter");
  });

  it("leaves the corner radii r_o and the angle's r alone: the I-section example needs neither", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Section/);
    expect(within(dock()).queryByLabelText(/^Outer corner radius/)).not.toBeInTheDocument();
    await user.click(within(dock()).getByRole("button", { name: /Section geometry/ }));
    const modal = screen.getByRole("dialog", { name: "Section geometry" });
    // the engine's area for the example (2848.42) is within 0.5 % of the example's A (2848)
    await within(modal).findByText("Area and centroid");
    expect(within(dock()).queryByText(/differs from the geometry value/)).not.toBeInTheDocument();
    expect(within(dock()).queryByText(/copied from geometry/)).not.toBeInTheDocument(); // nothing is copied without Use
    expect(within(dock()).getByLabelText(/^Area A/)).toHaveValue(2848);
  });

  it("shows the banner and the list of sources", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    expect(within(dock()).getByText("Example values loaded: replace them with your own.")).toBeInTheDocument();
    const summary = within(dock()).getByText("Where these example values come from");
    await user.click(summary);
    for (const source of EXAMPLE_SOURCES) expect(within(dock()).getByText(source)).toBeVisible();
    expect(EXAMPLE_SOURCES).toHaveLength(9);
    expect(EXAMPLE_SOURCES.filter((source) => /^Bending|^λ_LT|^k_σ for bending/.test(source))).toHaveLength(3);
  });

  it("empties everything again with Clear all, and the banner goes away", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await user.click(within(dock()).getByRole("button", { name: "Clear all" }));

    expect(within(dock()).queryByText(/Example values loaded/)).not.toBeInTheDocument();
    expect(within(dock()).getByLabelText(/^Grade/)).toHaveValue("custom");
    expect(within(dock()).getByLabelText(/^f_?y/)).toHaveValue(null);
    expect(within(dock()).getByLabelText(/^f_?u/)).toHaveValue(null);
    expect(within(dock()).getByLabelText(/^E/)).toHaveValue(null);
    expect(group(/^Material/)).toHaveTextContent("4 to enter");
    expect(group(/^Section/)).toHaveTextContent("3 to enter");
    expect(group(/^Deformation capacity/)).toHaveTextContent("2 to enter");
    expect(group(/^Bending/)).toHaveTextContent("3 to enter");
    await waitFor(() => expect(tab(/Tension/)).toHaveTextContent("waiting for inputs"));
    expect(tab(/Material/)).toHaveTextContent("waiting for inputs");
  });
});
