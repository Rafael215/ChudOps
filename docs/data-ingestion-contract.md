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
```

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

The current deployed sites table is:

```text
SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ
```

So the current command is:

```bash
SITES_TABLE_NAME=SeismicSentry-dev-SitesTable456CECCC-14QOQHWDBJMYQ AWS_PROFILE=seismic-sentry AWS_REGION=us-west-2 npm run import:fixtures
```

## Teammate Summary

Your job is not to touch AWS or frontend code.

Your job is to turn raw datasets into:

```text
sites.csv
scenarios.csv
scenario_features.csv
```

Once those files exist, the backend can load them and the dashboard can run real scenarios.
