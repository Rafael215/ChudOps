import type { EarthquakeScenario, ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";
import { sampleRun, sampleSites, scenarios } from "./sampleData";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const listScenarios = async (): Promise<EarthquakeScenario[]> => {
  if (!apiBaseUrl) return scenarios;

  try {
    return await fetchJson<EarthquakeScenario[]>("/scenarios");
  } catch (error) {
    console.warn("Falling back to local scenarios", error);
    return scenarios;
  }
};

export const listSites = async (): Promise<SolarSite[]> => {
  if (!apiBaseUrl) return sampleSites;

  try {
    return await fetchJson<SolarSite[]>("/sites");
  } catch (error) {
    console.warn("Falling back to local sites", error);
    return sampleSites;
  }
};

export const runScenario = async (scenarioId: string): Promise<ScenarioRunResult> => {
  if (!apiBaseUrl) {
    return {
      ...sampleRun,
      scenarioId,
      generatedAt: new Date().toISOString()
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/scenarios/${scenarioId}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Scenario run failed with ${response.status}`);
    }

    return response.json() as Promise<ScenarioRunResult>;
  } catch (error) {
    console.warn("Falling back to local scenario run", error);
    return {
      ...sampleRun,
      scenarioId,
      generatedAt: new Date().toISOString()
    };
  }
};
