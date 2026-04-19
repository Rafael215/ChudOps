import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";

interface GridMapProps {
  sites: SolarSite[];
  run: ScenarioRunResult;
}

const riskColors = {
  green: "#00d4aa",
  yellow: "#f59e0b",
  red: "#ef4444"
};

const positionFor = (index: number) => ({
  left: `${16 + ((index * 17) % 68)}%`,
  top: `${18 + ((index * 23) % 58)}%`
});

function MapLegends() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 grid max-w-[280px] gap-3 border border-noc-border bg-[#080c11]/88 p-3 backdrop-blur">
      <div>
        <h3 className="mb-2 font-mono text-[0.65rem] font-bold uppercase text-noc-text">Peak Ground Velocity</h3>
        <div className="h-2 w-full bg-gradient-to-r from-[#277dff] via-[#f8d24c] to-noc-red" />
        <div className="mt-1 flex justify-between font-mono text-[0.58rem] text-noc-muted">
          <span>0</span>
          <span>20</span>
          <span>50</span>
          <span>100+ cm/s</span>
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-mono text-[0.65rem] font-bold uppercase text-noc-text">Site Status</h3>
        <div className="grid gap-1 font-mono text-[0.62rem] uppercase text-noc-muted">
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-noc-teal" />
            Green Normal
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-noc-amber" />
            Yellow Degraded
          </span>
          <span className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 rounded-full bg-noc-red" />
            Red Critical
          </span>
        </div>
      </div>
    </div>
  );
}

export function GridMap({ sites, run }: GridMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const resultBySite = useMemo(
    () => new Map(run.results.map((result) => [result.siteId, result])),
    [run.results]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN;

    if (!token) return;

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-118.2437, 34.0522],
      zoom: 8.2,
      attributionControl: false
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!mapRef.current) return;

    sites.forEach((site) => {
      const result = resultBySite.get(site.id);
      const color = result ? riskColors[result.riskBand] : "#8b949e";
      const element = document.createElement("button");
      element.className = `site-marker ${result?.riskBand ?? "green"}`;
      element.style.setProperty("--marker-color", color);
      element.setAttribute("aria-label", `${site.name} ${result?.riskBand ?? "unknown"} risk`);

      const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(
        `<strong>${site.name}</strong><span>${site.capacityKw.toLocaleString()} kW</span><span>PoF ${Math.round(
          (result?.probabilityOfFailure ?? 0) * 100
        )}%</span>`
      );

      const marker = new mapboxgl.Marker({ element })
        .setLngLat([site.longitude, site.latitude])
        .setPopup(popup)
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });
  }, [resultBySite, sites]);

  if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    return (
      <section className="relative min-h-[430px] overflow-hidden border-b border-noc-border bg-[#05080c]" aria-label="Solar installation risk map">
        <div className="fallback-grid absolute inset-0" aria-hidden="true">
          {sites.map((site, index) => {
            const result = resultBySite.get(site.id);
            return <span className={`fallback-node ${result?.riskBand ?? "green"}`} key={site.id} style={positionFor(index)} />;
          })}
        </div>
        <div className="absolute right-4 top-4 z-20 border border-noc-border bg-[#080c11]/88 p-3 backdrop-blur">
          <p className="font-mono text-[0.62rem] font-bold uppercase text-noc-teal">MapBox token missing</p>
          <h2 className="mt-1 font-sans text-lg font-bold text-white">Live map placeholder</h2>
          <p className="mt-1 max-w-[320px] font-sans text-xs text-noc-muted">
            Add VITE_MAPBOX_TOKEN to render the real geospatial layer.
          </p>
        </div>
        <MapLegends />
      </section>
    );
  }

  return (
    <section className="relative min-h-[430px] overflow-hidden border-b border-noc-border bg-[#05080c]" aria-label="Solar installation risk map">
      <div className="h-full min-h-[430px]" ref={containerRef} />
      <MapLegends />
    </section>
  );
}
