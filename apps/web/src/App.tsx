import { useEffect, useState } from "react";
import type { EarthquakeScenario, SolarSite } from "@seismic-sentry/shared";
import { ChaosOverlay } from "./components/ChaosOverlay";
import { DataRibbon } from "./components/DataRibbon";
import { GridMap } from "./components/GridMap";
import { ResultsTable } from "./components/ResultsTable";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { TopHeader } from "./components/TopHeader";
import { listScenarios, listSites, runScenario } from "./lib/api";
import { sampleRun, sampleSites, scenarios as sampleScenarios } from "./lib/sampleData";

type ChaosState = "idle" | "running" | "complete";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function App() {
  const [scenarios, setScenarios] = useState<EarthquakeScenario[]>(sampleScenarios);
  const [sites, setSites] = useState<SolarSite[]>(sampleSites);
  const [activeScenarioId, setActiveScenarioId] = useState(sampleScenarios[0]!.id);
  const [run, setRun] = useState(sampleRun);
  const [isRunning, setIsRunning] = useState(false);
  const [resilienceStatus, setResilienceStatus] = useState("Primary region healthy");
  const [chaosState, setChaosState] = useState<ChaosState>("idle");

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      const [nextScenarios, nextSites] = await Promise.all([listScenarios(), listSites()]);
      if (ignore) return;

      setScenarios(nextScenarios);
      setSites(nextSites);

      setActiveScenarioId((currentScenarioId) =>
        nextScenarios.length > 0 && !nextScenarios.some((scenario) => scenario.id === currentScenarioId)
          ? nextScenarios[0]!.id
          : currentScenarioId
      );

      setResilienceStatus("Backend catalog loaded");
    };

    void loadCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  const handleRunScenario = async () => {
    setIsRunning(true);
    try {
      const [result] = await Promise.all([runScenario(activeScenarioId), wait(1800)]);
      setRun(result);
      setResilienceStatus("Inference completed through primary region");
    } finally {
      setIsRunning(false);
    }
  };

  const handleTriggerChaos = () => {
    setChaosState("running");
    setResilienceStatus("FIS experiment active: primary region degradation injected");
  };

  const handleChaosComplete = () => {
    setChaosState("complete");
    setResilienceStatus("System resilient: failover completed in 72s");
  };

  return (
    <main className={`min-h-screen bg-noc-bg text-noc-text ${chaosState === "running" ? "chaos-shake" : ""}`}>
      <TopHeader chaosState={chaosState} latencyMs={Math.max(42, Math.round(run.inferenceLatencyMs / 34))} />

      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)]">
        <ScenarioPanel
          activeScenarioId={activeScenarioId}
          chaosState={chaosState}
          isRunning={isRunning}
          onRunScenario={handleRunScenario}
          onSelectScenario={setActiveScenarioId}
          onTriggerChaos={handleTriggerChaos}
          run={run}
          scenarios={scenarios}
        />

        <section className="grid min-w-0 grid-rows-[auto_auto_minmax(430px,1fr)_auto] border-l border-noc-border bg-[#090d13]">
          <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-noc-border bg-noc-panel/80 px-4 py-2" aria-live="polite">
            <span className="h-2.5 w-2.5 rounded-full bg-noc-teal shadow-teal-glow" />
            <strong className="font-mono text-xs uppercase text-noc-teal">{resilienceStatus}</strong>
            <span className="font-sans text-xs uppercase text-noc-muted">Route 53 ARC placeholder armed</span>
          </div>
          <DataRibbon run={run} status={resilienceStatus} />
          <GridMap run={run} sites={sites} />
          <ResultsTable run={run} sites={sites} />
        </section>
      </div>

      <ChaosOverlay onComplete={handleChaosComplete} state={chaosState} />
    </main>
  );
}
