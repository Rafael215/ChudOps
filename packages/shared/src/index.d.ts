export type InstallationType = "rooftop" | "ground_mount";
export type RiskBand = "green" | "yellow" | "red";
export interface SolarSite {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    capacityKw: number;
    installationType: InstallationType;
    vs30: number;
}
export interface EarthquakeScenario {
    id: string;
    name: string;
    magnitude: number;
    epicenter: {
        latitude: number;
        longitude: number;
    };
    source: string;
    description: string;
}
export interface SiteInferenceInput extends SolarSite {
    pgvCmS: number;
}
export interface SiteInferenceResult {
    siteId: string;
    probabilityOfFailure: number;
    riskBand: RiskBand;
    pgvCmS: number;
    expectedCapacityLostKw: number;
}
export interface ScenarioRunResult {
    scenarioId: string;
    generatedAt: string;
    totalSites: number;
    redSites: number;
    yellowSites: number;
    greenSites: number;
    totalCapacityKw: number;
    expectedCapacityLostKw: number;
    inferenceLatencyMs: number;
    results: SiteInferenceResult[];
}
export declare const riskBandForProbability: (probabilityOfFailure: number) => RiskBand;
