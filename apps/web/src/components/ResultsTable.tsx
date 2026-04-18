import type { ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";

interface ResultsTableProps {
  sites: SolarSite[];
  run: ScenarioRunResult;
}

export function ResultsTable({ sites, run }: ResultsTableProps) {
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const rows = [...run.results].sort((a, b) => b.probabilityOfFailure - a.probabilityOfFailure);

  return (
    <section className="results-table" aria-label="Site inference results">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live inference</p>
          <h2>Solar asset risk queue</h2>
        </div>
        <span>{new Date(run.generatedAt).toLocaleTimeString()}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>Risk</th>
              <th>PoF</th>
              <th>PGV</th>
              <th>Capacity</th>
              <th>Vs30</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((result) => {
              const site = siteById.get(result.siteId);
              if (!site) return null;

              return (
                <tr key={result.siteId}>
                  <td>
                    <strong>{site.name}</strong>
                    <span>{site.installationType.replace("_", " ")}</span>
                  </td>
                  <td>
                    <span className={`risk-pill ${result.riskBand}`}>{result.riskBand}</span>
                  </td>
                  <td>{Math.round(result.probabilityOfFailure * 100)}%</td>
                  <td>{result.pgvCmS} cm/s</td>
                  <td>{(site.capacityKw / 1000).toFixed(1)} MW</td>
                  <td>{site.vs30} m/s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
