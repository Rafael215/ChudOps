# Data Ingestion Contract

This document is the handoff contract between EDA/preprocessing and the SeismicSentry backend.

The backend does not need raw ZenPower, Scripps, or USGS files. It needs small normalized outputs that can be loaded into DynamoDB and served through the API.

## What EDA Should Produce

Place processed files in `data/processed/` when they are ready. Keep large raw files out of git.

### 1. Site Registry

File:

```text
sites.csv
```

Required columns:

```text
site_id,name,latitude,longitude,capacity_kw,installation_type,vs30
```

Rules:

- `site_id` must be stable and unique.
- `latitude` and `longitude` must be decimal degrees.
- `capacity_kw` must be numeric.
- `installation_type` must be `rooftop` or `ground_mount`.
- `vs30` must be numeric meters/second.

Example:

```csv
site_id,name,latitude,longitude,capacity_kw,installation_type,vs30
zen-la-001,Van Nuys Rooftop Cluster,34.191,-118.451,4200,rooftop,245
```

### 2. Scenario Metadata

File:

```text
scenarios.csv
```

Required columns:

```text
scenario_id,name,magnitude,epicenter_latitude,epicenter_longitude,source,description
```

Rules:

- `scenario_id` must be stable and URL-safe, for example `northridge-2`.
- `magnitude` must be numeric.
- `source` should cite the dataset or simulation source in short form.
- `description` should be judge-facing text for the dashboard.

### 3. Scenario Features

File:

```text
scenario_features.csv
```

Required columns:

```text
scenario_id,site_id,pgv_cm_s
```

Rules:

- One row means: this site experienced this PGV in this earthquake scenario.
- `scenario_id` must match `scenarios.csv`.
- `site_id` must match `sites.csv`.
- `pgv_cm_s` must be numeric peak ground velocity in cm/s.

Example:

```csv
scenario_id,site_id,pgv_cm_s
northridge-2,zen-la-001,61
```

## Why These Files Exist

The model input for one site is:

```text
site metadata + scenario-specific PGV
```

That becomes:

```text
PGV at site coordinates
installation type
Vs30
capacity kW
```

The backend then returns:

```text
probability of failure
risk band
expected capacity lost
```

## DynamoDB Row Shapes

The importer writes these rows into the deployed `SitesTable`.

Site row:

```text
pk = SITE#<site_id>
sk = METADATA
gsi1pk = SITE_REGION#<region>
gsi1sk = SITE#<site_id>
```

Scenario row:

```text
pk = SCENARIO#<scenario_id>
sk = METADATA
```

Scenario feature row:

```text
pk = SCENARIO#<scenario_id>
sk = FEATURE#<site_id>
gsi1pk = SCENARIO_REGION#<scenario_id>#<region>
gsi1sk = FEATURE#<site_id>
```

The importer derives `region` from site latitude/longitude. Current region buckets are:

```text
southern-california
northern-california
california
western-us
central-us
southeast-us
northeast-us
outside-us
```

The deployed table has a `RegionIndex` GSI on `gsi1pk, gsi1sk` so the API can query a site catalog or scenario features by region instead of scanning.

## Current Fixtures

Small example files live in:

```text
data/fixtures/
```

These are intentionally tiny. They are for testing the importer and showing the expected format, not for final analysis.

## Import Command

After building TypeScript, import fixture data with:

```bash
npm run build
SITES_TABLE_NAME=<deployed-sites-table-name> AWS_PROFILE=seismic-sentry AWS_REGION=us-west-2 npm run import:fixtures
```

For the real processed EDA outputs in `data/processed`, use:

```bash
SITES_TABLE_NAME=<deployed-sites-table-name> REPLACE_TABLE_DATA=true AWS_PROFILE=seismic-sentry AWS_REGION=us-west-2 npm run import:processed -w @seismic-sentry/api
```

`REPLACE_TABLE_DATA=true` removes prior `SITE#...` and `SCENARIO#...` rows before loading the processed files. The importer denormalizes site metadata into each `SCENARIO#... / FEATURE#...` row so scenario inference can query one DynamoDB partition and score all assets without extra site lookups.

By default, the importer also creates a scaled demo scenario for every processed scenario:

```text
<scenario_id>-stress
```

The stress scenario multiplies PGV by `45x` so the dashboard can demonstrate yellow/red risk bands during a hackathon demo while keeping the original scenario intact. Override with:

```bash
ENABLE_STRESS_SCENARIOS=false
STRESS_PGV_MULTIPLIER=30
```

The current deployed sites table is:

```text
SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ
```

So the current command is:

```bash
SITES_TABLE_NAME=SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ REPLACE_TABLE_DATA=true AWS_PROFILE=seismic-sentry AWS_REGION=us-west-2 npm run import:processed -w @seismic-sentry/api
```

## API Behavior With Real Data

- `GET /scenarios` returns scenario metadata from DynamoDB.
- `GET /sites?limit=2000` returns a bounded site catalog for map rendering.
- `GET /sites?limit=2000&region=southern-california` uses the `RegionIndex`.
- `POST /scenarios/{scenarioId}/run` scores every scenario feature row in DynamoDB, calculates summary metrics across the full dataset, and returns the top-risk result slice to keep API Gateway and the browser responsive.
- `POST /scenarios/{scenarioId}/run?region=southern-california` scores only that region through the `RegionIndex`.

## Teammate Summary

Your job is not to touch AWS or frontend code.

Your job is to turn raw datasets into:

```text
sites.csv
scenarios.csv
scenario_features.csv
```

Once those files exist, the backend can load them and the dashboard can run real scenarios.
