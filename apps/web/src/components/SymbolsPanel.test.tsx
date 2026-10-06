import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installMockApi, requests } from "../test/mockApi";
import { SymbolsPanel } from "./SymbolsPanel";

function renderPanel(topic: "material" | "tension" | "deformation") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SymbolsPanel topic={topic} />
    </QueryClientProvider>,
  );
}

beforeEach(() => installMockApi());

describe("SymbolsPanel", () => {
  it("asks for the page's topic and lists each symbol with a one-line meaning, unit and clause", async () => {
    const user = userEvent.setup();
    renderPanel("tension");
    await user.click(screen.getByText("Symbols used on this page"));
    await waitFor(() => expect(screen.getByText("CSM tension resistance.")).toBeInTheDocument());
    expect(requests.some((r) => r.path.endsWith("/symbols?topic=tension"))).toBe(true);
    const row = screen.getByText("CSM tension resistance.").closest("tr") as HTMLElement;
    expect(within(row).getByText(/Formula B.12/)).toBeInTheDocument();
    const cells = within(row).getAllByRole("cell");
    expect(cells[2].textContent).toBe("N");
    expect(cells[3].textContent).toBe("B.6.1");
    expect(row.querySelector(".katex")).not.toBeNull();
  });

  it("groups the symbols and keeps other pages' symbols out", async () => {
    renderPanel("deformation");
    await waitFor(() => expect(screen.getByText("Slenderness and the base curve (B.5)")).toBeInTheDocument());
    expect(screen.getByText("Section dimensions")).toBeInTheDocument();
    expect(screen.queryByText("Tension (B.6.1)")).not.toBeInTheDocument();
  });
});
