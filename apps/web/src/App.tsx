import { BookOpen, Box, ChevronsDownUp, Layers, MoveVertical, Presentation, Ruler, SlidersHorizontal, Spline } from "lucide-react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type ApiError } from "./api/client";
import type { BendingAxisKey, GraphView, SectionType } from "./api/types";
import { AreaNote, ModulusNote } from "./components/AreaNote";
import { Dock, type FocusRequest } from "./components/Dock";
import { InputHelpProvider } from "./components/FieldHelp";
import { ChartLinkProvider } from "./lib/chartLinks";
import { GeometryModal } from "./components/GeometryModal";
import { StatusIcon } from "./components/Waiting";
import { Segmented } from "./components/ui";
import { useDarkMode, useDebounced } from "./lib/hooks";
import { defaultMaterialForm, materialInput, missingMaterialItems } from "./lib/material";
import { exampleState } from "./lib/example";
import {
  bendingRequest,
  defaultBendingForm,
  missingBendingItems,
  withBendingStress,
  type BendingFormState,
} from "./lib/bending";
import { comparisonRequest } from "./lib/comparison";
import { compressionRequest, missingCompressionItems } from "./lib/compression";
import {
  CIRCULAR,
  defaultDeformationForm,
  deformationRequest,
  missingDeformationItems,
  missingPropertyItems,
  propertiesRequest,
  usesDimensions,
  withSectionType,
} from "./lib/geometry";
import {
  uniqueItems,
  type GroupKey,
  type MissingItem,
  type ScopeCheck,
  type TabStatus,
} from "./lib/inputs";
import type { PlateRoleKey } from "./lib/sectionTemplates";
import { bendingView, compressionView, defaultCase, tensionView, type StageCase } from "./lib/stage";
import { defaultTensionForm, missingTensionItems } from "./lib/tension";
import { BendingPage, NOT_APPLICABLE_ERROR, NOT_BUILT_YET_ERROR } from "./pages/BendingPage";
import { CompressionPage } from "./pages/CompressionPage";
import { DeformationPage } from "./pages/DeformationPage";
import { HelpPage } from "./pages/HelpPage";
import { MaterialPage } from "./pages/MaterialPage";
import { StagePage, caseNotice, type StageCaseInput } from "./pages/StagePage";
import { VisualisePage } from "./pages/VisualisePage";
import { TensionPage } from "./pages/TensionPage";

type Tab = "stage" | "material" | "deformation" | "tension" | "compression" | "bending" | "explore" | "help";

/** One word for what a tab holds: waiting for inputs, done, not applicable, or something wrong. */
function statusOf(
  waiting: MissingItem[],
  query: UseQueryResult<unknown, unknown>,
  notApplicable = false,
): TabStatus {
  if (waiting.length > 0) return "waiting";
  if (notApplicable) return "not_applicable";
  if (query.isError) return "error";
  return query.data ? "done" : "waiting";
}

