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

## Grid Architect Marimo Demo

The hackathon prototype also includes a local Marimo notebook app:

```text
app.py                 Interactive seismic exposure dashboard
eda.py                 Data loading, cleaning, spatial matching, and metrics
scripts/prepare_data.py Converts downloaded source files into local app inputs
```

Run the Marimo demo:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
marimo edit app.py
```

The app combines:

- Scripps physics-based ground velocity simulation data
- ZenPower solar installation records

The app reports exposed solar sites, affected capacity, capacity at risk, daily
energy at risk, and estimated daily energy value at risk. The raw datasets are
kept local under `data/raw/` and ignored by Git so they are not pushed to
GitHub.

Prototype caveat: the Scripps LOH file is a local simulation grid, so the
current demo scales that grid over the ZenPower solar region as a first-pass
workflow approximation. This is a seismic exposure screening demo, not a final
physical damage model.

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
