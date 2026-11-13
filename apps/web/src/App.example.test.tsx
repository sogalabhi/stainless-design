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
    // A is computed from the geometry, not typed: it is shown, not an input
    await waitFor(() => expect(within(dock()).getByLabelText(/^Area A/)).toHaveTextContent("3 140"));
    expect(within(dock()).getByLabelText(/^γM0/)).toHaveValue(1.1);
    expect(within(dock()).getByLabelText(/^Section has holes/)).not.toBeChecked();
    // the custom route: the unsymmetric I-section as five plates in the table, not the template
    expect(within(dock()).getByLabelText(/^Geometry/)).toHaveValue("custom");
    expect(within(dock()).queryByLabelText(/^Overall height h/)).not.toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^Fabrication/)).not.toBeInTheDocument();
    for (const [name, width, thickness, kSigma] of [
      ["top flange outstand, left", 47, 10, 0.43],
      ["top flange outstand, right", 47, 10, 0.43],
      ["web", 280, 6, 4],
      ["bottom flange outstand, left", 97, 10, 0.43],
      ["bottom flange outstand, right", 97, 10, 0.43],
    ] as const) {
      expect(within(dock()).getByLabelText(`Flat width b̄ [mm], ${name}`)).toHaveValue(String(width));
      expect(within(dock()).getByLabelText(`Thickness t [mm], ${name}`)).toHaveValue(String(thickness));
      expect(within(dock()).getByLabelText(new RegExp(`^k.{0,2}σ, ${name}`))).toHaveValue(String(kSigma));
    }

    // Deformation
    await openGroup(user, /^Deformation capacity/);
    expect(within(dock()).getByLabelText(/^Poisson/)).toHaveValue(0.3);
    expect(within(dock()).getByLabelText(/^Ω/)).toHaveValue(15);
    expect(within(dock()).getByLabelText(/^Slenderness from/)).toHaveValue("plates");

    // Bending: the major axis, W_el,y and W_pl,y of the plates, λ_LT and the bending k_σ of each plate
    await openGroup(user, /^Bending/);
    expect(within(dock()).getByLabelText(/^Axis of bending/)).toHaveValue("major");
    expect(within(dock()).getByLabelText(/^Elastic modulus/)).toHaveValue(384475);
    expect(within(dock()).getByLabelText(/^Plastic modulus/)).toHaveValue(510933);
    expect(within(dock()).getByLabelText(/^Relative slenderness/)).toHaveValue(0.15);
    expect(within(dock()).getByLabelText(/^k_?σ in bending, web/)).toHaveValue(15.8);
    expect(within(dock()).getByLabelText(/^k_?σ in bending, top flange outstand, left/)).toHaveValue(0.43);

    for (const name of [/Material/, /Deformation/, /Tension/, /Compression/, /Bending/]) {
      await waitFor(() => expect(tab(name)).not.toHaveTextContent("waiting for inputs"));
    }
    expect(screen.getByRole("button", { name: /^Inputs/ })).not.toHaveTextContent("to enter");
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
    expect(group(/^Section/)).toHaveTextContent("2 to enter");
    expect(group(/^Deformation capacity/)).toHaveTextContent("2 to enter");
    expect(group(/^Bending/)).toHaveTextContent("3 to enter");
    await waitFor(() => expect(tab(/Tension/)).toHaveTextContent("waiting for inputs"));
    expect(tab(/Material/)).toHaveTextContent("waiting for inputs");
  });
});
