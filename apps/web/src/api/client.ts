import type {
  BendingRequest,
  BendingResponse,
  CoefficientsOut,
  CompressionRequest,
  CompressionResponse,
  ComparisonRequest,
  ComparisonResponse,
  DeformationRequest,
  DeformationResponse,
  GradeOut,
  InputHelpOut,
  SymbolOut,
  MaterialModelRequest,
  MaterialModelResponse,
  SectionPropertiesRequest,
  SectionPropertiesResponse,
  TensionRequest,
  TensionResponse,
} from "./types";

/** An error the API explained: a 422 with a plain message (domain error or bad input). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly errorType: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const where = (item.loc ?? []).filter((part) => part !== "body").join(" / ");
        return where ? `${where}: ${item.msg ?? "invalid"}` : (item.msg ?? "invalid");
      })
      .join("; ");
  }
  return "The request was not accepted.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("Cannot reach the calculation service. Is the API running?", "NetworkError");
  }
  if (!response.ok) {
    let detail: unknown = null;
    let errorType = "HttpError";
    try {
      const body = (await response.json()) as { detail?: unknown; error_type?: string };
      detail = body.detail;
      errorType = body.error_type ?? "ValidationError";
    } catch {
      // not JSON
    }
    throw new ApiError(
      detail ? describeDetail(detail) : `The service answered with status ${response.status}.`,
      errorType,
    );
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export const api = {
  grades: () => request<GradeOut[]>("/api/v1/grades"),
  coefficients: () => request<CoefficientsOut[]>("/api/v1/csm-coefficients"),
  symbols: (topic?: string) =>
    request<SymbolOut[]>(topic ? `/api/v1/symbols?topic=${topic}` : "/api/v1/symbols"),
  inputHelp: () => request<InputHelpOut[]>("/api/v1/input-help"),
  materialModel: (body: MaterialModelRequest, signal?: AbortSignal) =>
    post<MaterialModelResponse>("/api/v1/material-model", body, signal),
  tension: (body: TensionRequest, signal?: AbortSignal) =>
    post<TensionResponse>("/api/v1/tension", body, signal),
  deformationCapacity: (body: DeformationRequest, signal?: AbortSignal) =>
    post<DeformationResponse>("/api/v1/deformation-capacity", body, signal),
  compression: (body: CompressionRequest, signal?: AbortSignal) =>
    post<CompressionResponse>("/api/v1/compression", body, signal),
  bending: (body: BendingRequest, signal?: AbortSignal) =>
    post<BendingResponse>("/api/v1/bending", body, signal),
  sectionProperties: (body: SectionPropertiesRequest, signal?: AbortSignal) =>
    post<SectionPropertiesResponse>("/api/v1/section-properties", body, signal),
  sectionComparison: (body: ComparisonRequest, signal?: AbortSignal) =>
    post<ComparisonResponse>("/api/v1/section-comparison", body, signal),
};
