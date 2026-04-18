import type { EarthquakeScenario, SiteInferenceInput, SolarSite } from "@seismic-sentry/shared";

const seedScenarios: EarthquakeScenario[] = [
  {
    id: "northridge-2",
    name: "Northridge 2.0",
    magnitude: 6.9,
    epicenter: { latitude: 34.213, longitude: -118.537 },
    source: "Scripps SIO physics-based simulation placeholder",
    description: "San Fernando Valley rupture with basin amplification across LA County."
  },
  {
    id: "san-andreas-south",
    name: "San Andreas South",
    magnitude: 7.8,
    epicenter: { latitude: 34.05, longitude: -117.24 },
    source: "Scripps SIO physics-based simulation placeholder",
    description: "High-impact southern San Andreas event affecting Inland Empire solar corridors."
  }
];

const seedSites: SolarSite[] = [
  {
    id: "zen-la-001",
    name: "Van Nuys Rooftop Cluster",
    latitude: 34.191,
    longitude: -118.451,
    capacityKw: 4200,
    installationType: "rooftop",
    vs30: 245
  },
  {
    id: "zen-la-002",
    name: "Burbank Commercial Array",
    latitude: 34.181,
    longitude: -118.308,
    capacityKw: 8600,
    installationType: "rooftop",
    vs30: 310
  },
  {
    id: "zen-la-003",
    name: "Lancaster Ground Mount",
    latitude: 34.686,
    longitude: -118.154,
    capacityKw: 18400,
    installationType: "ground_mount",
    vs30: 590
  }
];

const seedScenarioFeatures: Record<string, Record<string, number>> = {
  "northridge-2": {
    "zen-la-001": 61,
    "zen-la-002": 37,
    "zen-la-003": 16
  },
  "san-andreas-south": {
    "zen-la-001": 44,
    "zen-la-002": 31,
    "zen-la-003": 52
  }
};

export const listScenarios = async (): Promise<EarthquakeScenario[]> => seedScenarios;

export const listSites = async (): Promise<SolarSite[]> => seedSites;

export const loadScenarioFeatures = async (scenarioId: string): Promise<SiteInferenceInput[]> => {
  const pgvBySite = seedScenarioFeatures[scenarioId] ?? seedScenarioFeatures["northridge-2"]!;

  return seedSites.map((site) => ({
    ...site,
    pgvCmS: pgvBySite[site.id] ?? 20
  }));
};
