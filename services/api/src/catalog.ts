import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listScenarios, listSites } from "./data.js";
import { requireDemoAdmin } from "./auth.js";
import { json, noContent } from "./http.js";

const siteLimitFromQuery = (value?: string) => {
  const parsed = Number(value ?? "2000");
  if (!Number.isFinite(parsed) || parsed <= 0) return 2000;
  return Math.min(Math.floor(parsed), 5000);
};

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

  if (event.rawPath.endsWith("/scenarios")) {
    return json(
      200,
      await listScenarios({
        countyScope: countyScopeFromQuery(event.queryStringParameters?.countyScope)
      })
    );
  }

  if (event.rawPath.endsWith("/sites")) {
    return json(
      200,
      await listSites({
        limit: siteLimitFromQuery(event.queryStringParameters?.limit),
        region: regionFromQuery(event.queryStringParameters?.region),
        countyScope: countyScopeFromQuery(event.queryStringParameters?.countyScope)
      })
    );
  }

  return json(404, { message: "Catalog route not found" });
};
