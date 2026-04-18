import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "node:fs";
import path from "node:path";

type CsvRow = Record<string, string>;

const repoRoot = path.resolve(process.cwd(), "../..");
const fixtureDir = process.env.FIXTURE_DIR ?? path.join(repoRoot, "data/fixtures");
const tableName = process.env.SITES_TABLE_NAME;

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

const putItem = async (item: Record<string, unknown>) => {
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: item
    })
  );
};

const main = async () => {
  const siteRows = parseCsv(path.join(fixtureDir, "sites.csv"));
  const scenarioRows = parseCsv(path.join(fixtureDir, "scenarios.csv"));
  const featureRows = parseCsv(path.join(fixtureDir, "scenario_features.csv"));

  for (const row of siteRows) {
    const id = required(row, "site_id");
    const installationType = required(row, "installation_type");

    if (installationType !== "rooftop" && installationType !== "ground_mount") {
      throw new Error(`Invalid installation_type for ${id}: ${installationType}`);
    }

    await putItem({
      pk: `SITE#${id}`,
      sk: "METADATA",
      id,
      name: required(row, "name"),
      latitude: numberValue(row, "latitude"),
      longitude: numberValue(row, "longitude"),
      capacityKw: numberValue(row, "capacity_kw"),
      installationType,
      vs30: numberValue(row, "vs30")
    });
  }

  for (const row of scenarioRows) {
    const id = required(row, "scenario_id");

    await putItem({
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
    });
  }

  for (const row of featureRows) {
    const scenarioId = required(row, "scenario_id");
    const siteId = required(row, "site_id");

    await putItem({
      pk: `SCENARIO#${scenarioId}`,
      sk: `FEATURE#${siteId}`,
      scenarioId,
      siteId,
      pgvCmS: numberValue(row, "pgv_cm_s")
    });
  }

  console.log(
    `Imported ${siteRows.length} sites, ${scenarioRows.length} scenarios, and ${featureRows.length} scenario features into ${tableName}.`
  );
};

await main();
