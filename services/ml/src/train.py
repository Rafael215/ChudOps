from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


FEATURE_COLUMNS = ["pgv_cm_s", "installation_type_code", "vs30", "capacity_kw"]


def hazus_like_probability(row: pd.Series) -> float:
    soil_term = 0.18 if row["vs30"] < 260 else 0.08 if row["vs30"] < 400 else -0.04
    structure_term = 0.11 if row["installation_type_code"] == 0 else 0.06
    pgv_term = min(row["pgv_cm_s"] / 75.0, 1.0)
    return float(np.clip(pgv_term + soil_term + structure_term, 0.02, 0.98))


def build_training_frame(input_csv: Path | None) -> pd.DataFrame:
    if input_csv and input_csv.exists():
        frame = pd.read_csv(input_csv)
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
    frame["failed"] = np.random.default_rng(7).binomial(1, probabilities)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-csv", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=Path("model"))
    args = parser.parse_args()

    frame = build_training_frame(args.input_csv)
    train, test = train_test_split(frame, test_size=0.2, random_state=42, stratify=frame["failed"])

    model = XGBClassifier(
        n_estimators=180,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(train[FEATURE_COLUMNS], train["failed"])

    probabilities = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    auc = roc_auc_score(test["failed"], probabilities)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output_dir / "model.joblib")
    (args.output_dir / "metrics.json").write_text(f'{{"auc_roc": {auc:.4f}}}\n', encoding="utf-8")
    print(f"Saved model to {args.output_dir}. AUC-ROC={auc:.4f}")


if __name__ == "__main__":
    main()
