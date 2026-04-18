import {
  riskBandForProbability,
  type SiteInferenceInput,
  type SiteInferenceResult
} from "@seismic-sentry/shared";
import { InvokeEndpointCommand, SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";

const client = new SageMakerRuntimeClient({});

const localFallbackPredict = (site: SiteInferenceInput): SiteInferenceResult => {
  const soilAmplification = site.vs30 < 260 ? 0.18 : site.vs30 < 400 ? 0.08 : -0.05;
  const installationFragility = site.installationType === "ground_mount" ? 0.07 : 0.12;
  const pgvRisk = Math.min(site.pgvCmS / 75, 1);
  const probabilityOfFailure = Math.max(0.02, Math.min(0.98, pgvRisk + soilAmplification + installationFragility));
  const riskBand = riskBandForProbability(probabilityOfFailure);

  return {
    siteId: site.id,
    probabilityOfFailure,
    riskBand,
    pgvCmS: site.pgvCmS,
    expectedCapacityLostKw: Math.round(site.capacityKw * probabilityOfFailure)
  };
};

export const runInference = async (sites: SiteInferenceInput[]): Promise<SiteInferenceResult[]> => {
  const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME;

  if (!endpointName || process.env.USE_LOCAL_INFERENCE === "true") {
    return sites.map(localFallbackPredict);
  }

  const command = new InvokeEndpointCommand({
    EndpointName: endpointName,
    ContentType: "application/json",
    Accept: "application/json",
    Body: JSON.stringify({ instances: sites })
  });

  const response = await client.send(command);
  const decoded = new TextDecoder().decode(response.Body);
  return JSON.parse(decoded) as SiteInferenceResult[];
};
