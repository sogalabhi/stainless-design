import type { components } from "./schema";

type S = components["schemas"];

export type MaterialInput = S["MaterialInput"];
export type MaterialModelRequest = S["MaterialModelRequest"];
export type MaterialModelResponse = S["MaterialModelResponse"];
export type TensionRequest = S["TensionRequest"];
export type TensionResponse = S["TensionResponse"];
export type TensionInput = S["TensionInput"];
export type GradeOut = S["GradeOut"];
export type SymbolOut = S["SymbolOut"];
export type InputHelpOut = S["InputHelpOut"];
export type CoefficientsOut = S["CoefficientsOut"];
export type TraceStepOut = S["TraceStepOut"];
export type GraphView = S["GraphView"];
export type StainlessFamily = S["StainlessFamily"];
export type SectionType = S["SectionType"];

export type DeformationRequest = S["DeformationRequest"];
export type DeformationResponse = S["DeformationResponse"];
export type GeometryInput = S["GeometryInput"];
export type GeometryKindKey = S["GeometryKindKey"];
export type PlateInput = S["PlateInput"];
export type FamilyKey = S["FamilyKey"];
export type PlateOut = S["PlateOut"];

export type CompressionRequest = S["CompressionRequest"];
export type CompressionResponse = S["CompressionResponse"];

export type BendingRequest = S["BendingRequest"];
export type BendingResponse = S["BendingResponse"];
export type BendingParameterRowOut = S["BendingParameterRowOut"];
export type BendingAxisKey = S["BendingAxisKey"];

export type ComparisonRequest = S["ComparisonRequest"];
export type ComparisonResponse = S["ComparisonResponse"];
export type ComparisonPointOut = S["ComparisonPointOut"];
export type ReferenceSectionOut = S["ReferenceSectionOut"];

export type SectionPropertiesRequest = S["SectionPropertiesRequest"];
export type SectionPropertiesResponse = S["SectionPropertiesResponse"];
export type PropertyRowOut = S["PropertyRowOut"];
