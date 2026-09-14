from __future__ import annotations

import json
from pathlib import Path

import numpy as np


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WIDTH = 512
HEIGHT = 256

LON_MIN = 45.0
LON_MAX = 105.0

LAT_MIN = 5.0
LAT_MAX = 30.0

OUTPUT_DIR = Path("fixtures")

FIELD_FILE = OUTPUT_DIR / "synthetic_field.f32"
META_FILE = OUTPUT_DIR / "meta.json"


# ---------------------------------------------------------------------------
# Gaussian eddy
# ---------------------------------------------------------------------------

def gaussian_eddy(
    lon: np.ndarray,
    lat: np.ndarray,
    *,
    center_lon: float,
    center_lat: float,
    amplitude: float,
    sigma_lon: float,
    sigma_lat: float,
) -> np.ndarray:
    """
    Generate a Gaussian-shaped synthetic ocean eddy.
    """

    exponent = (
        ((lon - center_lon) ** 2) / (2.0 * sigma_lon**2)
        + ((lat - center_lat) ** 2) / (2.0 * sigma_lat**2)
    )

    return amplitude * np.exp(-exponent)


# ---------------------------------------------------------------------------
# Generate synthetic field
# ---------------------------------------------------------------------------

def generate_field() -> np.ndarray:
    """
    Generate a deterministic synthetic ocean field.

    The field consists of:
    1. A latitude/longitude gradient.
    2. One positive Gaussian eddy.
    3. One negative Gaussian eddy.
    4. A NaN region representing land.
    """

    longitude = np.linspace(
        LON_MIN,
        LON_MAX,
        WIDTH,
        dtype=np.float64,
    )

    latitude = np.linspace(
        LAT_MIN,
        LAT_MAX,
        HEIGHT,
        dtype=np.float64,
    )

    lon_grid, lat_grid = np.meshgrid(
        longitude,
        latitude,
    )

    # ---------------------------------------------------------------
    # Base latitude/longitude gradient
    # ---------------------------------------------------------------

    field = (
        0.5 * lat_grid
        + 0.1 * lon_grid
    )

    # ---------------------------------------------------------------
    # Positive Gaussian eddy
    # ---------------------------------------------------------------

    field += gaussian_eddy(
        lon_grid,
        lat_grid,
        center_lon=65.0,
        center_lat=15.0,
        amplitude=10.0,
        sigma_lon=3.0,
        sigma_lat=2.0,
    )

    # ---------------------------------------------------------------
    # Negative Gaussian eddy
    # ---------------------------------------------------------------

    field += gaussian_eddy(
        lon_grid,
        lat_grid,
        center_lon=90.0,
        center_lat=23.0,
        amplitude=-8.0,
        sigma_lon=4.0,
        sigma_lat=3.0,
    )

    # ---------------------------------------------------------------
    # NaN landmask
    # ---------------------------------------------------------------

    landmask = (
        (lon_grid >= 75.0)
        & (lon_grid <= 82.0)
        & (lat_grid >= 20.0)
        & (lat_grid <= 27.0)
    )

    field[landmask] = np.nan

    # The fixture contract uses Float32 values.
    return field.astype(np.float32)


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

def build_metadata() -> dict[str, object]:
    """
    Build metadata describing the generated field.
    """

    return {
        "width": WIDTH,
        "height": HEIGHT,
        "dtype": "float32",
        "lon_min": LON_MIN,
        "lon_max": LON_MAX,
        "lat_min": LAT_MIN,
        "lat_max": LAT_MAX,
    }


# ---------------------------------------------------------------------------
# Write files
# ---------------------------------------------------------------------------

def write_fixture(field: np.ndarray) -> None:
    """
    Write the Float32 binary field and JSON metadata.
    """

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Write raw Float32 values.
    field.tofile(FIELD_FILE)

    # Write metadata.
    META_FILE.write_text(
        json.dumps(
            build_metadata(),
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Validate output
# ---------------------------------------------------------------------------

def validate_fixture(field: np.ndarray) -> None:
    """
    Validate the generated fixture.
    """

    expected_shape = (
        HEIGHT,
        WIDTH,
    )

    if field.shape != expected_shape:
        raise ValueError(
            f"Unexpected shape: {field.shape}; "
            f"expected {expected_shape}"
        )

    if field.dtype != np.float32:
        raise ValueError(
            f"Unexpected dtype: {field.dtype}; "
            "expected float32"
        )

    nan_count = int(np.isnan(field).sum())

    if nan_count == 0:
        raise ValueError(
            "The generated field contains no NaN landmask."
        )

    expected_bytes = (
        WIDTH
        * HEIGHT
        * np.dtype(np.float32).itemsize
    )

    actual_bytes = FIELD_FILE.stat().st_size

    if actual_bytes != expected_bytes:
        raise ValueError(
            f"Unexpected binary size: {actual_bytes}; "
            f"expected {expected_bytes}"
        )

    if not META_FILE.exists():
        raise ValueError(
            "meta.json was not generated."
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("Generating synthetic ocean field...")

    field = generate_field()

    write_fixture(field)

    validate_fixture(field)

    print()
    print(f"Shape      : {field.shape}")
    print(f"Dtype      : {field.dtype}")
    print(f"NaN count  : {np.isnan(field).sum()}")
    print(f"Min value  : {np.nanmin(field):.4f}")
    print(f"Max value  : {np.nanmax(field):.4f}")
    print(f"Field      : {FIELD_FILE}")
    print(f"Metadata   : {META_FILE}")
    print()
    print("Synthetic field generated successfully.")


if __name__ == "__main__":
    main()