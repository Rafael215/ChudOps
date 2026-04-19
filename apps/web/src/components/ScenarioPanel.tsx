import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Cpu,
  BrainCircuit,
  Gauge,
  Layers3,
  RadioTower,
  ShieldCheck,
  Zap
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { EarthquakeScenario, ScenarioRunResult } from "@seismic-sentry/shared";
import { getScenarioOpsMetadata } from "../lib/opsMetadata";
import { visualizationScopes } from "../lib/visualizationScopes";

interface ScenarioPanelProps {
  scenarios: EarthquakeScenario[];
  activeScenarioId: string;
  activeScopeId: string;
  run: ScenarioRunResult;
  isRunning: boolean;
  isChaosStarting: boolean;
  chaosState: "idle" | "running" | "complete";
  onSelectScenario: (scenarioId: string) => void;
  onSelectScope: (scopeId: string) => void;
  onRunScenario: () => void;
  onTriggerChaos: () => void;
  onOpenModelDetails: () => void;
}

const formatMw = (magnitude: number) => `M${magnitude.toFixed(1)}`;
const featureLabel = (feature: string) =>
  ({
    pgv_cm_s: "PGV",
    vs30: "Vs30",
    installation_type_code: "Install Type",
    capacity_kw: "Capacity"
  })[feature] ?? feature;

const MetricRow = ({
  icon: Icon,
  label,
  unit,
  value,
  tone = "teal"
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  unit?: string;
  tone?: "teal" | "amber" | "red";
}) => (
  <div className="grid grid-cols-[18px_1fr_auto_auto] items-center gap-2 border-b border-noc-border/70 py-2 font-mono text-[0.68rem] last:border-0">
    <Icon
      size={15}
      className={tone === "red" ? "text-noc-red" : tone === "amber" ? "text-noc-amber" : "text-noc-teal"}
      aria-hidden="true"
    />
    <span className="overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.68rem] uppercase text-noc-muted">
      {label}
    </span>
    <span className="hidden min-w-6 border-b border-dotted border-noc-border sm:block" />
    <strong className="text-right text-noc-text">
      {value}
      {unit ? <span className="ml-1 text-noc-muted">{unit}</span> : null}
    </strong>
  </div>
);

