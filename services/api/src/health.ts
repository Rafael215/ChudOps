import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json, noContent } from "./http.js";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  return json(200, {
    ok: true,
    service: "seismic-sentry-api",
    region: process.env.AWS_REGION ?? "unknown",
    stack: process.env.STACK_NAME ?? "unknown",
    generatedAt: new Date().toISOString()
  });
};
