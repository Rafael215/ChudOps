import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { InstallationType } from "@seismic-sentry/shared";

type CsvRow = Record<string, string>;

const repoRoot = path.resolve(process.cwd(), "../..");
const fixtureDir = process.env.FIXTURE_DIR ?? path.join(repoRoot, "data/fixtures");
const tableName = process.env.SITES_TABLE_NAME;
const replaceTableData = process.env.REPLACE_TABLE_DATA === "true";
const enableStressScenarios = process.env.ENABLE_STRESS_SCENARIOS !== "false";
const stressPgvMultiplier = Number(process.env.STRESS_PGV_MULTIPLIER ?? "45");

if (!tableName) {
  throw new Error("SITES_TABLE_NAME is required.");
}

const parseCsv = (filePath: string): CsvRow[] => {
  const [headerLine, ...lines] = readFileSync(filePath, "utf-8").trim().split(/\r?\n/);
  if (!headerLine) return [];

  const headers = headerLine.split(",").map((header) => header.trim());

  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = line.split(",").map((value) => value.trim());
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
};

const required = (row: CsvRow, key: string) => {
  const value = row[key];
  if (!value) throw new Error(`Missing required CSV value: ${key}`);
  return value;
};

const numberValue = (row: CsvRow, key: string) => {
  const value = Number(required(row, key));
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric CSV value: ${key}`);
  return value;
};

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const batchWrite = async (requests: Record<string, unknown>[]) => {
  for (const requestChunk of chunk(requests, 25)) {
    let unprocessed = requestChunk;

    do {
      const response = await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName!]: unprocessed
          }
        })
      );

      unprocessed = (response.UnprocessedItems?.[tableName!] ?? []) as Record<string, unknown>[];
    } while (unprocessed.length > 0);
  }
};

const scanKeysByPrefix = async (pkPrefix: string) => {
  const keys: { pk: string; sk: string }[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
        FilterExpression: "begins_with(pk, :pkPrefix)",
        ProjectionExpression: "pk, sk",
        ExpressionAttributeValues: {
          ":pkPrefix": pkPrefix
        }
      })
    );

    keys.push(...((response.Items ?? []) as { pk: string; sk: string }[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return keys;
};

const clearExistingData = async () => {
  const keys = [...(await scanKeysByPrefix("SITE#")), ...(await scanKeysByPrefix("SCENARIO#"))];
  if (keys.length === 0) return;

  await batchWrite(keys.map((Key) => ({ DeleteRequest: { Key } })));
  console.log(`Deleted ${keys.length} existing site/scenario rows from ${tableName}.`);
};

const putRequest = (item: Record<string, unknown>) => ({
  PutRequest: {
    Item: item
  }
});

const classifyRegion = (latitude: number, longitude: number) => {
  if (latitude >= 32 && latitude <= 35.9 && longitude >= -121.5 && longitude <= -114) return "southern-california";
  if (latitude > 35.9 && latitude <= 42.2 && longitude >= -124.6 && longitude <= -118) return "northern-california";
  if (latitude >= 32 && latitude <= 42.2 && longitude >= -124.6 && longitude <= -114) return "california";
  if (longitude <= -102 && latitude >= 31 && latitude <= 49) return "western-us";
  if (longitude > -102 && longitude <= -89 && latitude >= 25 && latitude <= 49) return "central-us";
  if (longitude > -89 && latitude >= 25 && latitude <= 37.5) return "southeast-us";
  if (longitude > -89 && latitude > 37.5) return "northeast-us";
  return "outside-us";
};

interface ParsedSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacityKw: number;
  installationType: InstallationType;
  vs30: number;
  region: string;
}

const main = async () => {
  const siteRows = parseCsv(path.join(fixtureDir, "sites.csv"));
  const scenarioRows = parseCsv(path.join(fixtureDir, "scenarios.csv"));
  const featureRows = parseCsv(path.join(fixtureDir, "scenario_features.csv"));
  const writeRequests: Record<string, unknown>[] = [];
  const siteById = new Map<string, ParsedSite>();

  if (replaceTableData) {
    await clearExistingData();
  }

  for (const row of siteRows) {
    const id = required(row, "site_id");
    const installationType = required(row, "installation_type");

    if (installationType !== "rooftop" && installationType !== "ground_mount") {
      throw new Error(`Invalid installation_type for ${id}: ${installationType}`);
    }

    const site: ParsedSite = {
      id,
      name: required(row, "name"),
      latitude: numberValue(row, "latitude"),
      longitude: numberValue(row, "longitude"),
      capacityKw: numberValue(row, "capacity_kw"),
      installationType,
      vs30: numberValue(row, "vs30"),
      region: classifyRegion(numberValue(row, "latitude"), numberValue(row, "longitude"))
    };
    siteById.set(id, site);

    writeRequests.push(putRequest({
      pk: `SITE#${id}`,
      sk: "METADATA",
      gsi1pk: `SITE_REGION#${site.region}`,
      gsi1sk: `SITE#${id}`,
      ...site
    }));
  }

  for (const row of scenarioRows) {
    const id = required(row, "scenario_id");

    writeRequests.push(putRequest({
      pk: `SCENARIO#${id}`,
      sk: "METADATA",
      id,
      name: required(row, "name"),
      magnitude: numberValue(row, "magnitude"),
      epicenter: {
        latitude: numberValue(row, "epicenter_latitude"),
        longitude: numberValue(row, "epicenter_longitude")
      },
      source: required(row, "source"),
      description: required(row, "description")
    }));

    if (enableStressScenarios) {
      writeRequests.push(putRequest({
        pk: `SCENARIO#${id}-stress`,
        sk: "METADATA",
        id: `${id}-stress`,
        name: `${required(row, "name")} Stress Test`,
        magnitude: Math.max(numberValue(row, "magnitude"), 7.2),
        epicenter: {
          latitude: numberValue(row, "epicenter_latitude"),
          longitude: numberValue(row, "epicenter_longitude")
        },
        source: `${required(row, "source")} scaled stress-test variant`,
        description: `Demo stress-test variant of ${required(row, "name")} with PGV multiplied by ${stressPgvMultiplier}x to exercise yellow/red risk bands.`
      }));
    }
  }

  for (const row of featureRows) {
    const scenarioId = required(row, "scenario_id");
    const siteId = required(row, "site_id");
    const site = siteById.get(siteId);
    if (!site) throw new Error(`Feature references unknown site_id: ${siteId}`);

    const pgvCmS = numberValue(row, "pgv_cm_s");
    const featureItem = {
      pk: `SCENARIO#${scenarioId}`,
      sk: `FEATURE#${siteId}`,
      gsi1pk: `SCENARIO_REGION#${scenarioId}#${site.region}`,
      gsi1sk: `FEATURE#${siteId}`,
      scenarioId,
      siteId,
      pgvCmS,
      ...site
    };

    writeRequests.push(putRequest(featureItem));

    if (enableStressScenarios) {
      writeRequests.push(putRequest({
        ...featureItem,
        pk: `SCENARIO#${scenarioId}-stress`,
        gsi1pk: `SCENARIO_REGION#${scenarioId}-stress#${site.region}`,
        scenarioId: `${scenarioId}-stress`,
        pgvCmS: Math.round(pgvCmS * stressPgvMultiplier * 1000) / 1000
      }));
    }
  }

  await batchWrite(writeRequests);

  console.log(
    `Imported ${siteRows.length} sites, ${scenarioRows.length}${enableStressScenarios ? " + stress" : ""} scenarios, and ${
      featureRows.length
    }${enableStressScenarios ? " + stress" : ""} scenario features from ${fixtureDir} into ${tableName}.`
  );
};

await main();
