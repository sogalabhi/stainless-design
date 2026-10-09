import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installMockApi, requests } from "./test/mockApi";

const plotly = vi.hoisted(() => ({ react: vi.fn(() => Promise.resolve()), purge: vi.fn() }));
vi.mock("plotly.js-dist-min", () => ({ default: plotly }));
vi.mock("./components/SectionScene", () => ({ default: () => <div aria-label="3D scene" /> }));

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
  window.localStorage.clear();
  plotly.react.mockClear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

type User = ReturnType<typeof userEvent.setup>;
const dock = () => screen.getByRole("complementary", { name: "Inputs" });
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const group = (name: RegExp) => within(dock()).getByRole("button", { name });
const results = () => screen.getByRole("region", { name: "Bending results" });
const bendingCalls = () => requests.filter((r) => r.path.endsWith("/bending"));
const compressionCalls = () => requests.filter((r) => r.path.endsWith("/compression"));
const label = (pattern: RegExp) => within(dock()).getByLabelText(pattern);

async function openGroup(user: User, name: RegExp) {
  if (group(name).getAttribute("aria-expanded") !== "true") await user.click(group(name));
}

async function loadExample(user: User) {
  const button = within(dock()).getByRole("button", { name: /Load example/ });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

/** Replace what is in a number field with a new value. */
async function retype(user: User, field: HTMLElement, value: string) {
  await user.clear(field);
  await user.type(field, value);
}

describe("the Bending tab", () => {
  it("comes after Compression, with a status icon, and is waiting at the start", () => {
    renderApp();
    const names = screen.getAllByRole("tab").map((el) => el.textContent ?? "");
    const index = (word: string) => names.findIndex((name) => name.includes(word));
    expect(index("Bending (B.6.3)")).toBe(index("Compression (B.6.2)") + 1);
    expect(tab(/Bending/)).toHaveTextContent("waiting for inputs");
  });

  it("waits for W_el, W_pl, λ_LT and the shared inputs, as links into the dock", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Bending/));
    const waiting = within(results()).getByRole("status");
    for (const word of [/fy/, /the section type/, /Ω/, /ν/, /γM0/, /Wel/, /Wpl/, /λLT/]) {
      expect(waiting).toHaveTextContent(word);
    }
    expect(waiting).not.toHaveTextContent(/the area A/); // B.19 and B.20 have no area
    await user.click(within(results()).getByRole("button", { name: "Wel" }));
    expect(group(/^Bending/)).toHaveAttribute("aria-expanded", "true");
    expect(label(/^Elastic modulus/)).toHaveFocus();
    expect(bendingCalls()).toEqual([]);
  });

  it("the Bending group starts empty and says what each field is", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Bending/));
    expect(within(dock()).getByText(/Choose the section type in the Section group first/)).toBeInTheDocument();
    expect(label(/^Elastic modulus/)).toHaveValue(null);
    expect(label(/^Plastic modulus/)).toHaveValue(null);
    expect(label(/^Relative slenderness/)).toHaveValue(null);
    expect(group(/^Bending/)).toHaveTextContent("3 to enter");
  });

  it("calculates from the example and sends the bending k_σ, not the compression ones", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await user.click(tab(/Bending/));
    expect(await within(results()).findByText(/Formula B\.20 applies/)).toBeInTheDocument();
    const body = bendingCalls().at(-1)?.body as unknown as Record<string, unknown>;
    expect(body).toMatchObject({
      section_type: "I-section",
      axis: "major",
      w_el: 194300,
      w_pl: 220600,
      gamma_m0: 1.1,
      lambda_lt: 0.15,
      omega: 15,
      poisson_ratio: 0.3,
    });
    expect(body.geometry).toMatchObject({ kind: "template", k_sigma: { web: 23.9, flange: 0.43 } });
    expect(body).not.toHaveProperty("area");
    expect(tab(/Bending/)).toHaveTextContent("done");
    // the compression tab keeps its own k_σ
    await user.click(tab(/Compression/));
    await waitFor(() => expect(compressionCalls().length).toBeGreaterThan(0));
    const compression = compressionCalls().at(-1)?.body as unknown as { geometry: { k_sigma: unknown } };
    expect(compression.geometry.k_sigma).toMatchObject({ web: 4, flange: 0.43 });
  });

  it("changing only the compression k_σ does not change the bending request, and the other way round", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Deformation capacity/);
    await retype(user, label(/^k_?σ, web/), "5");
    await openGroup(user, /^Bending/);
    expect(label(/^k_?σ in bending, web/)).toHaveValue(23.9);
    await retype(user, label(/^k_?σ in bending, web/), "20");
    await openGroup(user, /^Deformation capacity/);
    expect(label(/^k_?σ, web/)).toHaveValue(5);
    await user.click(tab(/Bending/));
    await waitFor(() => {
      const geometry = (bendingCalls().at(-1)?.body as unknown as { geometry: { k_sigma: { web: number } } }).geometry;
      expect(geometry.k_sigma.web).toBe(20);
    });
  });

  it("a circular hollow section is asked no axis and no k_σ", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Section/);
    await user.selectOptions(label(/^Section type/), "circular hollow section");
    await openGroup(user, /^Bending/);
    expect(within(dock()).queryByLabelText(/^Axis of bending/)).not.toBeInTheDocument();
    expect(within(dock()).getByText(/bends alike about every axis/)).toBeInTheDocument();
    expect(within(dock()).queryByLabelText(/^k_?σ in bending/)).not.toBeInTheDocument();
    expect(
      within(dock()).getByText((_, element) => element?.tagName === "P" && /needs no kσ here/.test(element.textContent ?? "")),
    ).toBeInTheDocument();
  });
});

