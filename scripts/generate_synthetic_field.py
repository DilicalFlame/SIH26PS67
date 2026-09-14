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

# Mirrors the one worked example in contracts §4.3
# ("{tilesBase}/fields/glorys_thetao/temperature/d{d}_t{t}.f32"), so this
# fixture drops straight into the layout §2 and §4.3 describe.
PRODUCT_ID = "glorys_thetao"
VARIABLE = "temperature"
UNITS = "degC"
DEPTHS = [0.0]
TIMES = ["2020-01-01T00:00:00Z"]

# Fixtures live at the repo root per contracts §6 ("Fixtures live in
# fixtures/ at repo root and are shared by both [frontend and backend]"),
# resolved from this file's own location rather than the caller's cwd, so
# `python scripts/generate_synthetic_field.py` and
# `python generate_synthetic_field.py` (run from inside scripts/) land in
# the same place instead of silently forking into scripts/fixtures/.
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "fixtures" / "fields" / PRODUCT_ID / VARIABLE

# Positional naming per §2: d<depth_index>_t<time_index>.f32 — index into
# DEPTHS/TIMES, not the values themselves. One depth, one time here.
FIELD_FILE = OUTPUT_DIR / "d0_t0.f32"
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

    # Decreasing (LAT_MAX -> LAT_MIN): contracts §2 requires row-major byte
    # order "starting at the north-west corner", i.e. row 0 is the
    # northernmost row. linspace(LAT_MIN, LAT_MAX, ...) would put the
    # southernmost row first instead.
    latitude = np.linspace(
        LAT_MAX,
        LAT_MIN,
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

    # §2: "raw little-endian Float32 grid" — force it explicitly rather than
    # relying on the host's native byte order (little-endian on every
    # realistic dev/CI machine here, but not guaranteed by plain float32).
    return field.astype("<f4")


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

def build_metadata(field: np.ndarray) -> dict[str, object]:
    """
    Build a ScalarFieldMeta object (contracts §4.3) describing the field.
    """

    return {
        "layerId": PRODUCT_ID,
        "variable": VARIABLE,
        "units": UNITS,
        "width": WIDTH,
        "height": HEIGHT,
        "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
        "depths": DEPTHS,
        "times": TIMES,
        "valueMin": float(np.nanmin(field)),
        "valueMax": float(np.nanmax(field)),
        "noDataValue": "NaN",
        "gridUrlTemplate": f"{{tilesBase}}/fields/{PRODUCT_ID}/{VARIABLE}/d{{d}}_t{{t}}.f32",
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
            build_metadata(field),
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Validate output
# ---------------------------------------------------------------------------

def validate_fixture(field: np.ndarray) -> None:
    """
    Validate the generated fixture against contracts §2 / §4.3.
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

    if field.dtype != np.dtype("<f4"):
        raise ValueError(
            f"Unexpected dtype: {field.dtype}; "
            "expected little-endian float32"
        )

    nan_count = int(np.isnan(field).sum())

    if nan_count == 0:
        raise ValueError(
            "The generated field contains no NaN landmask."
        )

    expected_bytes = (
        WIDTH
        * HEIGHT
        * np.dtype("<f4").itemsize
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

    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    required_keys = {
        "layerId", "variable", "units", "width", "height", "bbox",
        "depths", "times", "valueMin", "valueMax", "noDataValue",
        "gridUrlTemplate",
    }
    missing = required_keys - meta.keys()
    if missing:
        raise ValueError(f"meta.json is missing ScalarFieldMeta keys: {sorted(missing)}")

    # Row 0 must be the north-west corner (§2): at the west edge, row 0
    # should equal the gradient's value at LAT_MAX, not LAT_MIN.
    expected_nw = 0.5 * LAT_MAX + 0.1 * LON_MIN
    actual_nw = float(field[0, 0])
    if not np.isclose(actual_nw, expected_nw, atol=1e-3):
        raise ValueError(
            f"Row 0 does not look like the north-west corner: "
            f"field[0,0]={actual_nw}, expected ~{expected_nw}. "
            "Latitude axis may be reversed."
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
