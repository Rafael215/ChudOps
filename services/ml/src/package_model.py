from __future__ import annotations

import argparse
import tarfile
from pathlib import Path


def add_file(archive: tarfile.TarFile, source: Path, target: str) -> None:
    if not source.exists():
        raise FileNotFoundError(f"Missing model package file: {source}")
    archive.add(source, arcname=target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, default=Path("model"))
    parser.add_argument("--inference-script", type=Path, default=Path("services/ml/src/inference.py"))
    parser.add_argument("--output", type=Path, default=Path("outputs/model.tar.gz"))
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.output, "w:gz") as archive:
        add_file(archive, args.model_dir / "model.joblib", "model.joblib")
        add_file(archive, args.model_dir / "model.json", "model.json")
        add_file(archive, args.model_dir / "metrics.json", "metrics.json")
        add_file(archive, args.model_dir / "feature_importance.json", "feature_importance.json")
        add_file(archive, args.inference_script, "code/inference.py")

    print(f"Wrote SageMaker model artifact to {args.output}")


if __name__ == "__main__":
    main()
