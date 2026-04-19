from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split


FEATURE_COLUMNS = ["pgv_cm_s", "installation_type_code", "vs30", "capacity_kw"]


def hazus_like_probability(row: pd.Series) -> float:
    soil_term = 0.18 if row["vs30"] < 260 else 0.08 if row["vs30"] < 400 else -0.04
    structure_term = 0.11 if row["installation_type_code"] == 0 else 0.06
    pgv_term = min(row["pgv_cm_s"] / 75.0, 1.0)
    return float(np.clip(pgv_term + soil_term + structure_term, 0.02, 0.98))


def build_training_frame(
    input_csv: Path | None,
    sites_csv: Path | None,
    features_csv: Path | None,
    stress_multiplier: float
) -> pd.DataFrame:
    if input_csv and input_csv.exists():
        frame = pd.read_csv(input_csv)
    elif sites_csv and features_csv and sites_csv.exists() and features_csv.exists():
        sites = pd.read_csv(sites_csv)
        features = pd.read_csv(features_csv)
        frame = features.merge(sites, on="site_id", how="inner")
        frame = frame.rename(columns={"pgv_cm_s": "pgv_cm_s", "capacity_kw": "capacity_kw"})
        frame["installation_type_code"] = (frame["installation_type"] != "rooftop").astype(int)
        frame = frame[["pgv_cm_s", "installation_type_code", "vs30", "capacity_kw"]]

        stress = frame.copy()
        stress["pgv_cm_s"] = stress["pgv_cm_s"] * stress_multiplier
        frame = pd.concat([frame, stress], ignore_index=True)
    else:
        rng = np.random.default_rng(42)
        frame = pd.DataFrame(
            {
                "pgv_cm_s": rng.uniform(2, 90, 5000),
                "installation_type_code": rng.integers(0, 2, 5000),
                "vs30": rng.uniform(150, 850, 5000),
                "capacity_kw": rng.lognormal(mean=8.2, sigma=0.85, size=5000),
            }
        )

    probabilities = frame.apply(hazus_like_probability, axis=1)
    frame["label_probability"] = probabilities
    frame["failed"] = np.random.default_rng(7).binomial(1, probabilities)
    return frame


def export_tree(tree: Any) -> dict[str, Any]:
    return {
        "children_left": tree.children_left.tolist(),
        "children_right": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": tree.threshold.tolist(),
        "value": tree.value.reshape(tree.node_count, -1).tolist()
    }


def export_portable_model(model: GradientBoostingClassifier, output_path: Path, metrics: dict[str, Any], feature_importance: list[dict[str, float]]) -> None:
    output = {
        "modelType": "gradient_boosted_trees",
        "modelName": "SeismicSentry GBT Failure Model",
        "modelVersion": metrics["model_version"],
        "featureColumns": FEATURE_COLUMNS,
        "learningRate": model.learning_rate,
        "initPrior": float(model.init_.class_prior_[1]),
        "trees": [export_tree(estimator[0].tree_) for estimator in model.estimators_],
        "metrics": metrics,
        "featureImportance": feature_importance
    }
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-csv", type=Path, default=None)
    parser.add_argument("--sites-csv", type=Path, default=Path("data/processed/sites.csv"))
    parser.add_argument("--features-csv", type=Path, default=Path("data/processed/scenario_features.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("model"))
    parser.add_argument("--stress-multiplier", type=float, default=45.0)
    args = parser.parse_args()

    frame = build_training_frame(args.input_csv, args.sites_csv, args.features_csv, args.stress_multiplier)
    train, test = train_test_split(frame, test_size=0.2, random_state=42, stratify=frame["failed"])

    model = GradientBoostingClassifier(
        n_estimators=220,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        random_state=42,
    )
    model.fit(train[FEATURE_COLUMNS], train["failed"])

    probabilities = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    auc = roc_auc_score(test["failed"], probabilities)
    importances = model.feature_importances_
    feature_importance = [
        {"feature": feature, "importance": float(importance)}
        for feature, importance in sorted(zip(FEATURE_COLUMNS, importances, strict=True), key=lambda item: item[1], reverse=True)
    ]
    model_version = pd.Timestamp.utcnow().strftime("seismic-sentry-gbt-%Y%m%d%H%M%S")
    metrics = {
        "auc_roc": round(float(auc), 4),
        "training_rows": int(len(frame)),
        "model_version": model_version,
        "stress_multiplier": args.stress_multiplier
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output_dir / "model.joblib")
    (args.output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (args.output_dir / "feature_importance.json").write_text(json.dumps(feature_importance, indent=2), encoding="utf-8")
    export_portable_model(model, args.output_dir / "model.json", metrics, feature_importance)
    print(f"Saved model to {args.output_dir}. AUC-ROC={auc:.4f}")


if __name__ == "__main__":
    main()
