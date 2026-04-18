import { Activity, AlertTriangle, RadioTower, ShieldCheck, Zap } from "lucide-react";
import type { EarthquakeScenario, ScenarioRunResult } from "@seismic-sentry/shared";

interface ScenarioPanelProps {
  scenarios: EarthquakeScenario[];
  activeScenarioId: string;
  run: ScenarioRunResult;
  isRunning: boolean;
  onSelectScenario: (scenarioId: string) => void;
  onRunScenario: () => void;
  onTriggerChaos: () => void;
}

const formatMw = (magnitude: number) => `M${magnitude.toFixed(1)}`;

export function ScenarioPanel({
  scenarios,
  activeScenarioId,
  run,
  isRunning,
  onSelectScenario,
  onRunScenario,
  onTriggerChaos
}: ScenarioPanelProps) {
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0]!;
  const lostMw = run.expectedCapacityLostKw / 1000;

  return (
    <aside className="scenario-panel" aria-label="Scenario controls">
      <div className="brand-lockup">
        <div className="brand-mark">
          <RadioTower size={22} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Resilient grid digital twin</p>
          <h1>SeismicSentry</h1>
        </div>
      </div>

      <div className="scenario-switcher" role="tablist" aria-label="Earthquake scenarios">
        {scenarios.map((scenario) => (
          <button
            className={scenario.id === activeScenarioId ? "scenario-tab active" : "scenario-tab"}
            key={scenario.id}
            onClick={() => onSelectScenario(scenario.id)}
            type="button"
          >
            <span>{scenario.name}</span>
            <strong>{formatMw(scenario.magnitude)}</strong>
          </button>
        ))}
      </div>

      <section className="scenario-summary" aria-label="Active scenario">
        <div>
          <p className="eyebrow">Active simulation</p>
          <h2>{activeScenario.name}</h2>
        </div>
        <p>{activeScenario.description}</p>
      </section>

      <div className="metric-grid">
        <div className="metric">
          <Activity size={18} aria-hidden="true" />
          <span>Inference</span>
          <strong>{(run.inferenceLatencyMs / 1000).toFixed(1)}s</strong>
        </div>
        <div className="metric red">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Red sites</span>
          <strong>{run.redSites}</strong>
        </div>
        <div className="metric">
          <Zap size={18} aria-hidden="true" />
          <span>Expected loss</span>
          <strong>{lostMw.toFixed(1)} MW</strong>
        </div>
        <div className="metric">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Failover target</span>
          <strong>&lt;90s</strong>
        </div>
      </div>

      <div className="actions">
        <button className="primary-action" disabled={isRunning} onClick={onRunScenario} type="button">
          <Activity size={18} aria-hidden="true" />
          {isRunning ? "Running inference" : "Run scenario"}
        </button>
        <button className="secondary-action" onClick={onTriggerChaos} type="button">
          <AlertTriangle size={18} aria-hidden="true" />
          Trigger chaos test
        </button>
      </div>
    </aside>
  );
}
