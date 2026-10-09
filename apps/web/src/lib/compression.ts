import type { CompressionRequest, DeformationRequest, GraphView } from "../api/types";
import { deformationRequest, missingDeformationItems, type DeformationFormState } from "./geometry";
import { uniqueItems, type MissingItem } from "./inputs";
import { missingTensionItems, type TensionFormState } from "./tension";

/**
 * B.6.2 has no inputs of its own. It reads the B.5 inputs (the section type and the geometry) and the
 * area A and γM0 that the Section group already holds, so nothing is entered twice.
 */
export function missingCompressionItems(
  deformation: DeformationFormState,
  section: TensionFormState,
): MissingItem[] {
  return uniqueItems([...missingDeformationItems(deformation), ...missingTensionItems(section)]);
}

/** The API request, or null while something is still missing. */
export function compressionRequest(
  material: DeformationRequest["material"],
  deformation: DeformationFormState,
  section: TensionFormState,
  view: GraphView,
): CompressionRequest | null {
  const geometry = deformationRequest(material, deformation);
  if (geometry === null || section.area === null || section.gammaM0 === null) return null;
  return { ...geometry, area: section.area, gamma_m0: section.gammaM0, graph_view: view };
}
