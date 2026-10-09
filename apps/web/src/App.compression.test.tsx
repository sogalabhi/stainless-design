import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import deformationNotAllowed from "./test/fixtures/deformation_not_allowed.json";
import { installMockApi, requests } from "./test/mockApi";

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
const compressionCalls = () => requests.filter((r) => r.path.endsWith("/compression"));

/** Fill every dock field a stocky or a very thin plate section needs, then open the Compression tab. */
async function fillIn(user: ReturnType<typeof userEvent.setup>, plateWidth: number) {
  await within(dock()).findByRole("option", { name: /^1\.4307/ }); // the grades have loaded
  await user.selectOptions(within(dock()).getByLabelText("Grade (Table 5.1)"), "1.4307");
  await user.type(within(dock()).getByLabelText(/^E \[/), "200000");
  await user.click(group(/^Section/));
  await user.selectOptions(within(dock()).getByLabelText(/^Section type/), "I-section");
  await user.type(within(dock()).getByLabelText(/^Area A/), "1000");
  await user.type(within(dock()).getByLabelText(/^γM0/), "1.1");
  await user.click(group(/^Deformation capacity/));
  // this test is about the manual route; the section-template route has its own test file
  await user.selectOptions(within(dock()).getByLabelText(/^Slenderness from/), "plates");
  await user.type(within(dock()).getByLabelText(/^Flat width/), String(plateWidth));
  await user.type(within(dock()).getByLabelText(/^Thickness t/), "5");
  await user.type(within(dock()).getByLabelText(/^kσ/), "4");
  await user.type(within(dock()).getByLabelText(/^Poisson/), "0.3");
  await user.type(within(dock()).getByLabelText(/^Ω/), "15");
  await user.click(tab(/Compression/));
}

describe("the Compression tab", () => {
  it("comes after Tension, with a status icon, and is waiting at the start", () => {
    renderApp();
    const names = screen.getAllByRole("tab").map((el) => el.textContent ?? "");
    const index = (word: string) => names.findIndex((name) => name.includes(word));
    expect(index("Compression (B.6.2)")).toBe(index("Tension (B.6.1)") + 1);
    expect(tab(/Compression/)).toHaveTextContent("waiting for inputs");
  });

  it("waits for the material, the section type, the B.5 inputs, A and γM0, as links into the dock", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(tab(/Compression/));
    const results = screen.getByRole("region", { name: "Compression results" });
    const waiting = within(results).getByRole("status");
    for (const label of [/fy/, /the section type/, /Ω/, /ν/, /the area A/, /γM0/]) {
      expect(waiting).toHaveTextContent(label);
    }
    await user.click(within(results).getByRole("button", { name: "γM0" }));
    expect(group(/^Section/)).toHaveAttribute("aria-expanded", "true");
    expect(within(dock()).getByLabelText(/^γM0/)).toHaveFocus();
    expect(compressionCalls()).toEqual([]);
  });

  it("adds no field of its own: A and γM0 are the dock's, and their ? help says they are used in B.15 and B.16", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(group(/^Section/));
    for (const label of [/^Area A/, /^γM0/]) {
      const field = within(dock()).getByLabelText(label).closest(".field") as HTMLElement;
      expect(field).not.toHaveTextContent("Used in");
      await user.click(await within(field).findByRole("button", { name: /^What is / }));
      expect(field).toHaveTextContent("B.12, B.15 and B.16");
      await user.keyboard("{Escape}");
    }
    await user.click(tab(/Compression/));
    expect(within(screen.getByRole("main")).queryAllByRole("spinbutton")).toEqual([]);
  });

  it("calculates once everything is given, sends A and γM0 from the dock, and shows the result", async () => {
    const user = userEvent.setup();
    renderApp();
    await fillIn(user, 100);
    const results = screen.getByRole("region", { name: "Compression results" });
    expect(await within(results).findByText(/Formula B\.16 applies/)).toBeInTheDocument();
    expect(within(results).getByText("224.2")).toBeInTheDocument();
    const body = compressionCalls().at(-1)?.body as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ area: 1000, gamma_m0: 1.1, omega: 15, poisson_ratio: 0.3 });
    expect(body.geometry).toMatchObject({ kind: "plates" });
    expect(body).not.toHaveProperty("has_holes");
    expect(tab(/Compression/)).toHaveTextContent("done");
  });

  it("beyond the B.5 limit: not applicable, with the clause and the slenderness, and no resistance", async () => {
    const user = userEvent.setup();
    renderApp();
    const normal = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { geometry?: { plates?: { width?: number }[] } }) : null;
      if (String(input).endsWith("/deformation-capacity") && body?.geometry?.plates?.[0]?.width === 400) {
        return new Response(JSON.stringify(deformationNotAllowed), { status: 200 });
      }
      return normal(input, init);
    }) as typeof fetch;
    await fillIn(user, 400);
    const results = screen.getByRole("region", { name: "Compression results" });
    expect(await within(results).findByRole("alert")).toHaveTextContent(/B\.6\.2 does not apply.*beyond the B\.5 slenderness limit/);
    expect(results.querySelector(".metric")).not.toBeInTheDocument();
    expect(results).toHaveTextContent(/3\.3573 > 1\.6/);
    expect(tab(/Compression/)).toHaveTextContent("not applicable");
  });
});
