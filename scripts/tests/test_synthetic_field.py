from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import generate_synthetic_field as gen  # noqa: E402


@pytest.fixture
def generated(tmp_path, monkeypatch):
    """Runs the real generator against a throwaway output dir."""
    out_dir = tmp_path / "fixtures" / "fields" / gen.PRODUCT_ID / gen.VARIABLE
    monkeypatch.setattr(gen, "OUTPUT_DIR", out_dir)
    monkeypatch.setattr(gen, "FIELD_FILE", out_dir / "d0_t0.f32")
    monkeypatch.setattr(gen, "META_FILE", out_dir / "meta.json")

    field = gen.generate_field()
    gen.write_fixture(field)
    gen.validate_fixture(field)
    return field, out_dir


def test_field_shape_and_dtype(generated):
    field, _ = generated
    assert field.shape == (gen.HEIGHT, gen.WIDTH)
    assert field.dtype == np.dtype("<f4")


def test_field_file_is_exact_width_height_float32_bytes(generated):
    _, out_dir = generated
    field_file = out_dir / "d0_t0.f32"
    assert field_file.exists()
    assert field_file.stat().st_size == gen.WIDTH * gen.HEIGHT * 4


def test_includes_a_nan_landmask_region(generated):
    field, _ = generated
    assert np.isnan(field).sum() > 0
    assert not np.isnan(field).all()


def test_row_0_is_the_north_west_corner(generated):
    """Contracts §2: row-major byte order starts at the north-west corner."""
    field, _ = generated
    expected_nw = 0.5 * gen.LAT_MAX + 0.1 * gen.LON_MIN
    assert field[0, 0] == pytest.approx(expected_nw, abs=1e-3)


def test_meta_json_matches_scalar_field_meta_shape(generated):
    """Contracts §4.3 ScalarFieldMeta - every field the frontend/backend expect."""
    _, out_dir = generated
    meta = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))

    assert meta["layerId"] == gen.PRODUCT_ID
    assert meta["variable"] == gen.VARIABLE
    assert isinstance(meta["units"], str)
    assert meta["width"] == gen.WIDTH
    assert meta["height"] == gen.HEIGHT
    assert meta["bbox"] == [gen.LON_MIN, gen.LAT_MIN, gen.LON_MAX, gen.LAT_MAX]
    assert meta["depths"] == gen.DEPTHS
    assert meta["times"] == gen.TIMES
    assert isinstance(meta["valueMin"], float)
    assert isinstance(meta["valueMax"], float)
    assert meta["valueMin"] < meta["valueMax"]
    assert meta["noDataValue"] == "NaN"
    assert meta["gridUrlTemplate"].endswith("d{d}_t{t}.f32")
    assert gen.PRODUCT_ID in meta["gridUrlTemplate"]
    assert gen.VARIABLE in meta["gridUrlTemplate"]


def test_generator_is_deterministic():
    """Same analytic function, no randomness - two runs must match byte-for-byte."""
    a = gen.generate_field()
    b = gen.generate_field()
    np.testing.assert_array_equal(np.isnan(a), np.isnan(b))
    assert np.array_equal(a[~np.isnan(a)], b[~np.isnan(b)])


def test_validate_fixture_rejects_a_reversed_latitude_axis(tmp_path, monkeypatch):
    """Guards against the exact bug this generator used to have."""
    out_dir = tmp_path / "fields" / gen.PRODUCT_ID / gen.VARIABLE
    monkeypatch.setattr(gen, "OUTPUT_DIR", out_dir)
    monkeypatch.setattr(gen, "FIELD_FILE", out_dir / "d0_t0.f32")
    monkeypatch.setattr(gen, "META_FILE", out_dir / "meta.json")

    field = gen.generate_field()
    reversed_field = field[::-1, :].copy()  # south-first, like the original bug
    gen.write_fixture(reversed_field)

    with pytest.raises(ValueError, match="north-west corner"):
        gen.validate_fixture(reversed_field)
