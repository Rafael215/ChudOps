from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np


FEATURE_COLUMNS = ["pgv_cm_s", "installation_type_code", "vs30", "capacity_kw"]


def model_fn(model_dir: str) -> Any:
    return joblib.load(Path(model_dir) / "model.joblib")


def input_fn(request_body: str, content_type: str) -> list[dict[str, Any]]:
    if content_type != "application/json":
        raise ValueError(f"Unsupported content type: {content_type}")
    payload = json.loads(request_body)
    return payload["instances"]


def predict_fn(instances: list[dict[str, Any]], model: Any) -> list[dict[str, Any]]:
    rows = []
    for site in instances:
        rows.append(
            [
                site["pgvCmS"],
                0 if site["installationType"] == "rooftop" else 1,
                site["vs30"],
                site["capacityKw"],
            ]
        )

    probabilities = model.predict_proba(np.array(rows))[:, 1]
    results = []
    for site, probability in zip(instances, probabilities, strict=True):
        risk_band = "red" if probability >= 0.65 else "yellow" if probability >= 0.25 else "green"
        results.append(
            {
                "siteId": site["id"],
                "probabilityOfFailure": float(probability),
                "riskBand": risk_band,
                "pgvCmS": site["pgvCmS"],
                "expectedCapacityLostKw": round(site["capacityKw"] * float(probability)),
            }
        )
    return results


def output_fn(prediction: list[dict[str, Any]], accept: str) -> str:
    if accept != "application/json":
        raise ValueError(f"Unsupported accept type: {accept}")
    return json.dumps(prediction)


if __name__ == "__main__":
    model = model_fn(os.environ.get("MODEL_DIR", "model"))
    sample = [{"id": "zen-la-001", "pgvCmS": 61, "installationType": "rooftop", "vs30": 245, "capacityKw": 4200}]
    print(output_fn(predict_fn(sample, model), "application/json"))
