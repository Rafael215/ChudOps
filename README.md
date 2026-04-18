# SeismicSentry

Resilient Grid Digital Twin for earthquake impact analysis across California solar infrastructure.

SeismicSentry combines a React operations dashboard, AWS serverless infrastructure, a SageMaker-ready ML pipeline, and chaos engineering hooks for resilience demos.

## Repository Layout

```text
apps/web              React + Vite dashboard
infra                 AWS CDK app and stacks
services/api          Lambda handlers for scenarios, inference orchestration, and reports
services/ml           XGBoost training and SageMaker inference skeleton
packages/shared       Shared TypeScript domain types
docs                  Architecture notes and chaos experiment templates
scripts               Local helper scripts
```

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment placeholders:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp infra/cdk.context.example.json infra/cdk.context.json
```

3. Run the dashboard locally:

```bash
npm run dev
```

4. Type-check and build:

```bash
npm run build
```

5. Synthesize infrastructure:

```bash
npm run cdk:synth
```

## AWS Notes

The default CDK stack creates low-cost serverless resources: S3, CloudFront, API Gateway, Lambda, DynamoDB, SNS, AppSync, CloudWatch, and IAM roles.

SageMaker endpoint creation is intentionally opt-in because it can cost real money while idle. Enable it only when you have a model artifact and are ready to deploy:

```bash
npm run cdk:deploy -- --context enableSageMaker=true
```

## Required Placeholders

- `MAPBOX_TOKEN`: frontend map rendering
- `AWS_ACCOUNT_ID` and `AWS_REGION`: CDK environment
- `SAGEMAKER_ENDPOINT_NAME`: existing endpoint name, or CDK-created endpoint when enabled
- `ALERT_EMAIL`: optional SNS subscription target
- Dataset locations for Scripps PGV rasters, ZenPower permits, and USGS Vs30 tiles

## Hackathon Path

1. Replace sample dashboard data with API Gateway output.
2. Train the model from `services/ml/src/train.py` and upload the artifact to S3.
3. Deploy or attach a SageMaker endpoint.
4. Run the scenario Lambda and show red/yellow/green sites.
5. Trigger the FIS experiment from `docs/fis-experiment-template.json`.

## EDA Handoff

The EDA/preprocessing contract lives in `docs/data-ingestion-contract.md`.

Teammates working on raw ZenPower, Scripps, or USGS data should produce normalized CSVs matching:

- `data/fixtures/sites.csv`
- `data/fixtures/scenarios.csv`
- `data/fixtures/scenario_features.csv`

The importer can load those files into DynamoDB after the TypeScript build:

```bash
SITES_TABLE_NAME=SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ AWS_PROFILE=seismic-sentry AWS_REGION=us-west-2 npm run import:fixtures
```
