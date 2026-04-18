import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { ScenarioRunResult } from "@seismic-sentry/shared";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { loadScenarioFeatures } from "./data.js";
import { noContent, json } from "./http.js";
import { runInference } from "./inference.js";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  const scenarioId = event.pathParameters?.scenarioId ?? "northridge-2";
  const startedAt = Date.now();
  const features = await loadScenarioFeatures(scenarioId);
  const results = await runInference(features);
  const inferenceLatencyMs = Date.now() - startedAt;

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
    results
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
    await sns.send(
      new PublishCommand({
        TopicArn: process.env.ALERT_TOPIC_ARN,
        Subject: `SeismicSentry alert: ${scenarioId}`,
        Message: JSON.stringify(body, null, 2)
      })
    );
  }

  return json(200, body);
};
