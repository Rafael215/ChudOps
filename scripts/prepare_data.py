from __future__ import annotations

import argparse
import sys
from pathlib import Path

import h5py
import numpy as np
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

DEFAULT_SOLAR_INPUT = Path("external/zenpower/DataHacks-ZenPower-Challenge-Spring-2026-main/records.csv")
DEFAULT_SOLAR_OUTPUT = Path("data/raw/zenpower_solar.csv")
DEFAULT_SCRIPPS_INPUT = Path("external/scripps/loh.hdf5")
DEFAULT_SCRIPPS_OUTPUT = Path("data/raw/scripps_ground_velocity.csv")
DEFAULT_PROCESSED_DIR = Path("data/processed")


def prepare_zenpower_records(input_path: Path, output_path: Path) -> pd.DataFrame:
    solar = pd.read_csv(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    solar.to_csv(output_path, index=False)
    return solar


def export_scripps_loh_to_csv(
    input_path: Path,
    output_path: Path,
    solar: pd.DataFrame,
    map_index: int,
) -> pd.DataFrame:
    """
    Export one Scripps LOH PGV map to CSV.

    The LOH demo grid is in local easting/northing kilometers, not direct
    latitude/longitude. For the hackathon demo, we scale that grid over the
    ZenPower solar bounding box so the UI can spatially join both datasets.
    Replace this with official georeferencing if the challenge provides it.
    """
    solar_geo = solar.dropna(subset=["latitude", "longitude"]).copy()
    if solar_geo.empty:
        raise ValueError("ZenPower records must include usable latitude and longitude values.")

    lat_min, lat_max = solar_geo["latitude"].quantile([0.01, 0.99])
    lon_min, lon_max = solar_geo["longitude"].quantile([0.01, 0.99])

    with h5py.File(input_path, "r") as scripps:
        pgv_m_s = np.asarray(scripps["data"][map_index]).reshape(60, 60).T
        params = np.asarray(scripps["params"][map_index])

    lat_grid = np.linspace(lat_min, lat_max, pgv_m_s.shape[0])
    lon_grid = np.linspace(lon_min, lon_max, pgv_m_s.shape[1])
    longitude, latitude = np.meshgrid(lon_grid, lat_grid)

    seismic = pd.DataFrame(
        {
            "seismic_point_id": [f"loh_{map_index}_{i:04d}" for i in range(pgv_m_s.size)],
            "seismic_latitude": latitude.ravel(),
            "seismic_longitude": longitude.ravel(),
            "pgv": (100.0 * pgv_m_s).ravel(),
            "scenario_id": f"loh_map_{map_index}",
            "source_depth": params[0],
            "source_strike": params[1],
            "source_dip": params[2],
            "source_rake": params[3],
        }
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    seismic.to_csv(output_path, index=False)
    return seismic


def normalize_backend_handoff(
    solar_path: Path,
    seismic_path: Path,
    output_dir: Path,
    max_match_distance_km: float,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    from eda import process_data

    processed = process_data(
        solar_path,
        seismic_path,
        max_match_distance_km=max_match_distance_km,
    )
    matched = processed[processed["estimated_pgv"].notna()].copy()

    site_ids = matched["solar_site_id"].astype(str).map(_stable_site_id)
    installation_types = matched.apply(_infer_installation_type, axis=1)
    vs30 = matched.apply(lambda row: _estimate_vs30(row, installation_types.loc[row.name]), axis=1)

    sites = pd.DataFrame(
        {
            "site_id": site_ids,
            "name": matched.apply(_site_name, axis=1),
            "latitude": matched["solar_latitude"].round(6),
            "longitude": matched["solar_longitude"].round(6),
            "capacity_kw": pd.to_numeric(matched["capacity_kw"], errors="coerce").fillna(0.0).round(3),
            "installation_type": installation_types,
            "vs30": vs30.round(0).astype(int),
        }
    )

    scenario_id = _stable_scenario_id(matched)
    scenario = pd.DataFrame(
        [
            {
                "scenario_id": scenario_id,
                "name": "Scripps LOH PGV Map 1",
                "magnitude": 0.0,
                "epicenter_latitude": float(matched["nearest_seismic_latitude"].mean().round(6)),
                "epicenter_longitude": float(matched["nearest_seismic_longitude"].mean().round(6)),
                "source": "Scripps SIO physics-based LOH ground velocity simulation",
                "description": (
                    "Prototype seismic exposure scenario from Scripps LOH PGV map 1 with "
                    "grid-center proxy coordinates and magnitude unavailable in source artifact."
                ),
            }
        ]
    )

    scenario_features = pd.DataFrame(
        {
            "scenario_id": scenario_id,
            "site_id": site_ids,
            "pgv_cm_s": pd.to_numeric(matched["estimated_pgv"], errors="coerce").round(6),
        }
    )

    _validate_backend_outputs(sites, scenario, scenario_features)
    output_dir.mkdir(parents=True, exist_ok=True)
    sites.to_csv(output_dir / "sites.csv", index=False)
    scenario.to_csv(output_dir / "scenarios.csv", index=False)
    scenario_features.to_csv(output_dir / "scenario_features.csv", index=False)
    return sites, scenario, scenario_features


def _stable_site_id(raw_id: str) -> str:
    safe = "".join(char.lower() if char.isalnum() else "-" for char in raw_id.strip())
    safe = "-".join(part for part in safe.split("-") if part)
    return f"zen-{safe}"


def _stable_scenario_id(matched: pd.DataFrame) -> str:
    scenario = str(matched["nearest_scenario_id"].iloc[0])
    safe = "".join(char.lower() if char.isalnum() else "-" for char in scenario.strip())
    safe = "-".join(part for part in safe.split("-") if part)
    return f"scripps-{safe}"


def _site_name(row: pd.Series) -> str:
    city = str(row.get("city", "unknown")).strip().title() or "Unknown"
    capacity = pd.to_numeric(row.get("capacity_kw", 0.0), errors="coerce")
    capacity_text = "0.0" if pd.isna(capacity) else f"{capacity:.1f}"
    short_id = _stable_site_id(str(row["solar_site_id"]))[-8:]
    return _clean_text(f"{city} Solar Site {short_id} {capacity_text} kW")


def _clean_text(value: str) -> str:
    return " ".join(value.replace(",", " ").split())


def _infer_installation_type(row: pd.Series) -> str:
    text = " ".join(
        str(row.get(column, ""))
        for column in ("permit_type", "full_address", "property_type", "description")
    ).lower()
    capacity = pd.to_numeric(row.get("capacity_kw", 0.0), errors="coerce")
    capacity = 0.0 if pd.isna(capacity) else float(capacity)

    if "ground" in text or capacity >= 250.0:
        return "ground_mount"
    return "rooftop"


def _estimate_vs30(row: pd.Series, installation_type: str) -> float:
    """
    Deterministic placeholder until USGS Vs30 is joined.

    Values are kept in plausible engineering ranges and vary by location/type so
    the backend can exercise numeric ML inputs without treating Vs30 as missing.
    """
    lat = float(row["solar_latitude"])
    lon = float(row["solar_longitude"])
    base = 560.0 if installation_type == "ground_mount" else 300.0
    regional_adjustment = 8.0 * (lat - 34.0) + 2.0 * (lon + 118.0)
    return float(np.clip(base + regional_adjustment, 180.0, 760.0))


def _validate_backend_outputs(
    sites: pd.DataFrame,
    scenarios: pd.DataFrame,
    scenario_features: pd.DataFrame,
) -> None:
    site_columns = ["site_id", "name", "latitude", "longitude", "capacity_kw", "installation_type", "vs30"]
    scenario_columns = [
        "scenario_id",
        "name",
        "magnitude",
        "epicenter_latitude",
        "epicenter_longitude",
        "source",
        "description",
    ]
    feature_columns = ["scenario_id", "site_id", "pgv_cm_s"]

    _require_exact_columns(sites, site_columns, "sites")
    _require_exact_columns(scenarios, scenario_columns, "scenarios")
    _require_exact_columns(scenario_features, feature_columns, "scenario_features")

    if not sites["site_id"].is_unique:
        raise ValueError("sites.site_id must be unique.")
    if not set(sites["installation_type"]).issubset({"rooftop", "ground_mount"}):
        raise ValueError("sites.installation_type must be rooftop or ground_mount.")

    numeric_checks = [
        (sites, ["latitude", "longitude", "capacity_kw", "vs30"]),
        (scenarios, ["magnitude", "epicenter_latitude", "epicenter_longitude"]),
        (scenario_features, ["pgv_cm_s"]),
    ]
    for frame, columns in numeric_checks:
        for column in columns:
            values = pd.to_numeric(frame[column], errors="coerce")
            if values.isna().any():
                raise ValueError(f"{column} must be numeric and non-null.")

    site_ids = set(sites["site_id"])
    scenario_ids = set(scenarios["scenario_id"])
    if not set(scenario_features["site_id"]).issubset(site_ids):
        raise ValueError("scenario_features.site_id must match sites.site_id.")
    if not set(scenario_features["scenario_id"]).issubset(scenario_ids):
        raise ValueError("scenario_features.scenario_id must match scenarios.scenario_id.")

    for name, frame in (
        ("sites", sites),
        ("scenarios", scenarios),
        ("scenario_features", scenario_features),
    ):
        if frame.astype(str).apply(lambda column: column.str.contains(",", regex=False)).any().any():
            raise ValueError(f"{name} contains commas; importer uses a simple CSV parser.")


def _require_exact_columns(frame: pd.DataFrame, columns: list[str], name: str) -> None:
    if list(frame.columns) != columns:
        raise ValueError(f"{name} columns must be {columns}; got {list(frame.columns)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare starter Grid Architect data files.")
    parser.add_argument("--solar-input", type=Path, default=DEFAULT_SOLAR_INPUT)
    parser.add_argument("--solar-output", type=Path, default=DEFAULT_SOLAR_OUTPUT)
    parser.add_argument("--scripps-input", type=Path, default=DEFAULT_SCRIPPS_INPUT)
    parser.add_argument("--scripps-output", type=Path, default=DEFAULT_SCRIPPS_OUTPUT)
    parser.add_argument("--map-index", type=int, default=1)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    parser.add_argument("--max-match-distance-km", type=float, default=50.0)
    parser.add_argument(
        "--skip-raw-prep",
        action="store_true",
        help="Use existing data/raw CSVs and only regenerate data/processed CSVs.",
    )
    args = parser.parse_args()

    if args.skip_raw_prep:
        solar = pd.read_csv(args.solar_output)
        seismic = pd.read_csv(args.scripps_output)
    else:
        solar = prepare_zenpower_records(args.solar_input, args.solar_output)
        seismic = export_scripps_loh_to_csv(
            args.scripps_input,
            args.scripps_output,
            solar=solar,
            map_index=args.map_index,
        )

    print(f"Wrote {len(solar):,} ZenPower rows to {args.solar_output}")
    print(f"Wrote {len(seismic):,} Scripps PGV points to {args.scripps_output}")

    sites, scenarios, scenario_features = normalize_backend_handoff(
        args.solar_output,
        args.scripps_output,
        output_dir=args.processed_dir,
        max_match_distance_km=args.max_match_distance_km,
    )
    print(f"Wrote {len(sites):,} normalized sites to {args.processed_dir / 'sites.csv'}")
    print(f"Wrote {len(scenarios):,} scenarios to {args.processed_dir / 'scenarios.csv'}")
    print(
        f"Wrote {len(scenario_features):,} scenario features to "
        f"{args.processed_dir / 'scenario_features.csv'}"
    )


if __name__ == "__main__":
    main()
