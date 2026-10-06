import deformation from "./fixtures/deformation.json";
import deformationNotAllowed from "./fixtures/deformation_not_allowed.json";
import grades from "./fixtures/grades.json";
import material from "./fixtures/material.json";
import symbols from "./fixtures/symbols.json";
import tensionHolesError from "./fixtures/tension_holes_error.json";
import tension from "./fixtures/tension.json";

type Body = {
  tension?: { has_holes?: boolean; gamma_m0?: number };
  geometry?: { kind?: string; b?: number };
  omega?: number;
};

export const requests: { path: string; body: Body | null }[] = [];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stands in for the API with responses recorded from the real one. */
export function installMockApi() {
  requests.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Body) : null;
    requests.push({ path, body });
    if (path.endsWith("/grades")) return json(grades);
    if (path.endsWith("/material-model")) return json(material);
    if (path.includes("/symbols")) {
      const topic = new URL(path, "http://x").searchParams.get("topic");
      return json((symbols as { topics: string[] }[]).filter((s) => !topic || s.topics.includes(topic)));
    }
    if (path.endsWith("/deformation-capacity")) {
      return json(body?.geometry?.kind === "rhs" ? deformationNotAllowed : deformation);
    }
    if (path.endsWith("/tension")) {
      if (body?.tension?.has_holes) return json(tensionHolesError, 422);
      return json(tension);
    }
    return json({ detail: "not found" }, 404);
  }) as typeof fetch;
}
