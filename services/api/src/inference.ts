import {
  type ModelRunMetadata,
  riskBandForProbability,
  type SiteInferenceInput,
  type SiteInferenceResult
} from "@seismic-sentry/shared";
import { InvokeEndpointCommand, SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";

const client = new SageMakerRuntimeClient({});
const endpointBatchSize = Number(process.env.SAGEMAKER_BATCH_SIZE ?? "5000");
const localModelMetadata: ModelRunMetadata = {
  inferenceSource: "local",
  modelName: "Local HAZUS-style fallback",
  modelVersion: "local-fallback-v1",
  syntheticLabelExplanation:
    "Training labels are synthetic. The trainer builds a HAZUS-like failure probability from PGV, Vs30, installation type, and capacity, then samples a binary failed label from that probability before fitting the model.",
  featureImportance: [
    { feature: "pgv_cm_s", importance: 0.55 },
    { feature: "vs30", importance: 0.22 },
    { feature: "installation_type_code", importance: 0.14 },
    { feature: "capacity_kw", importance: 0.09 }
  ]
};

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
    expectedCapacityLostKw: Math.round(site.capacityKw * probabilityOfFailure),
    primaryDriver: site.pgvCmS >= 50 ? "PGV" : site.vs30 < 260 ? "SOFT SEDIMENT" : "PGV",
    secondaryDriver: site.vs30 < 260 ? "SOFT SEDIMENT" : site.installationType === "rooftop" ? "ROOFTOP FRAGILITY" : "CAPACITY EXPOSURE"
  };
};

export interface InferenceOutput {
  results: SiteInferenceResult[];
  model: ModelRunMetadata;
}

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const runInference = async (sites: SiteInferenceInput[]): Promise<InferenceOutput> => {
  const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME;

  if (!endpointName || process.env.USE_LOCAL_INFERENCE === "true") {
    return {
      results: sites.map(localFallbackPredict),
      model: localModelMetadata
    };
  }

  const results: SiteInferenceResult[] = [];
  for (const siteBatch of chunk(sites, endpointBatchSize)) {
    const command = new InvokeEndpointCommand({
      EndpointName: endpointName,
      ContentType: "application/json",
      Accept: "application/json",
      Body: JSON.stringify({ instances: siteBatch })
    });

    const response = await client.send(command);
    const decoded = new TextDecoder().decode(response.Body);
    results.push(...(JSON.parse(decoded) as SiteInferenceResult[]));
  }

  return {
    results,
    model: {
      inferenceSource: "sagemaker",
      modelName: process.env.MODEL_NAME ?? "SeismicSentry GBT Failure Model",
      modelVersion: process.env.MODEL_VERSION ?? endpointName,
      aucRoc: process.env.MODEL_AUC_ROC ? Number(process.env.MODEL_AUC_ROC) : undefined,
      featureImportance: process.env.MODEL_FEATURE_IMPORTANCE ? JSON.parse(process.env.MODEL_FEATURE_IMPORTANCE) : undefined,
      syntheticLabelExplanation:
        "Training labels are synthetic. The trainer builds a HAZUS-like failure probability from PGV, Vs30, installation type, and capacity, then samples a binary failed label from that probability before fitting the model."
    }
  };
};
