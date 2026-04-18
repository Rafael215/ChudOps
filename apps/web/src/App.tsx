import { useEffect, useState } from "react";
import type { EarthquakeScenario, SolarSite } from "@seismic-sentry/shared";
import { GridMap } from "./components/GridMap";
import { ResultsTable } from "./components/ResultsTable";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { listScenarios, listSites, runScenario } from "./lib/api";
import { sampleRun, sampleSites, scenarios as sampleScenarios } from "./lib/sampleData";

export function App() {
  const [scenarios, setScenarios] = useState<EarthquakeScenario[]>(sampleScenarios);
  const [sites, setSites] = useState<SolarSite[]>(sampleSites);
  const [activeScenarioId, setActiveScenarioId] = useState(sampleScenarios[0]!.id);
  const [run, setRun] = useState(sampleRun);
  const [isRunning, setIsRunning] = useState(false);
  const [resilienceStatus, setResilienceStatus] = useState("Primary region healthy");

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
      const result = await runScenario(activeScenarioId);
      setRun(result);
      setResilienceStatus("Inference completed through primary region");
    } finally {
      setIsRunning(false);
    }
  };

  const handleTriggerChaos = () => {
    setResilienceStatus("FIS experiment queued: Lambda throttle + DynamoDB latency simulation");
  };

  return (
    <main className="app-shell">
      <ScenarioPanel
        activeScenarioId={activeScenarioId}
        isRunning={isRunning}
        onRunScenario={handleRunScenario}
        onSelectScenario={setActiveScenarioId}
        onTriggerChaos={handleTriggerChaos}
        run={run}
        scenarios={scenarios}
      />

      <section className="operations-deck">
        <div className="status-strip" aria-live="polite">
          <span className="status-dot" />
          <strong>{resilienceStatus}</strong>
          <span>Route 53 ARC placeholder armed</span>
        </div>

        <GridMap run={run} sites={sites} />
        <ResultsTable run={run} sites={sites} />
      </section>
    </main>
  );
}
