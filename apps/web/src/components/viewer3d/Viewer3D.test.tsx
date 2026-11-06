import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Viewer3D, { WEBGL_MISSING } from "./Viewer3D";

describe("the 3D viewer without WebGL", () => {
  it("says the view needs WebGL, and points to the numbers and graphs instead", async () => {
    // jsdom has no WebGL context, so the renderer cannot start
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(
      <Viewer3D
        dark={false}
        label="3D"
        items={[{ id: "a", title: "A", section: [{ outer: [[0, 0], [1, 0], [0, 1]] }], length: 2, tone: "stocky" }]}
      />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(WEBGL_MISSING);
    quiet.mockRestore();
    vi.unstubAllGlobals();
  });
});
