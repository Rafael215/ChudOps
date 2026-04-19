from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree


EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class ColumnSpec:
    canonical: str
    candidates: tuple[str, ...]


SOLAR_COLUMN_SPECS = (
    ColumnSpec("solar_site_id", ("site_id", "id", "system_id", "installation_id", "project_id", "permit_id")),
    ColumnSpec("solar_latitude", ("latitude", "lat", "y", "site_latitude", "solar_latitude")),
    ColumnSpec("solar_longitude", ("longitude", "lon", "lng", "x", "site_longitude", "solar_longitude")),
    ColumnSpec("capacity_kw", ("capacity_kw", "system_size_kw", "dc_capacity_kw", "size_kw", "kw", "kilowatt_value")),
)

SEISMIC_COLUMN_SPECS = (
    ColumnSpec("seismic_point_id", ("point_id", "id", "station_id", "grid_id", "node_id")),
    ColumnSpec("seismic_latitude", ("latitude", "lat", "y", "seismic_latitude")),
    ColumnSpec("seismic_longitude", ("longitude", "lon", "lng", "x", "seismic_longitude")),
    ColumnSpec("pgv", ("pgv", "ground_velocity", "peak_ground_velocity", "peak_ground_velocity_cm_s", "velocity")),
    ColumnSpec("scenario_id", ("scenario_id", "event_id", "earthquake_id", "simulation_id")),
)


def load_csv(path: str | Path) -> pd.DataFrame:
    """Load a CSV and normalize raw column names."""
    path = Path(path).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"Could not find CSV: {path}")

    df = pd.read_csv(path)
    df.columns = [_normalize_column_name(column) for column in df.columns]
    return df


def clean_solar_data(path_or_df: str | Path | pd.DataFrame) -> pd.DataFrame:
    """Load and clean solar installation data."""
    df = _ensure_dataframe(path_or_df)
    df = _rename_known_columns(df, SOLAR_COLUMN_SPECS)
    _require_columns(df, ("solar_latitude", "solar_longitude"), dataset_name="solar")

    df = _coerce_numeric(df, ("solar_latitude", "solar_longitude", "capacity_kw"))
    df = _drop_invalid_coordinates(df, "solar_latitude", "solar_longitude")

    if "solar_site_id" not in df.columns:
        df["solar_site_id"] = [f"solar_{i:05d}" for i in range(len(df))]

    if "capacity_kw" in df.columns:
        df["capacity_kw"] = df["capacity_kw"].fillna(df["capacity_kw"].median())

    df = _fill_remaining_missing_values(df)
    return df.reset_index(drop=True)


def clean_seismic_data(path_or_df: str | Path | pd.DataFrame) -> pd.DataFrame:
    """Load and clean seismic ground-motion data."""
    df = _ensure_dataframe(path_or_df)
    df = _rename_known_columns(df, SEISMIC_COLUMN_SPECS)
    _require_columns(df, ("seismic_latitude", "seismic_longitude", "pgv"), dataset_name="seismic")

    df = _coerce_numeric(df, ("seismic_latitude", "seismic_longitude", "pgv"))
    df = _drop_invalid_coordinates(df, "seismic_latitude", "seismic_longitude")
    df = df.dropna(subset=["pgv"]).copy()

    if "seismic_point_id" not in df.columns:
        df["seismic_point_id"] = [f"seismic_{i:05d}" for i in range(len(df))]

    if "scenario_id" not in df.columns:
        df["scenario_id"] = "default_scenario"

    df = _fill_remaining_missing_values(df)
    return df.reset_index(drop=True)


def process_data(
    solar_path: str | Path,
    seismic_path: str | Path,
    max_match_distance_km: float = 25.0,
) -> pd.DataFrame:
    """Clean both datasets and attach nearest seismic ground velocity to each solar site."""
    solar = clean_solar_data(solar_path)
    seismic = clean_seismic_data(seismic_path)
    return merge_nearest_seismic_site(solar, seismic, max_match_distance_km=max_match_distance_km)


def merge_nearest_seismic_site(
    solar: pd.DataFrame,
    seismic: pd.DataFrame,
    max_match_distance_km: float = 25.0,
) -> pd.DataFrame:
    """
    Attach the nearest seismic point to each solar site.

    This is a practical placeholder merge for early EDA. Later, replace or extend it
    with a more physically meaningful spatial interpolation strategy if needed.
    """
    _require_columns(solar, ("solar_latitude", "solar_longitude"), dataset_name="solar")
    _require_columns(seismic, ("seismic_latitude", "seismic_longitude", "pgv"), dataset_name="seismic")

    solar_coords = np.radians(solar[["solar_latitude", "solar_longitude"]].to_numpy())
    seismic_coords = np.radians(seismic[["seismic_latitude", "seismic_longitude"]].to_numpy())

    tree = BallTree(seismic_coords, metric="haversine")
    distances_rad, indices = tree.query(solar_coords, k=1)

    nearest = seismic.iloc[indices.flatten()].reset_index(drop=True).add_prefix("nearest_")
    merged = pd.concat([solar.reset_index(drop=True), nearest], axis=1)
    merged["nearest_seismic_distance_km"] = distances_rad.flatten() * EARTH_RADIUS_KM
    merged["matched_within_distance"] = merged["nearest_seismic_distance_km"] <= max_match_distance_km
    merged["estimated_pgv"] = np.where(
        merged["matched_within_distance"],
        merged["nearest_pgv"],
        np.nan,
    )
    return merged


