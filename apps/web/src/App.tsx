import { Layers, MoveVertical, Ruler } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api/client";
import type { GraphView } from "./api/types";
import { Segmented } from "./components/ui";
import { useDarkMode, useDebounced } from "./lib/hooks";
import { defaultMaterialForm, materialInput } from "./lib/material";
import { defaultDeformationForm, deformationRequest } from "./lib/geometry";
import { DeformationPage } from "./pages/DeformationPage";
import { MaterialPage } from "./pages/MaterialPage";
import { TensionPage, defaultTensionForm, missingTension } from "./pages/TensionPage";

type Tab = "material" | "tension" | "deformation";

export function App() {
  const [tab, setTab] = useState<Tab>("material");
  const [view, setView] = useState<GraphView>("schematic");
  const [materialForm, setMaterialForm] = useState(defaultMaterialForm);
  const [tensionForm, setTensionForm] = useState(defaultTensionForm);
  const [deformationForm, setDeformationForm] = useState(defaultDeformationForm);
  const dark = useDarkMode();

  const grades = useQuery({ queryKey: ["grades"], queryFn: api.grades, staleTime: Infinity });

  const material = materialInput(useDebounced(materialForm, 250));
  const debouncedTension = useDebounced(tensionForm, 250);
  const debouncedDeformation = useDebounced(deformationForm, 250);

  const materialQuery = useQuery({
    queryKey: ["material", material, view],
    queryFn: ({ signal }) => api.materialModel({ material: material!, graph_view: view }, signal),
    enabled: material !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const materialReady = material !== null && !materialQuery.isError;

  const tensionQuery = useQuery({
    queryKey: ["tension", material, debouncedTension, view],
    queryFn: ({ signal }) =>
      api.tension(
        {
          material: material!,
          graph_view: view,
          tension: {
            area: debouncedTension.area!,
            section_type: debouncedTension.sectionType,
            has_holes: debouncedTension.hasHoles,
            gamma_m0: debouncedTension.gammaM0!,
          },
        },
        signal,
      ),
    enabled: material !== null && missingTension(debouncedTension).length === 0,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const deformationRequestBody =
    material === null ? null : deformationRequest(material, debouncedDeformation);
  const deformationQuery = useQuery({
    queryKey: ["deformation", deformationRequestBody],
    queryFn: ({ signal }) => api.deformationCapacity(deformationRequestBody!, signal),
    enabled: deformationRequestBody !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

  return (
    <div className="app">
      <header className="topbar">
        <h1>Stainless steel: Continuous Strength Method</h1>
        <p className="muted">EN 1993-1-4:2025, Annex B. Units: N, mm, N/mm² (forces shown in kN).</p>
        <div className="settings">
          <Segmented
            label="Graph view"
            value={view}
            options={[
              { value: "schematic", label: "Schematic" },
              { value: "true_scale", label: "True scale" },
            ]}
            onChange={setView}
          />
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Steps">
        <button role="tab" aria-selected={tab === "material"} onClick={() => setTab("material")}>
          <Layers size={16} aria-hidden="true" /> 1 · Material (B.4)
        </button>
        <button role="tab" aria-selected={tab === "tension"} onClick={() => setTab("tension")}>
          <MoveVertical size={16} aria-hidden="true" /> 2 · Tension (B.6.1)
        </button>
        <button role="tab" aria-selected={tab === "deformation"} onClick={() => setTab("deformation")}>
          <Ruler size={16} aria-hidden="true" /> 3 · Deformation capacity (B.5)
        </button>
      </nav>

      <main>
        {tab === "material" ? (
          <MaterialPage
            form={materialForm}
            onChange={setMaterialForm}
            grades={grades.data ?? []}
            query={materialQuery}
            dark={dark}
          />
        ) : tab === "deformation" ? (
          <DeformationPage
            form={deformationForm}
            onChange={setDeformationForm}
            query={deformationQuery}
            materialReady={materialReady}
            dark={dark}
          />
        ) : (
          <TensionPage
            form={tensionForm}
            onChange={setTensionForm}
            query={tensionQuery}
            materialReady={materialReady}
            dark={dark}
          />
        )}
      </main>
    </div>
  );
}
