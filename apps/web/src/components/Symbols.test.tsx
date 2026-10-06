import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sym } from "./Symbols";

describe("Sym", () => {
  it("renders subscripts", () => {
    const { container } = render(<Sym text="ε_csm,t / ε_y" />);
    expect(container.innerHTML).toBe("ε<sub>csm,t</sub> / ε<sub>y</sub>");
  });
  it("handles Greek letters and plain words around symbols", () => {
    const { container } = render(<Sym text="A·f_y / γ_M0, the usual resistance" />);
    expect(container.innerHTML).toBe("A·f<sub>y</sub> / γ<sub>M0</sub>, the usual resistance");
  });
  it("leaves plain text alone", () => {
    const { container } = render(<Sym text="Area 0.58" />);
    expect(container.innerHTML).toBe("Area 0.58");
  });
});