export function ScenarioPanel({
  scenarios,
  activeScenarioId,
  activeScopeId,
  run,
  isRunning,
  isChaosStarting,
  chaosState,
  onSelectScenario,
  onSelectScope,
  onRunScenario,
  onTriggerChaos,
  onOpenModelDetails
}: ScenarioPanelProps) {
  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0]!;
  const lostMw = run.expectedCapacityLostKw / 1000;
  const lossPercent = Math.min(100, Math.round((run.expectedCapacityLostKw / run.totalCapacityKw) * 100));
  const activeMetadata = getScenarioOpsMetadata(activeScenario);
  const [paramsOpen, setParamsOpen] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingStates = [
    "Loading PGV grid...",
    "Running inference...",
    `Scoring ${run.totalSites.toLocaleString()} assets...`,
    "Complete"
  ];

  useEffect(() => {
    if (!isRunning) {
      setLoadingStep(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingStep((current) => Math.min(current + 1, loadingStates.length - 1));
    }, 450);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const loadingProgress = isRunning ? Math.min(100, (loadingStep + 1) * 25) : 0;

  const scenarioCards = useMemo(
    () =>
      scenarios.map((scenario) => {
        const metadata = getScenarioOpsMetadata(scenario);
        const chartData = metadata.envelope.map((pgv, index) => ({ index, pgv }));

        return { scenario, metadata, chartData };
      }),
    [scenarios]
  );

  return (
    <aside className="flex max-h-none min-h-full flex-col gap-5 overflow-visible border-r border-noc-border bg-noc-panel p-4 xl:sticky xl:top-12 xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto xl:p-5" aria-label="Scenario controls">
      <div className="flex items-center gap-3 border border-noc-border bg-[#0a0e14]/80 p-3">
        <div className="grid h-11 w-11 place-items-center border border-noc-teal/50 bg-noc-teal/10 text-noc-teal shadow-teal-glow">
          <RadioTower size={22} aria-hidden="true" />
        </div>
        <div>
          <p className="mb-1 font-mono text-[0.62rem] font-bold uppercase text-noc-teal">Ops Console</p>
          <h1 className="font-sans text-xl font-extrabold leading-none text-white">Bedrock</h1>
        </div>
      </div>

      <section className="space-y-3" aria-label="Scenario library">
        <div className="flex items-center justify-between border-b border-noc-border pb-2">
          <h2 className="font-mono text-xs font-bold uppercase text-noc-text">Scenario Library</h2>
          <span className="font-mono text-[0.62rem] text-noc-muted">{scenarios.length} SIMS</span>
        </div>

        <div className="space-y-2" role="tablist" aria-label="Earthquake scenarios">
          {scenarioCards.map(({ scenario, metadata, chartData }) => (
          <button
            className={`w-full border p-3 text-left transition ${
              scenario.id === activeScenarioId
                ? "border-noc-teal bg-noc-teal/10 shadow-teal-glow"
                : "border-noc-border bg-[#0a0e14] hover:border-noc-teal/50"
            }`}
            key={scenario.id}
            onClick={() => onSelectScenario(scenario.id)}
            type="button"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate font-sans text-sm font-bold text-white">{scenario.name}</span>
                <span className="mt-1 block truncate font-mono text-[0.62rem] uppercase text-noc-muted">
                  {metadata.faultName}
                </span>
              </div>
              <strong className="border border-noc-red/50 bg-noc-red/15 px-2 py-1 font-mono text-[0.68rem] text-noc-red">
                {formatMw(scenario.magnitude)}
              </strong>
            </div>
            <div className="grid grid-cols-[1fr_92px] items-center gap-3">
              <span className="font-mono text-[0.65rem] uppercase text-noc-amber">PGV {metadata.pgvRange}</span>
              <div className="h-8">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={chartData}>
                    <Line
                      dataKey="pgv"
                      dot={false}
                      isAnimationActive={false}
                      stroke={scenario.id === activeScenarioId ? "#00d4aa" : "#7d8da1"}
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </button>
          ))}
        </div>
      </section>

      <section className="border border-noc-border bg-[#0a0e14] p-3" aria-label="Visualization scope">
        <label className="mb-2 block font-mono text-xs font-bold uppercase text-noc-text" htmlFor="scope-filter">
          Visualization Scope
        </label>
        <select
          className="h-10 w-full border border-noc-border bg-black px-3 font-mono text-xs uppercase text-noc-text outline-none transition focus:border-noc-teal"
          id="scope-filter"
          onChange={(event) => onSelectScope(event.target.value)}
          value={activeScopeId}
        >
          {visualizationScopes.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.label}
            </option>
          ))}
        </select>
        <p className="mt-2 font-mono text-[0.62rem] uppercase text-noc-muted">
          Defaults to LA County and San Diego County so the dashboard only hydrates the visible demo footprint.
        </p>
      </section>

      <section className="border border-noc-border bg-[#0a0e14] p-3" aria-label="Telemetry">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold uppercase text-noc-text">Telemetry</h2>
          <span
            className={`border px-2 py-0.5 font-mono text-[0.62rem] ${
              run.model.inferenceSource === "sagemaker"
                ? "border-noc-teal/50 bg-noc-teal/10 text-noc-teal"
                : "border-noc-amber/50 bg-noc-amber/10 text-noc-amber"
            }`}
          >
            {run.model.inferenceSource === "sagemaker" ? "SAGEMAKER XGBOOST" : "LOCAL FALLBACK"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <MetricRow icon={Activity} label="Inference" value={(run.inferenceLatencyMs / 1000).toFixed(1)} unit="s" />
          <MetricRow icon={AlertTriangle} label="Critical Sites" tone="red" value={String(run.redSites)} />
          <MetricRow icon={Zap} label="Expected Loss" tone="amber" value={lostMw.toFixed(1)} unit="MW" />
          <MetricRow icon={ShieldCheck} label="Failover Target" value="<90" unit="s" />
          <MetricRow icon={Cpu} label="Assets Scored" value={String(run.totalSites)} />
          <MetricRow icon={Gauge} label="Loss Ratio" tone="amber" value={String(lossPercent)} unit="%" />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between font-mono text-[0.62rem] uppercase text-noc-muted">
            <span>Expected Loss</span>
            <span>{lossPercent}% regional capacity</span>
          </div>
          <div className="h-1.5 overflow-hidden bg-noc-border">
            <div className="h-full bg-gradient-to-r from-noc-teal via-noc-amber to-noc-red transition-all" style={{ width: `${lossPercent}%` }} />
          </div>
        </div>
      </section>

      <section className="border border-noc-border bg-[#0a0e14] p-3" aria-label="Model evidence">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold uppercase text-noc-text">Model Evidence</h2>
          <BrainCircuit size={16} className="text-noc-teal" aria-hidden="true" />
        </div>
        <div className="grid gap-2 font-mono text-[0.66rem]">
          <div className="flex justify-between gap-3 border-b border-noc-border/70 pb-2">
            <span className="font-sans uppercase text-noc-muted">Model</span>
            <strong className="text-right text-noc-text">{run.model.modelName}</strong>
          </div>
          <div className="flex justify-between gap-3 border-b border-noc-border/70 pb-2">
            <span className="font-sans uppercase text-noc-muted">Version</span>
            <strong className="max-w-[160px] truncate text-right text-noc-text">{run.model.modelVersion}</strong>
          </div>
          <div className="flex justify-between gap-3 border-b border-noc-border/70 pb-2">
            <span className="font-sans uppercase text-noc-muted">AUC-ROC</span>
            <strong className="text-right text-noc-teal">{run.model.aucRoc ? run.model.aucRoc.toFixed(3) : "n/a"}</strong>
          </div>
          {(run.model.featureImportance ?? []).slice(0, 4).map((item) => (
            <div className="grid grid-cols-[88px_1fr_42px] items-center gap-2" key={item.feature}>
              <span className="truncate font-sans uppercase text-noc-muted">{featureLabel(item.feature)}</span>
              <span className="h-1.5 bg-noc-border">
                <span className="block h-full bg-noc-teal" style={{ width: `${Math.max(4, Math.round(item.importance * 100))}%` }} />
              </span>
              <strong className="text-right text-noc-text">{Math.round(item.importance * 100)}%</strong>
            </div>
          ))}
        </div>
        <button
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-noc-teal/50 bg-noc-teal/10 font-mono text-[0.68rem] font-bold uppercase text-noc-teal transition hover:bg-noc-teal/15"
          onClick={onOpenModelDetails}
          type="button"
        >
          <BrainCircuit size={15} aria-hidden="true" />
          Open Model Details
        </button>
      </section>

      <div className="grid gap-2 border border-noc-border bg-[#0a0e14] p-3">
        <button
          className="relative min-h-12 overflow-hidden border border-noc-teal bg-noc-teal/95 px-4 font-sans text-sm font-extrabold uppercase text-[#03110e] shadow-teal-glow disabled:cursor-progress disabled:opacity-90"
          disabled={isRunning}
          onClick={onRunScenario}
          type="button"
        >
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            <Activity size={18} aria-hidden="true" />
            {isRunning ? loadingStates[loadingStep] : "Run Scenario"}
          </span>
          {isRunning ? (
            <span
              className="absolute bottom-0 left-0 h-1 bg-white/80 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          ) : null}
        </button>

        <button
          className="group relative min-h-12 border border-noc-amber/70 bg-noc-amber/12 px-4 font-sans text-sm font-bold uppercase text-noc-amber shadow-amber-glow"
          disabled={isChaosStarting || chaosState === "running"}
          onClick={onTriggerChaos}
          type="button"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <AlertTriangle size={18} aria-hidden="true" />
            {isChaosStarting ? "Launching FIS..." : chaosState === "running" ? "Chaos Active" : "Trigger Chaos Test"}
          </span>
          <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-10 hidden w-full border border-noc-border bg-black px-3 py-2 text-left font-mono text-[0.65rem] normal-case text-noc-muted group-hover:block">
            Injects fault via AWS FIS. Will trigger Route 53 ARC failover.
          </span>
        </button>
        <p className="font-mono text-[0.62rem] uppercase text-noc-muted">
          <Layers3 size={12} className="mr-1 inline text-noc-teal" aria-hidden="true" />
          {activeScenario.description}
        </p>
      </div>

      <section className="border border-noc-border bg-[#0a0e14] p-3" aria-label="Simulation parameters">
        <button
          className="flex w-full items-center justify-between font-mono text-xs font-bold uppercase text-noc-text"
          onClick={() => setParamsOpen((open) => !open)}
          type="button"
        >
          Simulation Parameters
          <ChevronDown className={`transition ${paramsOpen ? "rotate-180" : ""}`} size={16} aria-hidden="true" />
        </button>
        {paramsOpen ? (
          <div className="mt-3 space-y-2 font-mono text-[0.68rem]">
            {[
              ["Fault Mechanism", activeMetadata.faultMechanism],
              ["Hypocenter Depth", activeMetadata.hypocenterDepth],
              ["Basin Amplification", activeMetadata.basinAmplification],
              ["Model Source", activeMetadata.modelSource]
            ].map(([label, value]) => (
              <div className="flex justify-between gap-3 border-t border-noc-border/70 pt-2" key={label}>
                <span className="font-sans uppercase text-noc-muted">{label}</span>
                <strong className="text-right text-noc-text">{value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
