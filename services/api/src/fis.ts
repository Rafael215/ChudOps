import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { FisClient, GetExperimentCommand, StartExperimentCommand } from "@aws-sdk/client-fis";
import { requireDemoAdmin } from "./auth.js";
import { json, noContent } from "./http.js";

const fis = new FisClient({});

const serializeExperiment = (experiment: {
  id?: string;
  experimentTemplateId?: string;
  state?: { status?: string; reason?: string };
  actions?: Record<string, { actionId?: string; description?: string; state?: { status?: string; reason?: string } }>;
  startTime?: Date;
  endTime?: Date;
}) => ({
  experimentId: experiment.id ?? undefined,
  experimentTemplateId: experiment.experimentTemplateId ?? undefined,
  status: experiment.state?.status ?? "unknown",
  reason: experiment.state?.reason ?? undefined,
  startedAt: experiment.startTime?.toISOString() ?? undefined,
  endedAt: experiment.endTime?.toISOString() ?? undefined,
  actions: Object.entries(experiment.actions ?? {}).map(([name, value]) => ({
    name,
    actionId: value.actionId ?? "unknown",
    description: value.description ?? "",
    status: value.state?.status ?? "unknown",
    reason: value.state?.reason ?? ""
  }))
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return noContent();
  }

  const authError = requireDemoAdmin(event);
  if (authError) return authError;

  const experimentTemplateId = process.env.FIS_EXPERIMENT_TEMPLATE_ID;
  if (!experimentTemplateId) {
    return json(500, { message: "FIS experiment template is not configured" });
  }

  const experimentId = event.pathParameters?.experimentId;

  try {
    if (event.requestContext.http.method === "GET") {
      if (!experimentId) {
        return json(400, { message: "experimentId is required" });
      }

      const result = await fis.send(
        new GetExperimentCommand({
          id: experimentId
        })
      );

      const experiment = result.experiment;
      if (!experiment) {
        return json(404, { message: `Experiment ${experimentId} not found` });
      }

      return json(200, serializeExperiment(experiment));
    }

    const result = await fis.send(
      new StartExperimentCommand({
        experimentTemplateId
      })
    );

    const experiment = (result as unknown as {
      experiment?: { id?: string; state?: { status?: string } };
      experimentId?: string;
      id?: string;
    }).experiment;

    const startedExperimentId =
      experiment?.id ?? (result as unknown as { experimentId?: string; id?: string }).experimentId ?? (result as unknown as { id?: string }).id ?? experimentTemplateId;
    const status = experiment?.state?.status ?? "starting";

    return json(200, {
      experimentId: startedExperimentId,
      experimentTemplateId,
      startedAt: new Date().toISOString(),
      status
    });
  } catch (error) {
    const typedError = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const statusCode = typedError.$metadata?.httpStatusCode;

    if (typedError.name === "ResourceNotFoundException") {
      return json(404, { message: typedError.message ?? "Resource not found" });
    }

    if (statusCode === 400 || statusCode === 403 || statusCode === 404) {
      return json(statusCode, { message: typedError.message ?? "FIS request failed" });
    }

    console.error("FIS handler failed", error);
    return json(500, { message: "FIS request failed" });
  }
};
