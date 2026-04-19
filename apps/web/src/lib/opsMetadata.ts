import type { EarthquakeScenario } from "@seismic-sentry/shared";

export interface ScenarioOpsMetadata {
  faultName: string;
  pgvRange: string;
  faultMechanism: string;
  hypocenterDepth: string;
  basinAmplification: string;
  modelSource: string;
  envelope: number[];
}

const defaultMetadata: ScenarioOpsMetadata = {
  faultName: "Southern California fault corridor",
  pgvRange: "12-68 cm/s",
  faultMechanism: "Strike-slip with basin edge amplification",
  hypocenterDepth: "11.8 km",
  basinAmplification: "2.1x",
  modelSource: "Rekoske et al. 2023",
  envelope: [8, 22, 46, 67, 54, 36, 18]
};

export const scenarioOpsMetadata: Record<string, ScenarioOpsMetadata> = {
  "northridge-2": {
    faultName: "Northridge blind thrust",
    pgvRange: "16-74 cm/s",
    faultMechanism: "Reverse blind thrust",
    hypocenterDepth: "18.4 km",
    basinAmplification: "2.4x",
    modelSource: "Rekoske et al. 2023",
    envelope: [6, 18, 43, 74, 62, 35, 16]
  },
  "san-andreas-south": {
    faultName: "Southern San Andreas",
    pgvRange: "10-102 cm/s",
    faultMechanism: "Right-lateral strike-slip",
    hypocenterDepth: "12.6 km",
    basinAmplification: "2.9x",
    modelSource: "Rekoske et al. 2023",
    envelope: [9, 31, 58, 88, 102, 77, 44]
  },
  "scripps-loh-map-1": {
    faultName: "Scripps LOH simulation grid",
    pgvRange: "0.18-1.83 cm/s",
    faultMechanism: "Physics-based ground velocity map",
    hypocenterDepth: "Unavailable in source artifact",
    basinAmplification: "Vs30 joined per site",
    modelSource: "Scripps SIO LOH PGV map",
    envelope: [0.18, 0.42, 0.88, 1.19, 0.95, 0.62, 0.31]
  },
  "scripps-loh-map-1-stress": {
    faultName: "Scripps LOH scaled stress test",
    pgvRange: "8-82 cm/s",
    faultMechanism: "Scaled PGV emergency drill",
    hypocenterDepth: "Unavailable in source artifact",
    basinAmplification: "45x PGV stress multiplier",
    modelSource: "Scripps SIO LOH PGV map stress variant",
    envelope: [8, 19, 40, 54, 82, 67, 31]
  }
};

export const getScenarioOpsMetadata = (scenario?: EarthquakeScenario): ScenarioOpsMetadata => {
  if (!scenario) return defaultMetadata;
  return scenarioOpsMetadata[scenario.id] ?? {
    ...defaultMetadata,
    faultName: scenario.name,
    modelSource: scenario.source || defaultMetadata.modelSource
  };
};
