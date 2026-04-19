import type { APIGatewayProxyResult } from "aws-lambda";

const headers = {
  "access-control-allow-origin": process.env.CORS_ALLOW_ORIGIN ?? "*",
  "access-control-allow-headers": "content-type,authorization,x-demo-admin-token",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "content-type": "application/json",
  vary: "origin"
};

export const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers,
  body: JSON.stringify(body)
});

export const noContent = (): APIGatewayProxyResult => ({
  statusCode: 204,
  headers,
  body: ""
});
