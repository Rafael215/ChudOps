# ChudOps

Resilient grid digital twin for earthquake impact analysis across Southern California solar infrastructure.

ChudOps helps operators answer a high-pressure post-earthquake question: which solar assets are most likely to fail, how much capacity is at risk, and can the emergency dashboard keep running while cloud infrastructure is under stress?

The project combines a React operations dashboard, AWS serverless infrastructure, a SageMaker-ready failure model, DynamoDB-backed asset data, and AWS Fault Injection Service chaos experiments.

## Live Demo

```text
Dashboard:   https://d1zssbg0orn82l.cloudfront.net
API Gateway: https://3wu1mg8ili.execute-api.us-west-2.amazonaws.com
AppSync:     https://fyrjkuayf5g3dhzx77g5ezimdy.appsync-api.us-west-2.amazonaws.com/graphql
```

The dashboard requires a shared operator token for protected demo actions. The token is intentionally not committed to the repo or bundled into the frontend.

Protected actions include:

- Loading scenarios and site data
- Running scenario diagnostics
- Starting AWS FIS chaos experiments
- Downloading resilience report PDFs

`GET /health` remains public so the deployed API can be checked quickly.

## What It Does

- Loads earthquake scenarios and solar asset data from the backend.
- Scores each solar site with probability of failure.
- Displays red/yellow/green asset risk on a Mapbox dashboard.
- Ranks the highest-risk assets in a live inference queue.
- Shows model evidence such as AUC and feature importances.
- Runs AWS FIS chaos experiments to prove resilience behavior.
- Generates a resilience report PDF after a chaos test.

## Tech Stack

```text
React Vite TypeScript TailwindCSS Mapbox AWS CDK API Gateway Lambda DynamoDB
SageMaker CloudFront S3 AppSync SNS CloudWatch AWS FIS Python scikit-learn
```

## Repository Layout

```text
apps/web              React + Vite dashboard
infra                 AWS CDK infrastructure stack
services/api          Lambda handlers for catalog, scenarios, FIS, and reports
services/ml           Training, packaging, and SageMaker inference code
packages/shared       Shared TypeScript domain types
docs                  Architecture and data-ingestion notes
scripts               Local helper scripts
data                  Hackathon data fixtures and processed CSVs
```

## Quick Start

Install dependencies:

```bash
npm install
```

Copy local environment placeholders:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp infra/cdk.context.example.json infra/cdk.context.json
```

Run the dashboard locally:

```bash
npm run dev
```

Build everything:

```bash
npm run build
```

Synthesize the AWS stack:

```bash
npm run cdk:synth
```

## Data

The hackathon dataset flow uses normalized CSVs under `data/fixtures` and `data/processed` so teammates and judges can reproduce the demo quickly.

The pipeline combines:

- Scripps physics-based ground velocity simulation data
- ZenPower solar installation records
- Vs30-style soil/ground-response features where available

The EDA and preprocessing handoff lives in:

```text
docs/data-ingestion-contract.md
```

Expected normalized files:

```text
data/fixtures/sites.csv
data/fixtures/scenarios.csv
data/fixtures/scenario_features.csv
data/processed/sites.csv
data/processed/scenarios.csv
data/processed/scenario_features.csv
```

Load fixture data into DynamoDB:

```bash
SITES_TABLE_NAME=SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ \
AWS_PROFILE=seismic-sentry \
AWS_REGION=us-west-2 \
npm run import:fixtures
```

## ML Pipeline

Train and package the model locally:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r services/ml/requirements.txt

python services/ml/src/train.py \
  --sites-csv data/processed/sites.csv \
  --features-csv data/processed/scenario_features.csv \
  --output-dir outputs/model

python services/ml/src/package_model.py \
  --model-dir outputs/model \
  --output outputs/model.tar.gz
```

Upload the model artifact:

```bash
MODEL_BUCKET=seismicsentry-dev-model-artifacts-547320736907-us-west-2

aws s3 mb s3://$MODEL_BUCKET \
  --region us-west-2 \
  --profile seismic-sentry

aws s3 cp outputs/model.tar.gz \
  s3://$MODEL_BUCKET/models/seismic-sentry/<model-version>/model.tar.gz \
  --profile seismic-sentry \
  --region us-west-2
```

Deploy SageMaker-backed inference:

```bash
DEMO_HASH=$(cat /tmp/seismicsentry-demo-token.sha256)

npm exec -w @seismic-sentry/infra -- cdk deploy \
  --profile seismic-sentry \
  --context enableSageMaker=true \
  --context modelArtifactBucket=seismicsentry-dev-model-artifacts-547320736907-us-west-2 \
  --context modelArtifactKey=models/seismic-sentry/<model-version>/model.tar.gz \
  --context modelVersion=<value-from-outputs/model/metrics.json> \
  --context modelAucRoc=<value-from-outputs/model/metrics.json> \
  --context modelFeatureImportance='<json-from-outputs/model/feature_importance.json>' \
  --context allowedCorsOrigin=https://d1zssbg0orn82l.cloudfront.net \
  --context demoAdminTokenSha256="$DEMO_HASH" \
  --require-approval never
```

## Cost Control

Most of the stack is serverless and low-cost while idle. The main idle-cost resource is the SageMaker real-time endpoint.

Pause SageMaker after testing:

```bash
DEMO_HASH=$(cat /tmp/seismicsentry-demo-token.sha256)

npm exec -w @seismic-sentry/infra -- cdk deploy \
  --profile seismic-sentry \
  --context enableSageMaker=false \
  --context allowedCorsOrigin=https://d1zssbg0orn82l.cloudfront.net \
  --context demoAdminTokenSha256="$DEMO_HASH" \
  --require-approval never
```

This keeps the dashboard, API, DynamoDB, CloudFront, and FIS template alive, but switches scenario runs to local fallback inference.

Do not run `cdk destroy` until the hackathon is fully over.

## AWS Operations

Primary stack:

```text
CloudFormation stack: SeismicSentry-dev
Region: us-west-2
AWS profile: seismic-sentry
```

Useful AWS Console pages:

- CloudFormation stack: `SeismicSentry-dev`
- CloudWatch dashboard: `SeismicSentry-dev`
- SageMaker endpoint: `seismicsentry-dev-endpoint`
- FIS experiment templates
- Lambda log groups for catalog, scenario orchestration, FIS, and reports

## Demo Flow

1. Open the dashboard.
2. Enter the shared operator token.
3. Select the Scripps stress scenario.
4. Run the scenario diagnostic.
5. Show the map, telemetry, model details, and risk queue.
6. Trigger the AWS FIS chaos test.
7. Wait for the experiment status to complete.
8. Download the resilience report PDF.

## Notes

- The visible dashboard brand is BedRock.
- Some AWS resource names still use `SeismicSentry-dev` to avoid replacing stable demo infrastructure.
- The Mapbox public token should be restricted by URL in the Mapbox dashboard before final presentation.
- Synthetic ML labels are generated from HAZUS-style fragility logic because real labeled post-earthquake solar failure data is rare.
