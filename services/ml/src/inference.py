from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any


FEATURE_COLUMNS = ["pgv_cm_s", "installation_type_code", "vs30", "capacity_kw"]


def model_fn(model_dir: str) -> Any:
    model_path = Path(model_dir)
    try:
        import joblib

        return {
            "kind": "sklearn",
            "model": joblib.load(model_path / "model.joblib"),
            "portable": json.loads((model_path / "model.json").read_text(encoding="utf-8")),
        }
    except Exception:
        return {
            "kind": "portable",
            "portable": json.loads((model_path / "model.json").read_text(encoding="utf-8")),
        }


def input_fn(request_body: str, content_type: str) -> list[dict[str, Any]]:
    if content_type != "application/json":
        raise ValueError(f"Unsupported content type: {content_type}")
    payload = json.loads(request_body)
    return payload["instances"]


def tree_value(tree: dict[str, Any], row: list[float]) -> float:
    node = 0
    while tree["children_left"][node] != -1:
        feature_index = tree["feature"][node]
        threshold = tree["threshold"][node]
        node = tree["children_left"][node] if row[feature_index] <= threshold else tree["children_right"][node]
    return float(tree["value"][node][0])


def predict_probability(site: dict[str, Any], model: dict[str, Any]) -> float:
    row = [
        float(site["pgvCmS"]),
        0.0 if site["installationType"] == "rooftop" else 1.0,
        float(site["vs30"]),
        float(site["capacityKw"]),
    ]
    portable_model = model["portable"] if "portable" in model else model
    prior = min(max(float(portable_model["initPrior"]), 1e-6), 1 - 1e-6)
    raw_score = math.log(prior / (1 - prior))
    for tree in portable_model["trees"]:
        raw_score += float(portable_model["learningRate"]) * tree_value(tree, row)
    return 1 / (1 + math.exp(-raw_score))


def drivers_for(site: dict[str, Any]) -> tuple[str, str]:
    pgv = float(site["pgvCmS"])
    vs30 = float(site["vs30"])
    if pgv >= 50:
        primary = "PGV"
    elif vs30 < 260:
        primary = "SOFT SEDIMENT"
    else:
        primary = "PGV"

    if vs30 < 260:
        secondary = "SOFT SEDIMENT"
    elif site["installationType"] == "rooftop":
        secondary = "ROOFTOP FRAGILITY"
    else:
        secondary = "CAPACITY EXPOSURE"
    return primary, secondary


def features_for(instances: list[dict[str, Any]]) -> Any:
    rows = [
        [
            float(site["pgvCmS"]),
            0.0 if site["installationType"] == "rooftop" else 1.0,
            float(site["vs30"]),
            float(site["capacityKw"]),
        ]
        for site in instances
    ]
    try:
        import numpy as np

        return np.asarray(rows, dtype=float)
    except Exception:
        return rows


def predict_probabilities(instances: list[dict[str, Any]], model: Any) -> list[float]:
    if isinstance(model, dict) and model.get("kind") == "sklearn":
        probabilities = model["model"].predict_proba(features_for(instances))[:, 1]
        return [float(value) for value in probabilities]
    return [predict_probability(site, model) for site in instances]


def predict_fn(instances: list[dict[str, Any]], model: Any) -> list[dict[str, Any]]:
    results = []
    probabilities = predict_probabilities(instances, model)
    for site, probability in zip(instances, probabilities):
        risk_band = "red" if probability >= 0.65 else "yellow" if probability >= 0.25 else "green"
        primary_driver, secondary_driver = drivers_for(site)
        results.append(
            {
                "siteId": site["id"],
                "probabilityOfFailure": float(probability),
                "riskBand": risk_band,
                "pgvCmS": site["pgvCmS"],
                "expectedCapacityLostKw": round(site["capacityKw"] * float(probability)),
                "primaryDriver": primary_driver,
                "secondaryDriver": secondary_driver,
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