export function App() {
  const [tab, setTab] = useState<Tab>("stage");
  // the load case on the stage; null until the user picks one (then the first case that is done)
  const [stageChoice, setStageChoice] = useState<StageCase | null>(null);
  const [view, setView] = useState<GraphView>("schematic");
  const [materialForm, setMaterialForm] = useState(defaultMaterialForm);
  const [sectionType, setSectionType] = useState<SectionType | null>(null);
  const [tensionForm, setTensionForm] = useState(defaultTensionForm);
  const [deformationForm, setDeformationForm] = useState(defaultDeformationForm);
  const [bendingForm, setBendingForm] = useState(defaultBendingForm);
  const [openGroup, setOpenGroup] = useState<GroupKey | null>("material");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [geometryOpen, setGeometryOpen] = useState(false);
  // the area that the Use button last copied into the A field (null once the field is edited)
  const [areaFromGeometry, setAreaFromGeometry] = useState<number | null>(null);
  // the same for W_el and W_pl in the Bending group (null once the field is edited)
  const [moduliFromGeometry, setModuliFromGeometry] = useState<{ wEl: number | null; wPl: number | null }>({
    wEl: null,
    wPl: null,
  });
  const dark = useDarkMode();

  // One section-type picker: it also chooses the B.5 route (tube or plates).
  const chooseSectionType = (type: SectionType) => {
    setSectionType(type);
    setDeformationForm((form) => withSectionType(form, type));
  };
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const grades = useQuery({ queryKey: ["grades"], queryFn: api.grades, staleTime: Infinity });

  // "Load example" replaces every input; "Clear all" returns to the empty start. Nothing else fills a field.
  const loadExample = () => {
    if (!grades.data?.length) return;
    const example = exampleState(grades.data);
    setMaterialForm(example.materialForm);
    setSectionType(example.sectionType);
    setTensionForm(example.tensionForm);
    setDeformationForm(example.deformationForm);
    setBendingForm(example.bendingForm);
    setAreaFromGeometry(null);
    setModuliFromGeometry({ wEl: null, wPl: null });
    setExampleLoaded(true);
  };
  const clearAll = () => {
    setMaterialForm(defaultMaterialForm);
    setSectionType(null);
    setTensionForm(defaultTensionForm);
    setDeformationForm(defaultDeformationForm);
    setBendingForm(defaultBendingForm);
    setAreaFromGeometry(null);
    setModuliFromGeometry({ wEl: null, wPl: null });
    setGeometryOpen(false);
    setExampleLoaded(false);
  };
  // Typing in the A field ends "copied from geometry"; only the Use button sets it.
  const changeTension = (form: typeof tensionForm) => {
    if (form.area !== tensionForm.area) setAreaFromGeometry(null);
    setTensionForm(form);
  };
  // Typing in W_el or W_pl ends "copied from geometry" too.
  const changeBending = (form: BendingFormState) => {
    setModuliFromGeometry((copied) => ({
      wEl: form.wEl === bendingForm.wEl ? copied.wEl : null,
      wPl: form.wPl === bendingForm.wPl ? copied.wPl : null,
    }));
    setBendingForm(form);
  };
  const useProperty = (key: string, value: number) => {
    if (key === "A") {
      setTensionForm((form) => ({ ...form, area: value }));
      setAreaFromGeometry(value);
    } else if (key.startsWith("W_el_")) {
      setBendingForm((form) => ({ ...form, wEl: value }));
      setModuliFromGeometry((copied) => ({ ...copied, wEl: value }));
    } else if (key.startsWith("W_pl_")) {
      setBendingForm((form) => ({ ...form, wPl: value }));
      setModuliFromGeometry((copied) => ({ ...copied, wPl: value }));
    }
  };
  const goTo = (item: MissingItem) => {
    setOpenGroup(item.group);
    setDrawerOpen(true);
    setFocusRequest((previous) => ({ field: item.field, nonce: (previous?.nonce ?? 0) + 1 }));
  };

  const material = materialInput(useDebounced(materialForm, 250));
  const debouncedTension = useDebounced(tensionForm, 250);
  const debouncedDeformation = useDebounced(deformationForm, 250);
  const debouncedBending = useDebounced(bendingForm, 250);

  const materialQuery = useQuery({
    queryKey: ["material", material, view],
    queryFn: ({ signal }) => api.materialModel({ material: material!, graph_view: view }, signal),
    enabled: material !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const tensionQuery = useQuery({
    queryKey: ["tension", material, debouncedTension, sectionType, view],
    queryFn: ({ signal }) =>
      api.tension(
        {
          material: material!,
          graph_view: view,
          tension: {
            area: debouncedTension.area!,
            section_type: sectionType,
            has_holes: debouncedTension.hasHoles,
            gamma_m0: debouncedTension.gammaM0!,
          },
        },
        signal,
      ),
    enabled: material !== null && missingTensionItems(debouncedTension).length === 0,
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

  // The engine's flat widths c for the sketch: only from a B.5 response that was asked for exactly the
  // dimensions now typed (the browser never computes c).
  const currentDeformationBody =
    material === null ? null : deformationRequest(material, deformationForm);
  const engineC: Partial<Record<PlateRoleKey, number>> | null =
    deformationForm.kind === "template" &&
    deformationQuery.data &&
    !deformationQuery.isPlaceholderData &&
    currentDeformationBody !== null &&
    JSON.stringify(currentDeformationBody) === JSON.stringify(deformationRequestBody)
      ? Object.fromEntries(
          deformationQuery.data.slenderness.plates.flatMap((plate) =>
            plate.role ? [[plate.role, plate.width]] : [],
          ),
        )
      : null;

  // The section properties (reference values from the dimensions). Their own query: nothing waits for it.
  const propertiesBody = propertiesRequest(debouncedDeformation);
  const propertiesQuery = useQuery({
    queryKey: ["section-properties", propertiesBody],
    queryFn: ({ signal }) => api.sectionProperties(propertiesBody!, signal),
    enabled: propertiesBody !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  // Drawn and compared only when asked for exactly the dimensions now typed.
  const propertiesFresh =
    propertiesQuery.data !== undefined &&
    !propertiesQuery.isPlaceholderData &&
    JSON.stringify(propertiesRequest(deformationForm)) === JSON.stringify(propertiesBody);
  const properties = propertiesFresh ? (propertiesQuery.data ?? null) : null;
  const propertiesMissing = missingPropertyItems(deformationForm);

  const materialMissing = missingMaterialItems(materialForm);
  const tensionMissing = missingTensionItems(tensionForm);
  const deformationMissing = missingDeformationItems(deformationForm);
  const bendingMissing = missingBendingItems(sectionType, deformationForm, bendingForm, tensionForm);
  const allMissing = uniqueItems([
    ...materialMissing,
    ...tensionMissing,
    ...deformationMissing,
    ...bendingMissing,
  ]);
  const materialProblem = materialMissing.length === 0 && materialQuery.isError;
  const typedStress = deformationForm.kind === "sigma_cr";

  const tensionWaiting = uniqueItems([...materialMissing, ...tensionMissing]);
  const deformationWaiting = uniqueItems([...materialMissing, ...deformationMissing]);
  const exploreWaiting = typedStress ? [] : deformationWaiting;

  // B.2 for tension, read from the engine's B.5 result for the same section.
  const deformation = deformationQuery.data;
  const scope: ScopeCheck =
    deformationMissing.length > 0
      ? { state: "waiting", items: deformationMissing }
      : deformationQuery.isError
        ? { state: "unchecked", reason: deformationQuery.error.message }
        : deformation
          ? {
              state: deformation.strain_limit.allowed ? "within" : "beyond",
              slenderness: deformation.slenderness.value,
              upper: deformation.strain_limit.upper,
              symbol: deformation.family === "circular_hollow" ? "λ_c,cs" : "λ_p,cs",
            }
          : { state: "unchecked", reason: "B.5 is still calculating." };

  // B.6.2 has no inputs of its own: the B.5 inputs plus A and γM0 from the Section group. It asks the
  // engine only when the section is within the B.5 limit, since beyond it there is no ε_csm.
  const compressionMissing = missingCompressionItems(deformationForm, tensionForm);
  const compressionWaiting = uniqueItems([...materialMissing, ...compressionMissing]);
  const compressionRequestBody =
    material === null
      ? null
      : compressionRequest(material, debouncedDeformation, debouncedTension, view);
  const compressionQuery = useQuery({
    queryKey: ["compression", compressionRequestBody],
    queryFn: ({ signal }) => api.compression(compressionRequestBody!, signal),
    enabled: compressionRequestBody !== null && scope.state !== "beyond",
    placeholderData: keepPreviousData,
    retry: false,
  });

  // B.6.3.2 in bending: the B.5 inputs of the section with the *bending* k_σ, the Bending group, γM0. The
  // engine answers the λ_LT gate and the not-built-yet cases itself, so every error is shown as it comes.
  const bendingWaiting = uniqueItems([...materialMissing, ...bendingMissing]);
  const bendingRequestBody =
    material === null
      ? null
      : bendingRequest(material, sectionType, debouncedDeformation, debouncedBending, debouncedTension);
  const bendingQuery = useQuery({
    queryKey: ["bending", bendingRequestBody],
    queryFn: ({ signal }) => api.bending(bendingRequestBody!, signal),
    enabled: bendingRequestBody !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const bendingStatus: TabStatus =
    bendingWaiting.length > 0
      ? "waiting"
      : bendingQuery.isError
        ? bendingQuery.error.errorType === NOT_APPLICABLE_ERROR
          ? "not_applicable"
          : bendingQuery.error.errorType === NOT_BUILT_YET_ERROR
            ? "later"
            : "error"
        : bendingQuery.data
          ? "done"
          : "waiting";

  // The three load cases of the Section Stage: the clause tabs' own statuses.
  const loadStatus: Record<StageCase, TabStatus> = {
    tension: statusOf(
      tensionWaiting,
      tensionQuery,
      tensionForm.hasHoles || scope.state === "beyond",
    ),
    compression: statusOf(compressionWaiting, compressionQuery, scope.state === "beyond"),
    bending: bendingStatus,
  };
  const stageCase = stageChoice ?? defaultCase(loadStatus);

  // The section sweep of Explore (thicker and thinner), also asked for while the Stage shows compression:
  // its thickness what-if reads the engine's points.
  const comparisonRequestBody =
    material === null ? null : comparisonRequest(material, debouncedDeformation);
  const comparisonQuery = useQuery({
    queryKey: ["comparison", comparisonRequestBody],
    queryFn: ({ signal }) => api.sectionComparison(comparisonRequestBody!, signal),
    enabled:
      comparisonRequestBody !== null &&
      (tab === "explore" || (tab === "stage" && stageCase === "compression")),
    placeholderData: keepPreviousData,
    retry: false,
  });

  // The B.5 base curve of the section in bending (its own k_σ), asked for only while the Stage shows bending.
  const bendingDeformationBody =
    material === null
      ? null
      : deformationRequest(material, withBendingStress(debouncedDeformation, debouncedBending));
  const bendingDeformationQuery = useQuery({
    queryKey: ["deformation", bendingDeformationBody],
    queryFn: ({ signal }) => api.deformationCapacity(bendingDeformationBody!, signal),
    enabled: bendingDeformationBody !== null && tab === "stage" && stageCase === "bending",
    placeholderData: keepPreviousData,
    retry: false,
  });

  const tensionStage = useMemo(
    () => (tensionQuery.data ? tensionView(tensionQuery.data) : null),
    [tensionQuery.data],
  );
  const compressionStage = useMemo(
    () => (compressionQuery.data ? compressionView(compressionQuery.data) : null),
    [compressionQuery.data],
  );
  const bendingStage = useMemo(
    () => (bendingQuery.data ? bendingView(bendingQuery.data) : null),
    [bendingQuery.data],
  );
  // What each load case hands the Section Stage: its status, the engine's answer arranged for the screen,
  // and the message when the engine refused. A drawing and its engine numbers go together only while the
  // dimensions typed are those the answer was asked for.
  const dimsFresh =
    currentDeformationBody !== null &&
    JSON.stringify(currentDeformationBody) === JSON.stringify(deformationRequestBody);
  const stageInput = (
    key: StageCase,
    waiting: MissingItem[],
    query: UseQueryResult<unknown, ApiError>,
    view: StageCaseInput["view"],
    baseFigure: StageCaseInput["baseFigure"],
  ): StageCaseInput => ({
    status: loadStatus[key],
    waiting,
    view: waiting.length === 0 && !materialProblem && !query.isError ? view : null,
    notice: caseNotice(key, query, scope.state === "beyond" && key !== "bending" ? scope : { state: "unchecked", reason: "" }),
    calculating: query.isFetching,
    fresh: dimsFresh && !query.isPlaceholderData,
    baseFigure,
  });
  const stageCases: Record<StageCase, StageCaseInput> = {
    tension: stageInput("tension", tensionWaiting, tensionQuery, tensionStage, null),
    compression: stageInput(
      "compression",
      compressionWaiting,
      compressionQuery,
      scope.state === "beyond" ? null : compressionStage,
      deformationQuery.data?.figure ?? null,
    ),
    bending: stageInput(
      "bending",
      bendingWaiting,
      bendingQuery,
      bendingStage,
      bendingDeformationQuery.data?.figure ?? null,
    ),
  };

  // The modulus rows that get a Use button, and the engine's value to compare a typed one with.
  const modulusAxis: BendingAxisKey | null = sectionType === CIRCULAR ? "major" : bendingForm.axis;
  const geometryModulus = (which: "el" | "pl"): number | null => {
    if (!properties || modulusAxis === null) return null;
    const major = modulusAxis === "major";
    return which === "el"
      ? (major ? properties.w_el_y : properties.w_el_z).value
      : major
        ? properties.w_pl_y
        : properties.w_pl_z;
  };
  const axisLabel = modulusAxis === null ? null : modulusAxis === "major" ? "y-y" : "z-z";

  // Explore only asks the engine while it is open (a full thickness sweep), so with every input
  // given and nothing fetched yet it is ready, not waiting.
  const exploreReady =
    exploreWaiting.length === 0 && !typedStress && !materialProblem && tab !== "explore";

  const status: Record<Exclude<Tab, "help">, TabStatus> = {
    material: statusOf(materialMissing, materialQuery),
    deformation: statusOf(
      deformationWaiting,
      deformationQuery,
      deformationQuery.data?.strain_limit.allowed === false,
    ),
    // Holes: B.6.1(2) sends the section to EN 1993-1-3 or EN 1993-1-1, outside Annex B.
    tension: loadStatus.tension,
    compression: loadStatus.compression,
    bending: loadStatus.bending,
    stage: loadStatus[stageCase],
    explore: exploreReady && !comparisonQuery.data ? "done" : statusOf(exploreWaiting, comparisonQuery, typedStress),
  };
  const tabs: { key: Exclude<Tab, "help">; label: string; icon: typeof Layers }[] = [
    { key: "stage", label: "Stage", icon: Presentation },
    { key: "material", label: "Material (B.4)", icon: Layers },
    { key: "deformation", label: "Deformation (B.5)", icon: Ruler },
    { key: "tension", label: "Tension (B.6.1)", icon: MoveVertical },
    { key: "compression", label: "Compression (B.6.2)", icon: ChevronsDownUp },
    { key: "bending", label: "Bending (B.6.3)", icon: Spline },
    { key: "explore", label: "Explore", icon: Box },
  ];

  return (
    <InputHelpProvider>
      <ChartLinkProvider>
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
            {tab !== "help" ? (
              <button
                type="button"
                className="icon-button inputs-button"
                aria-controls="input-dock"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" /> Inputs
                {allMissing.length > 0 ? ` (${allMissing.length} to enter)` : ""}
              </button>
            ) : null}
          </div>
        </header>

        <nav className="tabs" role="tablist" aria-label="Results">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
              <Icon size={16} aria-hidden="true" /> {label}
              <StatusIcon status={status[key]} />
            </button>
          ))}
          <button role="tab" aria-selected={tab === "help"} onClick={() => setTab("help")}>
            <BookOpen size={16} aria-hidden="true" /> Help
          </button>
        </nav>

        <div className={`layout${tab === "help" ? " no-dock" : ""}`}>
          {tab !== "help" ? (
            <Dock
              materialForm={materialForm}
              onMaterialChange={setMaterialForm}
              grades={grades.data ?? []}
              sectionType={sectionType}
              onSectionType={chooseSectionType}
              tensionForm={tensionForm}
              onTensionChange={changeTension}
              deformationForm={deformationForm}
              onDeformationChange={setDeformationForm}
              bendingForm={bendingForm}
              onBendingChange={changeBending}
              wElNote={
                <ModulusNote
                  name="W_el"
                  typed={bendingForm.wEl}
                  copiedValue={moduliFromGeometry.wEl}
                  geometryValue={geometryModulus("el")}
                  axisLabel={axisLabel}
                />
              }
              wPlNote={
                <ModulusNote
                  name="W_pl"
                  typed={bendingForm.wPl}
                  copiedValue={moduliFromGeometry.wPl}
                  geometryValue={geometryModulus("pl")}
                  axisLabel={axisLabel}
                />
              }
              onOpenGeometry={() => setGeometryOpen(true)}
              areaNote={
                <AreaNote
                  typed={tensionForm.area}
                  copiedValue={areaFromGeometry}
                  geometryArea={properties?.area ?? null}
                />
              }
              missing={allMissing}
              openGroup={openGroup}
              onOpenGroup={setOpenGroup}
              focusRequest={focusRequest}
              drawerOpen={drawerOpen}
              onCloseDrawer={() => setDrawerOpen(false)}
              exampleLoaded={exampleLoaded}
              canLoadExample={Boolean(grades.data?.length)}
              onLoadExample={loadExample}
              onClearAll={clearAll}
            />
          ) : null}
          <main>
            {tab === "help" ? (
              <HelpPage />
            ) : tab === "stage" ? (
              <StagePage
                cases={stageCases}
                selected={stageCase}
                onSelect={setStageChoice}
                materialProblem={materialProblem}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                form={deformationForm}
                axis={bendingForm.axis}
                direction={bendingForm.direction}
                values={materialQuery.data?.values ?? null}
                sweep={comparisonQuery}
                dark={dark}
              />
            ) : tab === "material" ? (
              <MaterialPage missing={materialMissing} onGo={goTo} query={materialQuery} dark={dark} />
            ) : tab === "deformation" ? (
              <DeformationPage
                waiting={deformationWaiting}
                materialProblem={materialProblem}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                query={deformationQuery}
                dark={dark}
              />
            ) : tab === "compression" ? (
              <CompressionPage
                waiting={compressionWaiting}
                materialProblem={materialProblem}
                scope={scope}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                query={compressionQuery}
                dark={dark}
              />
            ) : tab === "bending" ? (
              <BendingPage
                waiting={bendingWaiting}
                materialProblem={materialProblem}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                query={bendingQuery}
                dark={dark}
              />
            ) : tab === "explore" ? (
              <VisualisePage
                waiting={exploreWaiting}
                materialProblem={materialProblem}
                typedStress={typedStress}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                form={deformationForm}
                query={comparisonQuery}
                dark={dark}
              />
            ) : (
              <TensionPage
                waiting={tensionWaiting}
                materialProblem={materialProblem}
                scope={scope}
                onGo={goTo}
                onOpenMaterial={() => setTab("material")}
                query={tensionQuery}
                dark={dark}
              />
            )}
          </main>
        </div>
        {geometryOpen && sectionType !== null && usesDimensions(deformationForm) ? (
          <GeometryModal
            sectionType={sectionType}
            form={deformationForm}
            onFormChange={setDeformationForm}
            cValues={engineC}
            query={propertiesQuery}
            properties={properties}
            stale={!propertiesFresh}
            missing={propertiesMissing}
            currentValues={{ area: tensionForm.area, wEl: bendingForm.wEl, wPl: bendingForm.wPl }}
            bendingAxis={modulusAxis}
            onUse={useProperty}
            onClose={() => setGeometryOpen(false)}
          />
        ) : null}
      </div>
      </ChartLinkProvider>
    </InputHelpProvider>
  );
}