def add_failure_flags(
    processed: pd.DataFrame,
    pgv_threshold: float,
    sun_hours_per_day: float = 5.0,
    energy_price_per_kwh: float = 0.25,
) -> pd.DataFrame:
    """Add simple exposure, capacity, and energy value flags."""
    df = processed.copy()
    if "estimated_pgv" not in df.columns:
        raise ValueError("processed data must include estimated_pgv")
    df["predicted_failure"] = df["estimated_pgv"] >= pgv_threshold
    if "capacity_kw" in df.columns:
        capacity = pd.to_numeric(df["capacity_kw"], errors="coerce").fillna(0.0)
        df["capacity_at_risk_kw"] = np.where(df["predicted_failure"], capacity, 0.0)
        df["daily_energy_at_risk_kwh"] = df["capacity_at_risk_kw"] * sun_hours_per_day
        df["daily_energy_value_at_risk_usd"] = (
            df["daily_energy_at_risk_kwh"] * energy_price_per_kwh
        )
    return df


def summarize_processed_data(
    processed: pd.DataFrame,
    pgv_threshold: float,
    sun_hours_per_day: float = 5.0,
    energy_price_per_kwh: float = 0.25,
) -> dict[str, float]:
    """Return small metrics for the demo UI."""
    scored = add_failure_flags(
        processed,
        pgv_threshold,
        sun_hours_per_day=sun_hours_per_day,
        energy_price_per_kwh=energy_price_per_kwh,
    )
    valid = scored["estimated_pgv"].notna()
    total_sites = len(scored)
    matched_sites = int(valid.sum())
    failed_sites = int(scored.loc[valid, "predicted_failure"].sum())
    failure_rate = failed_sites / matched_sites if matched_sites else 0.0

    capacity = pd.to_numeric(scored.get("capacity_kw", 0.0), errors="coerce").fillna(0.0)
    matched_capacity_kw = float(capacity.loc[valid].sum())
    affected_capacity_kw = float(capacity.loc[valid & scored["predicted_failure"]].sum())
    capacity_at_risk_rate = affected_capacity_kw / matched_capacity_kw if matched_capacity_kw else 0.0
    daily_energy_at_risk_kwh = affected_capacity_kw * sun_hours_per_day
    daily_energy_value_at_risk_usd = daily_energy_at_risk_kwh * energy_price_per_kwh

    return {
        "total_sites": float(total_sites),
        "matched_sites": float(matched_sites),
        "failed_sites": float(failed_sites),
        "failure_rate": float(failure_rate),
        "matched_capacity_kw": matched_capacity_kw,
        "affected_capacity_kw": affected_capacity_kw,
        "capacity_at_risk_rate": float(capacity_at_risk_rate),
        "daily_energy_at_risk_kwh": float(daily_energy_at_risk_kwh),
        "daily_energy_value_at_risk_usd": float(daily_energy_value_at_risk_usd),
        "sun_hours_per_day": float(sun_hours_per_day),
        "energy_price_per_kwh": float(energy_price_per_kwh),
    }


def _ensure_dataframe(path_or_df: str | Path | pd.DataFrame) -> pd.DataFrame:
    if isinstance(path_or_df, pd.DataFrame):
        df = path_or_df.copy()
        df.columns = [_normalize_column_name(column) for column in df.columns]
        return df
    return load_csv(path_or_df)


def _normalize_column_name(column: object) -> str:
    return str(column).strip().lower().replace(" ", "_").replace("-", "_")


def _rename_known_columns(df: pd.DataFrame, specs: Iterable[ColumnSpec]) -> pd.DataFrame:
    df = df.copy()
    rename_map: dict[str, str] = {}
    existing = set(df.columns)

    for spec in specs:
        if spec.canonical in existing:
            continue
        for candidate in spec.candidates:
            normalized = _normalize_column_name(candidate)
            if normalized in existing:
                rename_map[normalized] = spec.canonical
                break

    return df.rename(columns=rename_map)


def _require_columns(df: pd.DataFrame, columns: Iterable[str], dataset_name: str) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        available = ", ".join(df.columns)
        required = ", ".join(missing)
        raise ValueError(f"Missing required {dataset_name} columns: {required}. Available columns: {available}")


def _coerce_numeric(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    df = df.copy()
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def _drop_invalid_coordinates(df: pd.DataFrame, lat_col: str, lon_col: str) -> pd.DataFrame:
    before = len(df)
    df = df.dropna(subset=[lat_col, lon_col]).copy()
    df = df[df[lat_col].between(-90, 90) & df[lon_col].between(-180, 180)].copy()
    dropped = before - len(df)
    if dropped:
        print(f"Dropped {dropped} rows with missing or invalid coordinates.")
    return df


def _fill_remaining_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    text_cols = df.select_dtypes(exclude=[np.number]).columns

    for column in numeric_cols:
        if df[column].isna().any():
            df[column] = df[column].fillna(df[column].median())

    for column in text_cols:
        if df[column].isna().any():
            df[column] = df[column].fillna("unknown")

    return df


if __name__ == "__main__":
    print("Use process_data(solar_path, seismic_path) from app.py or an interactive Python session.")