describe("the λ_LT gate and the cases that arrive in a later phase", () => {
  it("λ_LT above 0.4 is a refusal: B.6.3.1 does not apply, use 8.2.4, tab not applicable", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Bending/);
    await retype(user, label(/^Relative slenderness/), "0.5");
    await user.click(tab(/Bending/));
    expect(await within(results()).findByRole("alert")).toHaveTextContent("B.6.3.1 does not apply; use 8.2.4");
    expect(results().querySelector(".metric")).not.toBeInTheDocument();
    await waitFor(() => expect(tab(/Bending/)).toHaveTextContent("not applicable"));
  });

  it("0.2 < λ_LT <= 0.4 says B.18 arrives in phase 3, which is not a refusal", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Bending/);
    await retype(user, label(/^Relative slenderness/), "0.3");
    await user.click(tab(/Bending/));
    const box = await within(results()).findByText(/B\.18 interpolation: arrives in phase 3/);
    expect(box.closest("[role=status]")).toBeInTheDocument();
    expect(within(results()).queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(tab(/Bending/)).toHaveTextContent("arrives in a later phase"));
    expect(tab(/Bending/)).not.toHaveTextContent("not applicable");
  });

  it("a channel about its minor axis says B.6.3.3 arrives in phase 3", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Section/);
    await user.selectOptions(label(/^Section type/), "channel");
    await openGroup(user, /^Bending/);
    await user.selectOptions(label(/^Axis of bending/), "minor");
    await user.click(tab(/Bending/));
    expect(await within(results()).findByText(/B\.6\.3\.3: arrives in phase 3/)).toBeInTheDocument();
    await waitFor(() => expect(tab(/Bending/)).toHaveTextContent("arrives in a later phase"));
  });
});

