import type { EarthquakeScenario, ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";

export const scenarios: EarthquakeScenario[] = [
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

export const sampleSites: SolarSite[] = [
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
  },
  {
    id: "zen-la-004",
    name: "Long Beach Industrial Solar",
    latitude: 33.804,
    longitude: -118.167,
    capacityKw: 12100,
    installationType: "rooftop",
    vs30: 198
  },
  {
    id: "zen-la-005",
    name: "Pomona Distribution Center",
    latitude: 34.055,
    longitude: -117.752,
    capacityKw: 9200,
    installationType: "rooftop",
    vs30: 365
  }
];

export const sampleRun: ScenarioRunResult = {
  scenarioId: "northridge-2",
  generatedAt: new Date().toISOString(),
  totalSites: 5,
  redSites: 2,
  yellowSites: 2,
  greenSites: 1,
  totalCapacityKw: 52500,
  expectedCapacityLostKw: 21725,
  inferenceLatencyMs: 1420,
  results: [
    { siteId: "zen-la-001", probabilityOfFailure: 0.82, riskBand: "red", pgvCmS: 61, expectedCapacityLostKw: 3444 },
    { siteId: "zen-la-002", probabilityOfFailure: 0.47, riskBand: "yellow", pgvCmS: 37, expectedCapacityLostKw: 4042 },
    { siteId: "zen-la-003", probabilityOfFailure: 0.12, riskBand: "green", pgvCmS: 16, expectedCapacityLostKw: 2208 },
    { siteId: "zen-la-004", probabilityOfFailure: 0.78, riskBand: "red", pgvCmS: 58, expectedCapacityLostKw: 9438 },
    { siteId: "zen-la-005", probabilityOfFailure: 0.28, riskBand: "yellow", pgvCmS: 24, expectedCapacityLostKw: 2576 }
  ]
};
