import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { EarthquakeScenario, InstallationType, SiteInferenceInput, SolarSite } from "@seismic-sentry/shared";

declare const process: {
  env: Record<string, string | undefined>;
};

type CountyScope = "all" | "la-county" | "san-diego-county" | "la-and-san-diego-county";

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

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.SITES_TABLE_NAME;
const regionIndexName = process.env.REGION_INDEX_NAME ?? "RegionIndex";

const countyBounds = {
  "la-county": { latitudeMin: 33.7, latitudeMax: 34.85, longitudeMin: -119.05, longitudeMax: -117.35 },
  "san-diego-county": { latitudeMin: 32.53, latitudeMax: 33.55, longitudeMin: -117.6, longitudeMax: -116.0 }
} as const;

const isCountyScope = (value: unknown): value is CountyScope =>
  value === "all" || value === "la-county" || value === "san-diego-county" || value === "la-and-san-diego-county";

const countyForSite = (site: Pick<SolarSite, "latitude" | "longitude">): "la-county" | "san-diego-county" | undefined => {
  const { latitude, longitude } = site;
  const losAngeles = countyBounds["la-county"];
  if (
    latitude >= losAngeles.latitudeMin &&
    latitude <= losAngeles.latitudeMax &&
    longitude >= losAngeles.longitudeMin &&
    longitude <= losAngeles.longitudeMax
  ) {
    return "la-county";
  }

  const sanDiego = countyBounds["san-diego-county"];
  if (
    latitude >= sanDiego.latitudeMin &&
    latitude <= sanDiego.latitudeMax &&
    longitude >= sanDiego.longitudeMin &&
    longitude <= sanDiego.longitudeMax
  ) {
    return "san-diego-county";
  }

  return undefined;
};

const countyMatchesScope = (site: Pick<SolarSite, "latitude" | "longitude">, scope: CountyScope) => {
  if (scope === "all") return true;
  const county = countyForSite(site);
  if (scope === "la-and-san-diego-county") return county === "la-county" || county === "san-diego-county";
  return county === scope;
};

const scenarioMatchesScope = (scenario: EarthquakeScenario, scope: CountyScope): boolean => {
  if (scope === "all") return true;

  const haystack = `${scenario.name} ${scenario.source} ${scenario.description}`.toLowerCase();
  if (scope === "la-county") {
    return haystack.includes("los angeles") || haystack.includes("la county") || haystack.includes("northridge");
  }

  if (scope === "san-diego-county") {
    return haystack.includes("san diego");
  }

  return scenarioMatchesScope(scenario, "la-county") || scenarioMatchesScope(scenario, "san-diego-county");
};

const isInstallationType = (value: unknown): value is InstallationType =>
  value === "rooftop" || value === "ground_mount";

const toSite = (item: Record<string, unknown>): SolarSite | undefined => {
  if (!item.id || !item.name || !isInstallationType(item.installationType)) return undefined;

  return {
    id: String(item.id),
    name: String(item.name),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    capacityKw: Number(item.capacityKw),
    installationType: item.installationType,
    vs30: Number(item.vs30),
    region: String(item.region ?? "unknown")
  };
};

const toScenario = (item: Record<string, unknown>): EarthquakeScenario | undefined => {
  const epicenter = item.epicenter as { latitude?: unknown; longitude?: unknown } | undefined;
  if (!item.id || !item.name || !epicenter) return undefined;

  return {
    id: String(item.id),
    name: String(item.name),
    magnitude: Number(item.magnitude),
    epicenter: {
      latitude: Number(epicenter.latitude),
      longitude: Number(epicenter.longitude)
    },
    source: String(item.source ?? ""),
    description: String(item.description ?? "")
  };
};

const scanMetadataRows = async (pkPrefix: string, limit?: number) => {
  if (!tableName) return [];

  const rows: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const remaining = limit ? Math.max(limit - rows.length, 0) : undefined;
    if (remaining === 0) break;

    const response = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
        FilterExpression: "begins_with(pk, :pkPrefix) AND sk = :metadata",
        ExpressionAttributeValues: {
          ":pkPrefix": pkPrefix,
          ":metadata": "METADATA"
        },
        Limit: remaining ? Math.min(remaining, 1000) : 1000
      })
    );

    rows.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey && (!limit || rows.length < limit));

  return rows;
};

const queryRegionRows = async (gsi1pk: string, limit?: number) => {
  if (!tableName) return [];

  const rows: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const remaining = limit ? Math.max(limit - rows.length, 0) : undefined;
    if (remaining === 0) break;

    const response = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: regionIndexName,
        KeyConditionExpression: "gsi1pk = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": gsi1pk
        },
        Limit: remaining ? Math.min(remaining, 1000) : undefined,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    rows.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey && (!limit || rows.length < limit));

  return rows;
};

export const listScenarios = async (options: { countyScope?: string } = {}): Promise<EarthquakeScenario[]> => {
  if (!tableName) return seedScenarios;

  const scenarios = (await scanMetadataRows("SCENARIO#")).map(toScenario).filter(Boolean) as EarthquakeScenario[];
  return scenarios.length > 0 ? scenarios : seedScenarios;
};

export const listSites = async (options: { limit?: number; region?: string; countyScope?: string } = {}): Promise<SolarSite[]> => {
  if (!tableName) return seedSites;

  const rows = options.region
    ? await queryRegionRows(`SITE_REGION#${options.region}`, options.limit)
    : await scanMetadataRows("SITE#", options.limit);
  const sites = rows.map(toSite).filter(Boolean) as SolarSite[];
  const scope = isCountyScope(options.countyScope) ? options.countyScope : "all";
  const filteredSites = sites.filter((site) => countyMatchesScope(site, scope));

  return sites.length > 0 ? filteredSites : seedSites.filter((site) => countyMatchesScope(site, scope));
};

export const loadScenarioFeatures = async (
  scenarioId: string,
  options: { region?: string; countyScope?: string } = {}
): Promise<SiteInferenceInput[]> => {
  const scope = isCountyScope(options.countyScope) ? options.countyScope : "all";

  if (tableName) {
    const features: SiteInferenceInput[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    const collect = (items: Record<string, unknown>[]) => {
      for (const item of items) {
        const site = toSite(item);
        if (!site || !countyMatchesScope(site, scope)) continue;
        features.push({
          ...site,
          pgvCmS: Number(item.pgvCmS)
        });
      }
    };

    if (options.region) {
      const rows = await queryRegionRows(`SCENARIO_REGION#${scenarioId}#${options.region}`);
      collect(rows);
    } else {
      do {
        const response = await dynamo.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "pk = :pk AND begins_with(sk, :featurePrefix)",
            ExpressionAttributeValues: {
              ":pk": `SCENARIO#${scenarioId}`,
              ":featurePrefix": "FEATURE#"
            },
            ExclusiveStartKey: exclusiveStartKey
          })
        );

        collect((response.Items ?? []) as Record<string, unknown>[]);

        exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (exclusiveStartKey);
    }

    if (features.length > 0) return features;
  }

  const pgvBySite = seedScenarioFeatures[scenarioId] ?? seedScenarioFeatures["northridge-2"]!;

  return seedSites
    .filter((site) => countyMatchesScope(site, scope))
    .map((site) => ({
      ...site,
      pgvCmS: pgvBySite[site.id] ?? 20
    }));
};
