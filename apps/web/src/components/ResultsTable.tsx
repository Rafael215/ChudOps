import { useEffect, useMemo, useState } from "react";
import type { ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";

interface ResultsTableProps {
  sites: SolarSite[];
  run: ScenarioRunResult;
}

export function ResultsTable({ sites, run }: ResultsTableProps) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const rows = useMemo(
    () => [...run.results].sort((a, b) => b.probabilityOfFailure - a.probabilityOfFailure),
    [run.results]
  );

  useEffect(() => {
    setSecondsAgo(0);
    const timer = window.setInterval(() => setSecondsAgo((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [run.generatedAt]);

  const generatedAt = new Date(run.generatedAt).toLocaleTimeString();

  return (
    <section className="min-h-0 border-t border-noc-border bg-noc-panel p-4" aria-label="Site inference results">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 border border-noc-teal/35 bg-noc-teal/10 px-2 py-1 font-mono text-[0.62rem] font-bold uppercase text-noc-teal">
            <span className="h-2 w-2 rounded-full bg-noc-teal animate-pulse" />
            Live Inference
          </div>
          <h2 className="font-sans text-lg font-extrabold text-white">Solar asset risk queue</h2>
        </div>
        <div className="text-right font-mono text-[0.68rem] uppercase text-noc-muted">
          <span className="block text-noc-text">{generatedAt}</span>
          <span>Updated {secondsAgo}s ago</span>
        </div>
      </div>
      <div className="max-h-[calc(100%-64px)] min-h-0 overflow-auto border border-noc-border bg-[#080c11]">
        <table className="w-full min-w-[980px] border-collapse font-mono text-[0.74rem]">
          <thead className="bg-[#060a0f]">
            <tr className="text-left uppercase text-noc-muted">
              <th className="border-b border-noc-border px-3 py-3">Site</th>
              <th className="border-b border-noc-border px-3 py-3">Risk</th>
              <th className="border-b border-noc-border px-3 py-3">PoF ↓</th>
              <th className="border-b border-noc-border px-3 py-3">PGV</th>
              <th className="border-b border-noc-border px-3 py-3">Capacity</th>
              <th className="border-b border-noc-border px-3 py-3">Vs30</th>
              <th className="border-b border-noc-border px-3 py-3">Drivers</th>
              <th className="border-b border-noc-border px-3 py-3">Failover Impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((result) => {
              const site = siteById.get(result.siteId);
              const name = site?.name ?? result.name ?? result.siteId;
              const installationType = site?.installationType ?? result.installationType ?? "rooftop";
              const capacityKw = site?.capacityKw ?? result.capacityKw ?? 0;
              const vs30 = site?.vs30 ?? result.vs30 ?? 0;
              const pof = Math.round(result.probabilityOfFailure * 100);
              const soilLabel = vs30 < 260 ? "SOFT SEDIMENT" : vs30 < 420 ? "STIFF SOIL" : "ROCK";
              const failoverImpact = Math.max(0.2, result.probabilityOfFailure * 6).toFixed(1);
              const barClass =
                result.riskBand === "red"
                  ? "bg-noc-red"
                  : result.riskBand === "yellow"
                    ? "bg-noc-amber"
                    : "bg-noc-teal";

              return (
                <tr
                  className={`border-b border-noc-border/80 transition hover:bg-white/[0.03] ${
                    result.riskBand === "red" ? "border-l-[3px] border-l-noc-red bg-noc-red/[0.025]" : "border-l-[3px] border-l-transparent"
                  }`}
                  key={result.siteId}
                >
                  <td className="px-3 py-3">
                    <strong className="block font-sans text-sm font-bold text-noc-text">{name}</strong>
                    <span className="font-sans text-xs uppercase text-noc-muted">{installationType.replace("_", " ")}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`risk-pill ${result.riskBand}`}>{result.riskBand}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block text-noc-text">{pof}%</span>
                    <span className="mt-1 block h-1.5 w-24 bg-noc-border">
                      <span className={`block h-full ${barClass}`} style={{ width: `${pof}%` }} />
                    </span>
                  </td>
                  <td className="px-3 py-3 text-noc-text">{result.pgvCmS} cm/s</td>
                  <td className="px-3 py-3 text-noc-text">{(capacityKw / 1000).toFixed(1)} MW</td>
                  <td className="px-3 py-3">
                    <span className="text-noc-text">{vs30} m/s</span>
                    <span className="ml-2 text-[0.62rem] uppercase text-noc-muted">{soilLabel}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block text-noc-text">{result.primaryDriver ?? "PGV"}</span>
                    <span className="text-[0.62rem] uppercase text-noc-muted">{result.secondaryDriver ?? soilLabel}</span>
                  </td>
                  <td className="px-3 py-3 text-noc-text">{failoverImpact} min</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
