import bendingB19 from "./fixtures/bending_b19.json";
import bendingB20 from "./fixtures/bending_b20.json";
import bendingB18Error from "./fixtures/bending_b18_error.json";
import bendingBeyondError from "./fixtures/bending_beyond_error.json";
import bendingGateError from "./fixtures/bending_gate_error.json";
import bendingNotBuiltError from "./fixtures/bending_not_built_error.json";
import bendingTemplate from "./fixtures/bending_template.json";
import compressionB15 from "./fixtures/compression_b15.json";
import compressionBeyond from "./fixtures/compression_beyond_error.json";
import compression from "./fixtures/compression.json";
import compressionTemplate from "./fixtures/compression_template.json";
import comparison from "./fixtures/comparison.json";
import comparisonTemplate from "./fixtures/comparison_template.json";
import deformationTemplate from "./fixtures/deformation_template.json";
import deformationTemplateError from "./fixtures/deformation_template_error.json";
import deformation from "./fixtures/deformation.json";
import deformationNotAllowed from "./fixtures/deformation_not_allowed.json";
import grades from "./fixtures/grades.json";
import inputHelp from "./fixtures/input_help.json";
import material from "./fixtures/material.json";
import propertiesAngle from "./fixtures/section_properties_angle.json";
import propertiesError from "./fixtures/section_properties_error.json";
import properties from "./fixtures/section_properties.json";
import symbols from "./fixtures/symbols.json";
import tensionHolesError from "./fixtures/tension_holes_error.json";
import tension from "./fixtures/tension.json";

type Body = {
  shape?: string;
  section_type?: string;
  lambda_lt?: number;
  t_f?: number;
  tension?: { has_holes?: boolean; gamma_m0?: number };
  geometry?: { kind?: string; b?: number; t_f?: number; plates?: { width?: number }[] };
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
    if (path.endsWith("/input-help")) return json(inputHelp);
    if (path.endsWith("/material-model")) return json(material);
    if (path.includes("/symbols")) {
      const topic = new URL(path, "http://x").searchParams.get("topic");
      return json((symbols as { topics: string[] }[]).filter((s) => !topic || s.topics.includes(topic)));
    }
    // recorded section properties: a rolled I-section, or an angle; a 100 mm flange cannot exist
    if (path.endsWith("/section-properties")) {
      if (body?.t_f === 100) return json(propertiesError, 422);
      return json(body?.shape === "angle" ? propertiesAngle : properties);
    }
    const template = body?.geometry?.kind === "template";
    if (path.endsWith("/deformation-capacity")) {
      // recorded section template: a rolled I-section; a 100 mm flange cannot exist, so it is the 422
      if (template) {
        return body?.geometry?.t_f === 100 ? json(deformationTemplateError, 422) : json(deformationTemplate);
      }
      return json(body?.geometry?.kind === "rhs" ? deformationNotAllowed : deformation);
    }
    if (path.endsWith("/tension")) {
      if (body?.tension?.has_holes) return json(tensionHolesError, 422);
      return json(tension);
    }
    if (path.endsWith("/section-comparison")) return json(template ? comparisonTemplate : comparison);
    if (path.endsWith("/bending")) {
      // recorded bending: λ_LT 0.5 is refused, 0.3 is the B.18 range, a channel minor axis is B.6.3.3,
      // a plate 400 wide is beyond the B.5 limit, 250 wide gives B.19, 100 wide gives B.20
      if ((body?.lambda_lt ?? 0) > 0.4) return json(bendingGateError, 422);
      if ((body?.lambda_lt ?? 0) > 0.2) return json(bendingB18Error, 422);
      if (body?.section_type === "channel") return json(bendingNotBuiltError, 422);
      if (template) return json(bendingTemplate);
      const width = body?.geometry?.plates?.[0]?.width;
      if (width === 400) return json(bendingBeyondError, 422);
      return json(width === 250 ? bendingB19 : bendingB20);
    }
    if (path.endsWith("/compression")) {
      if (template) return json(compressionTemplate);
      // recorded plates: 100 wide gives B.16, 250 wide gives B.15, 400 wide is beyond the limit
      const width = body?.geometry?.plates?.[0]?.width;
      if (width === 400) return json(compressionBeyond, 422);
      return json(width === 250 ? compressionB15 : compression);
    }
    return json({ detail: "not found" }, 404);
  }) as typeof fetch;
}
