import type { EarthquakeScenario, ScenarioRunResult, SolarSite } from "@seismic-sentry/shared";
import { sampleRun, sampleSites, scenarios } from "./sampleData";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const operatorTokenStorageKey = "seismic-sentry-operator-token";

const countyScopeQuery = (scopeId: string) => (scopeId && scopeId !== "all" ? `countyScope=${encodeURIComponent(scopeId)}` : "");

export const getOperatorToken = () => window.sessionStorage.getItem(operatorTokenStorageKey) ?? "";

export const setOperatorToken = (token: string) => {
  const trimmed = token.trim();
  if (trimmed) {
    window.sessionStorage.setItem(operatorTokenStorageKey, trimmed);
  }
};

export const clearOperatorToken = () => {
  window.sessionStorage.removeItem(operatorTokenStorageKey);
};

const operatorHeaders = (): Record<string, string> => {
  const token = getOperatorToken();
  return token ? { "x-demo-admin-token": token } : {};
};

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: operatorHeaders()
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export interface FisExperimentStartResult {
  experimentId: string;
  experimentTemplateId: string;
  startedAt: string;
  status: string;
}

export interface FisExperimentStatusResult {
  experimentId: string;
  experimentTemplateId?: string;
  status: string;
  reason?: string;
  startedAt?: string;
  endedAt?: string;
  actions?: Array<{
    name: string;
    actionId: string;
    description: string;
    status: string;
    reason: string;
  }>;
}

export interface ResilienceReportRequest {
  experimentId: string;
  status: string;
  logs: string[];
}

export const listScenarios = async (scopeId = "la-and-san-diego-county"): Promise<EarthquakeScenario[]> => {
  if (!apiBaseUrl) return scenarios;

  const query = countyScopeQuery(scopeId);
  return fetchJson<EarthquakeScenario[]>(`/scenarios${query ? `?${query}` : ""}`);
};

export const listSites = async (scopeId = "la-and-san-diego-county"): Promise<SolarSite[]> => {
  if (!apiBaseUrl) return sampleSites;

  const params = ["limit=2000", countyScopeQuery(scopeId)].filter(Boolean).join("&");
  return fetchJson<SolarSite[]>(`/sites?${params}`);
};

export const runScenario = async (scenarioId: string, scopeId = "la-and-san-diego-county"): Promise<ScenarioRunResult> => {
  if (!apiBaseUrl) {
    return {
      ...sampleRun,
      scenarioId,
      generatedAt: new Date().toISOString()
    };
  }

  const query = countyScopeQuery(scopeId);
  const response = await fetch(`${apiBaseUrl}/scenarios/${scenarioId}/run${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...operatorHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`Scenario run failed with ${response.status}`);
  }

  return response.json() as Promise<ScenarioRunResult>;
};

export const startFisExperiment = async (): Promise<FisExperimentStartResult> => {
  if (!apiBaseUrl) {
    throw new Error("Live API base URL is not configured");
  }

  const response = await fetch(`${apiBaseUrl}/fis/experiments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...operatorHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`FIS experiment start failed with ${response.status}`);
  }

  return response.json() as Promise<FisExperimentStartResult>;
};

export const getFisExperiment = async (experimentId: string): Promise<FisExperimentStatusResult> => {
  if (!apiBaseUrl) {
    throw new Error("Live API base URL is not configured");
  }

  const response = await fetch(`${apiBaseUrl}/fis/experiments/${encodeURIComponent(experimentId)}`, {
    headers: operatorHeaders()
  });

  if (!response.ok) {
    throw new Error(`FIS experiment status request failed with ${response.status}`);
  }

  return response.json() as Promise<FisExperimentStatusResult>;
};

export const downloadResilienceReport = async ({ experimentId, status, logs }: ResilienceReportRequest): Promise<void> => {
  if (!apiBaseUrl) {
    throw new Error("Live API base URL is not configured");
  }

  const response = await fetch(`${apiBaseUrl}/reports/resilience`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...operatorHeaders()
    },
    body: JSON.stringify({ experimentId, status, logs })
  });

  if (!response.ok) {
    throw new Error(`Resilience report request failed with ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `resilience-report-${experimentId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
};
