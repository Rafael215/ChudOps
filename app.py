import marimo

__generated_with = "0.23.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import matplotlib.pyplot as plt
    import marimo as mo
    import pandas as pd

    from eda import add_failure_flags, process_data, summarize_processed_data

    return add_failure_flags, mo, plt, process_data, summarize_processed_data


@app.cell
def _(mo):
    mo.md("""
    # The Grid Architect

    Load solar installation and seismic ground-velocity CSVs, then estimate
    which solar sites are exposed above a chosen ground-motion threshold.
    """)
    return


@app.cell
def _(mo):
    solar_path = mo.ui.text(
        label="Solar CSV path",
        value="data/raw/zenpower_solar.csv",
        placeholder="data/raw/zenpower_solar.csv",
    )
    seismic_path = mo.ui.text(
        label="Seismic CSV path",
        value="data/raw/scripps_ground_velocity.csv",
        placeholder="data/raw/scripps_ground_velocity.csv",
    )
    max_distance = mo.ui.slider(
        start=1,
        stop=100,
        step=1,
        value=50,
        label="Maximum solar-to-seismic match distance (km)",
    )
    pgv_threshold = mo.ui.slider(
        start=0.0,
        stop=3.0,
        step=0.05,
        value=1.2,
        label="Failure threshold: peak ground velocity (cm/s)",
    )
    sun_hours = mo.ui.slider(
        start=1.0,
        stop=8.0,
        step=0.25,
        value=5.0,
        label="Average solar production hours per day",
    )
    energy_price = mo.ui.slider(
        start=0.05,
        stop=0.60,
        step=0.01,
        value=0.25,
        label="Electricity value ($/kWh)",
    )
    mo.vstack([solar_path, seismic_path, max_distance, pgv_threshold, sun_hours, energy_price])
    return energy_price, max_distance, pgv_threshold, seismic_path, solar_path, sun_hours


@app.cell
def _(max_distance, mo, process_data, seismic_path, solar_path):
    try:
        processed = process_data(
            solar_path.value,
            seismic_path.value,
            max_match_distance_km=max_distance.value,
        )
        load_error = None
    except Exception as exc:
        processed = None
        load_error = exc

    if load_error:
        mo.callout(
            f"Could not load and process data yet: {load_error}",
            kind="warn",
        )
    else:
        mo.md(f"Loaded `{len(processed):,}` solar sites.")
    return load_error, processed


@app.cell
def _(load_error, mo, processed):
    if load_error or processed is None:
        mo.stop(True)
    return


@app.cell
def _(add_failure_flags, energy_price, pgv_threshold, processed, summarize_processed_data, sun_hours):
    scored = add_failure_flags(
        processed,
        pgv_threshold.value,
        sun_hours_per_day=sun_hours.value,
        energy_price_per_kwh=energy_price.value,
    )
    summary = summarize_processed_data(
        processed,
        pgv_threshold.value,
        sun_hours_per_day=sun_hours.value,
        energy_price_per_kwh=energy_price.value,
    )
    return scored, summary


@app.cell
def _(mo, pgv_threshold, summary):
    mo.hstack(
        [
            mo.stat(label="Solar sites", value=f"{int(summary['total_sites']):,}"),
            mo.stat(label="Matched sites", value=f"{int(summary['matched_sites']):,}"),
            mo.stat(label="Predicted failures", value=f"{int(summary['failed_sites']):,}"),
            mo.stat(label="Failure rate", value=f"{summary['failure_rate']:.1%}"),
            mo.stat(label="Affected capacity", value=f"{summary['affected_capacity_kw']:,.0f} kW"),
            mo.stat(label="Capacity at risk", value=f"{summary['capacity_at_risk_rate']:.1%}"),
            mo.stat(label="Daily energy at risk", value=f"{summary['daily_energy_at_risk_kwh']:,.0f} kWh"),
            mo.stat(
                label="Daily energy value at risk",
                value=f"${summary['daily_energy_value_at_risk_usd']:,.0f}",
            ),
            mo.stat(label="PGV threshold", value=f"{pgv_threshold.value:.2f} cm/s"),
        ]
    )
    return


@app.cell
def _(mo, scored):
    display_columns = [
        column
        for column in [
            "solar_site_id",
            "solar_latitude",
            "solar_longitude",
            "capacity_kw",
            "estimated_pgv",
            "nearest_seismic_distance_km",
            "predicted_failure",
            "capacity_at_risk_kw",
            "daily_energy_at_risk_kwh",
            "daily_energy_value_at_risk_usd",
        ]
        if column in scored.columns
    ]
    mo.ui.table(scored[display_columns].head(100), label="Processed sample")
    return


@app.cell
def _(plt, scored):
    fig, ax = plt.subplots(figsize=(7, 4))
    scored["estimated_pgv"].dropna().hist(ax=ax, bins=30)
    ax.set_title("Estimated peak ground velocity at solar sites")
    ax.set_xlabel("Estimated PGV")
    ax.set_ylabel("Solar site count")
    fig
    return


@app.cell
def _(pgv_threshold, plt, scored):
    plot_df = scored.dropna(subset=["solar_longitude", "solar_latitude", "estimated_pgv"]).copy()
    colors = plot_df["estimated_pgv"] >= pgv_threshold.value

    fig, ax = plt.subplots(figsize=(7, 5))
    scatter = ax.scatter(
        plot_df["solar_longitude"],
        plot_df["solar_latitude"],
        c=colors.map({False: "tab:green", True: "tab:red"}),
        s=25,
        alpha=0.75,
    )
    ax.set_title("Solar sites by failure threshold")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.grid(True, alpha=0.25)
    fig
    return


if __name__ == "__main__":
    app.run()
