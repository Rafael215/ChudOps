import type { ScenarioRunResult } from "@seismic-sentry/shared";

interface DataRibbonProps {
  run: ScenarioRunResult;
  status: string;
}

export function DataRibbon({ run, status }: DataRibbonProps) {
  const atRiskMw = (run.expectedCapacityLostKw / 1000).toFixed(1);
  const message = `${status.toUpperCase()} - ${run.totalSites} sites scored - ${run.redSites} CRITICAL - ${atRiskMw} MW at risk - Failover target <90s - Route 53 ARC armed -`;

  return (
    <div className="overflow-hidden border-b border-noc-border bg-[#070b10] font-mono text-[0.68rem] font-semibold uppercase text-noc-teal">
      <div className="ticker-track whitespace-nowrap py-2">
        <span className="mx-6">{message}</span>
        <span className="mx-6">{message}</span>
        <span className="mx-6">{message}</span>
      </div>
    </div>
  );
}
