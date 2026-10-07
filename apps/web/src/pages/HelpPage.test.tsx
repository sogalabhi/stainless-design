import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import symbols from "../test/fixtures/symbols.json";
import { DIAGRAMS } from "../help/diagrams";
import { installMockApi } from "../test/mockApi";
import { HelpPage } from "./HelpPage";

function renderHelp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HelpPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => installMockApi());

async function openTopic(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name }));
  return user;
}

describe("Help page", () => {
  it("starts with the overview and its four steps", () => {
    renderHelp();
    expect(screen.getByRole("heading", { name: /Continuous Strength Method is/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The idea in four steps" })).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(2);
  });

  it("explains why this code and not IS 800, with a table and a check-your-copy note", async () => {
    renderHelp();
    await openTopic("Why not IS 800");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /IS 800/ })).toBeInTheDocument();
    expect(within(table).getByText("Strain hardening")).toBeInTheDocument();
    expect(screen.getByText(/Check clause numbers/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What this means in practice" })).toBeInTheDocument();
  });

  it("explains buckling, local buckling and plastic bending against IS 800", async () => {
    renderHelp();
    await openTopic("Buckling and bending");
    for (const name of ["Overall buckling", "Local buckling", "Plastic bending"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    const table = screen.getByRole("table");
    expect(within(table).getByText("Overall (member) buckling")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /IS 800/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Moment against rotation/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Overall buckling, local buckling and plastic bending/ })).toBeInTheDocument();
    expect(screen.getByText(/No IS 800 number is calculated/)).toBeInTheDocument();
  });

  it("describes all three modules", async () => {
    renderHelp();
    await openTopic("Modules");
    for (const name of [/1 · Material/, /2 · Tension/, /3 · Deformation capacity/]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("lists every symbol, filters by search and shows the detail and sketch when opened", async () => {
    renderHelp();
    const user = await openTopic("Symbols");
    expect(await screen.findByText(`${symbols.length} of ${symbols.length} symbols`)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search symbols"), "ductility cap");
    const shown = await screen.findByText(/^\d+ of \d+ symbols$/);
    expect(Number(shown.textContent?.split(" ")[0])).toBeLessThan(symbols.length);

    const card = screen.getByText("Ductility cap").closest("details")!;
    expect(card.querySelector("svg")).toBeNull();
    await user.click(within(card).getByText("Ductility cap"));
    expect(within(card).getByRole("img")).toBeInTheDocument();
    expect(within(card).getByText(/The largest strain the method lets you use/)).toBeInTheDocument();
  });

  it("has a sketch for every diagram name the glossary uses", () => {
    const names = new Set((symbols as { diagram: string | null }[]).map((entry) => entry.diagram));
    names.delete(null);
    for (const name of names) expect(DIAGRAMS).toHaveProperty(name as string);
  });
});
