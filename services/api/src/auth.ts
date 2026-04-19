import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "./http.js";

const headerValue = (event: APIGatewayProxyEventV2, name: string) => {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
};

const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export const requireDemoAdmin = (event: APIGatewayProxyEventV2): APIGatewayProxyResult | undefined => {
  const expectedHash = process.env.DEMO_ADMIN_TOKEN_SHA256;
  if (!expectedHash) {
    return json(500, { message: "Demo operator token is not configured" });
  }

  const token = headerValue(event, "x-demo-admin-token");
  if (!token) {
    return json(401, { message: "Operator token required" });
  }

  const actual = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return json(403, { message: "Invalid operator token" });
  }

  return undefined;
};
