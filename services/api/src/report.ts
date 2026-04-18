import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json, noContent } from "./http.js";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  return json(202, {
    status: "queued",
    message: "PDF resilience report generation placeholder. Wire this to ReportLab or WeasyPrint after the first demo path works."
  });
};
