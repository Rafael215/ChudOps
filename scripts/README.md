# Scripts

This directory contains local dataset preparation helpers.

## Processed Data Handoff

Generate the normalized CSV files expected by the backend ingestion contract:

```bash
source .venv/bin/activate
python scripts/prepare_data.py --skip-raw-prep
```

Outputs:

```text
data/processed/sites.csv
data/processed/scenarios.csv
data/processed/scenario_features.csv
```

The generated `vs30` values are deterministic placeholders until a USGS Vs30
layer is joined. The Scripps LOH artifact does not include a real geographic
epicenter or magnitude, so the scenario CSV uses grid-center proxy coordinates
and `0.0` for magnitude.