describe("Use buttons for W_el and W_pl, only on a click and only for the chosen axis", () => {
  async function openProperties(user: User) {
    await user.click(within(dock()).getByRole("button", { name: /Section geometry/ }));
    const modal = screen.getByRole("dialog", { name: "Section geometry" });
    await within(modal).findByText("Elastic section modulus");
    return modal;
  }

  it("with the major axis chosen, W_el,y and W_pl,y have Use buttons and the z-z rows do not", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Section/);
    const modal = await openProperties(user);
    const names = within(modal).getAllByRole("button", { name: /^Use / }).map((b) => b.getAttribute("aria-label"));
    expect(names).toContain("Use W_el,y in the W_el field");
    expect(names).toContain("Use W_pl,y in the W_pl field");
    expect(names).toContain("Use A in the Area A field");
    expect(names.some((name) => /W_(el|pl),z/.test(name ?? ""))).toBe(false);
  });

  it("Use copies the engine's value for the chosen axis into the field and says 'copied from geometry'", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Bending/);
    expect(label(/^Elastic modulus/)).toHaveValue(194300);
    expect(within(dock()).queryByText(/copied from geometry/)).not.toBeInTheDocument(); // nothing copied by itself
    await openGroup(user, /^Section/);
    const modal = await openProperties(user);
    await user.click(within(modal).getByRole("button", { name: "Use W_el,y in the W_el field" }));
    await user.click(within(modal).getByRole("button", { name: "Use W_pl,y in the W_pl field" }));
    await user.click(within(modal).getByRole("button", { name: /Close/ }));
    await openGroup(user, /^Bending/);
    expect(label(/^Elastic modulus/)).toHaveValue(194318); // the engine's value, six significant figures
    expect(label(/^Plastic modulus/)).toHaveValue(220640);
    expect(within(dock()).getAllByText("copied from geometry")).toHaveLength(2);
    // typing takes the label away
    await user.type(label(/^Elastic modulus/), "1");
    expect(within(dock()).getAllByText("copied from geometry")).toHaveLength(1);
  });

  it("the minor axis gets the z-z rows instead", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Bending/);
    await user.selectOptions(label(/^Axis of bending/), "minor");
    await openGroup(user, /^Section/);
    const modal = await openProperties(user);
    const names = within(modal).getAllByRole("button", { name: /^Use / }).map((b) => b.getAttribute("aria-label"));
    expect(names).toContain("Use W_el,z in the W_el field");
    expect(names).toContain("Use W_pl,z in the W_pl field");
    expect(names.some((name) => /W_(el|pl),y/.test(name ?? ""))).toBe(false);
    await user.click(within(modal).getByRole("button", { name: "Use W_pl,z in the W_pl field" }));
    await user.click(within(modal).getByRole("button", { name: /Close/ }));
    await openGroup(user, /^Bending/);
    expect(label(/^Plastic modulus/)).toHaveValue(44612.2);
  });

  it("a typed modulus that differs from the geometry value by more than 0.5 % gets a note, and keeps its value", async () => {
    const user = userEvent.setup();
    renderApp();
    await loadExample(user);
    await openGroup(user, /^Bending/);
    await user.clear(label(/^Elastic modulus/));
    await user.type(label(/^Elastic modulus/), "200000"); // +2.9 % against 194 318
    await openGroup(user, /^Section/);
    const modal = await openProperties(user);
    await user.click(within(modal).getByRole("button", { name: /Close/ }));
    await openGroup(user, /^Bending/);
    const note = await within(dock()).findByText(/The W_el you typed differs/);
    expect(note).toHaveTextContent("194 318 mm³");
    expect(note).toHaveTextContent("y-y");
    expect(note).toHaveTextContent("The calculation uses the value in this field");
    expect(label(/^Elastic modulus/)).toHaveValue(200000);
    // the example's 194 300 is within 0.5 %: no note under W_pl
    expect(within(dock()).queryByText(/The W_pl you typed differs/)).not.toBeInTheDocument();
  });
});

describe("the ? help on the new fields", () => {
  it("W_el says where to get it: the section table or the geometry window", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Bending/));
    // no section type yet, so the fields wait; the help of the always-shown fields is on screen only once a type is set
    await loadExample(user);
    await openGroup(user, /^Bending/);
    await user.click(await within(dock()).findByRole("button", { name: /^What is Elastic modulus W_el\?/ }));
    const panel = dock().querySelector('[data-field="wEl"] [data-help-panel]') as HTMLElement;
    expect(panel).toHaveTextContent(/section table/);
    expect(panel).toHaveTextContent(/Section geometry/);
    expect(panel).toHaveTextContent("Outside EN 1993-1-4: you provide it");
    await user.keyboard("{Escape}");
    await user.click(within(dock()).getByRole("button", { name: /^What is Relative slenderness λ_LT\?/ }));
    expect(dock().querySelector('[data-field="lambdaLT"] [data-help-panel]')).toHaveTextContent(/8\.3/);
    await user.keyboard("{Escape}");
    await user.click(within(dock()).getByRole("button", { name: /^What is Axis of bending\?/ }));
    expect(dock().querySelector('[data-field="axis"] [data-help-panel]')).toHaveTextContent("In EN 1993-1-4 (Table B.2)");
    await user.keyboard("{Escape}");
    await user.click(within(dock()).getByRole("button", { name: /^What is k_σ in bending, web/ }));
    expect(dock().querySelector('[data-field="kSigmaB-web"] [data-help-panel]')).toHaveTextContent(/6\.4\.1/);
  });
});
