import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";

interface GridMapProps {
  sites: SolarSite[];
  run: ScenarioRunResult;
}

const riskColors = {
  green: "#2fa36b",
  yellow: "#d6a21f",
  red: "#d84a3a"
};

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
      element.className = "site-marker";
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
      <div className="map-fallback">
        <div className="fallback-grid" aria-hidden="true">
          {sites.map((site) => {
            const result = resultBySite.get(site.id);
            return (
              <span
                className={`fallback-node ${result?.riskBand ?? "green"}`}
                key={site.id}
                style={{ left: `${20 + Math.random() * 60}%`, top: `${18 + Math.random() * 58}%` }}
              />
            );
          })}
        </div>
        <div className="fallback-copy">
          <p className="eyebrow">MapBox token missing</p>
          <h2>Live map placeholder</h2>
          <p>Add `VITE_MAPBOX_TOKEN` to `apps/web/.env.local` to render the real geospatial layer.</p>
        </div>
      </div>
    );
  }

  return <div className="map-shell" ref={containerRef} aria-label="Solar installation risk map" />;
}
