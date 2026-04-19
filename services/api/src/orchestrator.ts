import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { ScenarioRunResult } from "@seismic-sentry/shared";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireDemoAdmin } from "./auth.js";
import { loadScenarioFeatures } from "./data.js";
import { noContent, json } from "./http.js";
import { runInference } from "./inference.js";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
const sns = new SNSClient({});
const responseResultLimit = Number(process.env.RESPONSE_RESULT_LIMIT ?? "1000");

const regionFromQuery = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "all" ? trimmed : undefined;
};

const countyScopeFromQuery = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "all" ? trimmed : undefined;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  const authError = requireDemoAdmin(event);
  if (authError) return authError;

  const scenarioId = event.pathParameters?.scenarioId ?? "northridge-2";
  const region = regionFromQuery(event.queryStringParameters?.region);
  const countyScope = countyScopeFromQuery(event.queryStringParameters?.countyScope);
  const startedAt = Date.now();
  const features = await loadScenarioFeatures(scenarioId, { region, countyScope });
  const inference = await runInference(features);
  const results = inference.results;
  const inferenceLatencyMs = Date.now() - startedAt;
  const siteById = new Map(features.map((site) => [site.id, site]));
  const responseResults = results
    .map((result) => {
      const site = siteById.get(result.siteId);
      return site
        ? {
            ...result,
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude,
            capacityKw: site.capacityKw,
            installationType: site.installationType,
            vs30: site.vs30,
            region: site.region
          }
        : result;
    })
    .sort((a, b) => b.probabilityOfFailure - a.probabilityOfFailure)
    .slice(0, responseResultLimit);

  const totalCapacityKw = features.reduce((sum, site) => sum + site.capacityKw, 0);
  const expectedCapacityLostKw = results.reduce((sum, result) => sum + result.expectedCapacityLostKw, 0);

  const body: ScenarioRunResult = {
    scenarioId,
    generatedAt: new Date().toISOString(),
    totalSites: results.length,
    redSites: results.filter((result) => result.riskBand === "red").length,
    yellowSites: results.filter((result) => result.riskBand === "yellow").length,
    greenSites: results.filter((result) => result.riskBand === "green").length,
    totalCapacityKw,
    expectedCapacityLostKw,
    inferenceLatencyMs,
    model: inference.model,
    results: responseResults
  };

  if (process.env.RESULTS_TABLE_NAME) {
    await dynamo.send(
      new PutCommand({
        TableName: process.env.RESULTS_TABLE_NAME,
        Item: {
          pk: `SCENARIO#${scenarioId}`,
          sk: `RUN#${body.generatedAt}`,
          ...body
        }
      })
    );
  }

  const failureShare = expectedCapacityLostKw / Math.max(totalCapacityKw, 1);
  if (failureShare >= 0.4 && process.env.ALERT_TOPIC_ARN) {
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: process.env.ALERT_TOPIC_ARN,
          Subject: `SeismicSentry alert: ${scenarioId}`,
          Message: JSON.stringify(
            {
              scenarioId,
              region: region ?? "all",
              generatedAt: body.generatedAt,
              totalSites: body.totalSites,
              redSites: body.redSites,
              yellowSites: body.yellowSites,
              greenSites: body.greenSites,
              totalCapacityKw,
              expectedCapacityLostKw,
              failureShare,
              inferenceLatencyMs
            },
            null,
            2
          )
        })
      );
    } catch (error) {
      console.warn("Emergency alert publish failed", error);
    }
  }

  return json(200, body);
};
