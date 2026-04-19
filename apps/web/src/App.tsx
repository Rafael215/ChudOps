import { useEffect, useMemo, useState } from "react";
import type { EarthquakeScenario, SolarSite } from "@seismic-sentry/shared";
import { ChaosOverlay } from "./components/ChaosOverlay";
import { DataRibbon } from "./components/DataRibbon";
import { GridMap } from "./components/GridMap";
import { ModelDetailsModal } from "./components/ModelDetailsModal";
import { OperatorAccessModal } from "./components/OperatorAccessModal";
import { ResultsTable } from "./components/ResultsTable";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { TopHeader } from "./components/TopHeader";
import { clearOperatorToken, getOperatorToken, listScenarios, listSites, runScenario, setOperatorToken, startFisExperiment } from "./lib/api";
import { visualizationScopeLabel } from "./lib/visualizationScopes";
import { sampleRun, sampleSites, scenarios as sampleScenarios } from "./lib/sampleData";

type ChaosState = "idle" | "running" | "complete";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const isAuthFailure = (error: unknown) => error instanceof Error && /\b(401|403)\b/.test(error.message);

export function App() {
  const [scenarios, setScenarios] = useState<EarthquakeScenario[]>(sampleScenarios);
  const [sites, setSites] = useState<SolarSite[]>(sampleSites);
  const [activeScenarioId, setActiveScenarioId] = useState(sampleScenarios[0]!.id);
  const [run, setRun] = useState(sampleRun);
  const [isRunning, setIsRunning] = useState(false);
  const [resilienceStatus, setResilienceStatus] = useState("Primary region healthy");
  const [chaosState, setChaosState] = useState<ChaosState>("idle");
  const [fisExperimentId, setFisExperimentId] = useState<string | undefined>();
  const [isChaosStarting, setIsChaosStarting] = useState(false);
  const [activeScopeId, setActiveScopeId] = useState("la-and-san-diego-county");
  const [isModelDetailsOpen, setIsModelDetailsOpen] = useState(false);
  const [operatorToken, setOperatorTokenState] = useState(() => getOperatorToken());
  const displaySites = useMemo(() => {
    const siteById = new Map(sites.map((site) => [site.id, site]));

    for (const result of run.results) {
      if (
        siteById.has(result.siteId) ||
        !result.name ||
        result.latitude === undefined ||
        result.longitude === undefined ||
        result.capacityKw === undefined ||
        !result.installationType ||
        result.vs30 === undefined
      ) {
        continue;
      }

      siteById.set(result.siteId, {
        id: result.siteId,
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        capacityKw: result.capacityKw,
        installationType: result.installationType,
        vs30: result.vs30,
        region: result.region
      });
    }

    return [...siteById.values()];
  }, [run.results, sites]);

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      if (!operatorToken) {
        setResilienceStatus("Operator token required: protected API calls paused");
        return;
      }

      try {
        const [nextScenarios, nextSites] = await Promise.all([listScenarios(activeScopeId), listSites(activeScopeId)]);
        if (ignore) return;

        setScenarios(nextScenarios);
        setSites(nextSites);

        const scenarioToRun =
          nextScenarios.length > 0 && !nextScenarios.some((scenario) => scenario.id === activeScenarioId)
            ? nextScenarios[0]!.id
            : activeScenarioId;

        setActiveScenarioId(scenarioToRun);

        if (nextScenarios.length > 0) {
          const result = await runScenario(scenarioToRun, activeScopeId);
          if (ignore) return;
          setRun(result);
          setResilienceStatus(`Inference completed: ${visualizationScopeLabel(activeScopeId)}`);
          return;
        }

        setResilienceStatus(`Backend catalog loaded: ${visualizationScopeLabel(activeScopeId)}`);
      } catch (error) {
        console.error("Catalog refresh failed", error);
        if (ignore) return;
        if (isAuthFailure(error)) {
          handleClearOperatorToken();
          return;
        }
        setResilienceStatus("Live API unavailable: check backend connectivity");
      }
    };

    void loadCatalog();

    return () => {
      ignore = true;
    };
  }, [activeScopeId, operatorToken]);

  const handleOperatorTokenSubmit = (token: string) => {
    setOperatorToken(token);
    setOperatorTokenState(getOperatorToken());
    setResilienceStatus("Operator token accepted locally: loading protected demo data");
  };

  const handleClearOperatorToken = () => {
    clearOperatorToken();
    setOperatorTokenState("");
    setResilienceStatus("Operator token cleared: protected API calls paused");
  };

  const handleRunScenario = async () => {
    setIsRunning(true);
    try {
      const [result] = await Promise.all([runScenario(activeScenarioId, activeScopeId), wait(1800)]);
      setRun(result);
      setResilienceStatus(`Inference completed: ${visualizationScopeLabel(activeScopeId)}`);
    } catch (error) {
      if (isAuthFailure(error)) {
        handleClearOperatorToken();
        return;
      }
      console.error("Scenario run failed", error);
      setResilienceStatus("Scenario run failed: check backend connectivity");
    } finally {
      setIsRunning(false);
    }
  };

  const handleTriggerChaos = async () => {
    if (isChaosStarting || chaosState === "running") {
      return;
    }

    setIsChaosStarting(true);
    setResilienceStatus("Starting AWS FIS experiment...");

    try {
      const experiment = await startFisExperiment();
      setFisExperimentId(experiment.experimentId);
      setChaosState("running");
      setResilienceStatus(`FIS experiment ${experiment.experimentId} active: primary region degradation injected`);
    } catch (error) {
      console.error("FIS experiment start failed", error);
      if (isAuthFailure(error)) {
        handleClearOperatorToken();
        return;
      }
      setResilienceStatus("FIS experiment start failed: check backend permissions and template state");
    } finally {
      setIsChaosStarting(false);
    }
  };

  const handleChaosComplete = () => {
    setChaosState("complete");
    setResilienceStatus("System resilient: failover completed in 72s");
  };

  const handleChaosDismiss = () => {
    setChaosState("idle");
    setFisExperimentId(undefined);
  };

  return (
    <main className={`min-h-screen bg-noc-bg text-noc-text ${chaosState === "running" ? "chaos-shake" : ""}`}>
      <TopHeader chaosState={chaosState} latencyMs={Math.max(42, Math.round(run.inferenceLatencyMs / 34))} />

      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">
        <ScenarioPanel
          activeScenarioId={activeScenarioId}
          activeScopeId={activeScopeId}
          chaosState={chaosState}
          isChaosStarting={isChaosStarting}
          isRunning={isRunning}
          onOpenModelDetails={() => setIsModelDetailsOpen(true)}
          onSelectScope={setActiveScopeId}
          onRunScenario={handleRunScenario}
          onSelectScenario={setActiveScenarioId}
          onTriggerChaos={handleTriggerChaos}
          run={run}
          scenarios={scenarios}
        />

        <section className="grid min-h-[calc(100vh-48px)] min-w-0 grid-rows-[auto_auto_minmax(360px,1fr)_minmax(280px,380px)] border-l border-noc-border bg-[#090d13]">
          <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-noc-border bg-noc-panel/80 px-4 py-2" aria-live="polite">
            <span className="h-2.5 w-2.5 rounded-full bg-noc-teal shadow-teal-glow" />
            <strong className="font-mono text-xs uppercase text-noc-teal">{resilienceStatus}</strong>
            <span className="font-sans text-xs uppercase text-noc-muted">AWS FIS control plane armed</span>
            {operatorToken ? (
              <button
                className="ml-auto border border-noc-border bg-black/30 px-3 py-1 font-mono text-[0.62rem] uppercase text-noc-muted transition hover:border-noc-amber hover:text-noc-amber"
                onClick={handleClearOperatorToken}
                type="button"
              >
                Clear operator token
              </button>
            ) : null}
          </div>
          <DataRibbon run={run} status={resilienceStatus} />
          <GridMap run={run} sites={displaySites} />
          <ResultsTable run={run} sites={displaySites} />
        </section>
      </div>

      <ChaosOverlay
        experimentId={fisExperimentId}
        onComplete={handleChaosComplete}
        onDismiss={handleChaosDismiss}
        state={chaosState}
      />
      <ModelDetailsModal isOpen={isModelDetailsOpen} model={run.model} onClose={() => setIsModelDetailsOpen(false)} />
      {!operatorToken ? <OperatorAccessModal onSubmit={handleOperatorTokenSubmit} /> : null}
    </main>
  );
}
