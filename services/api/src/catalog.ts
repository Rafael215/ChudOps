import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listScenarios, listSites } from "./data.js";
import { json, noContent } from "./http.js";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  if (event.rawPath.endsWith("/scenarios")) {
    return json(200, await listScenarios());
  }

  if (event.rawPath.endsWith("/sites")) {
    return json(200, await listSites());
  }

  return json(404, { message: "Catalog route not found" });
};
