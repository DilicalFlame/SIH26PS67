"""Tests for GET /api/v1/fields/* (issue #38)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_get_field_meta() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/fields/glorys_thetao/meta")

    assert resp.status_code == 200
    body = resp.json()
    assert body["layerId"] == "glorys_thetao"
    assert body["variable"] == "temperature"
    assert body["noDataValue"] == "NaN"


def test_get_field_meta_for_unknown_layer() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/fields/does-not-exist/meta")

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_get_grid_bin_matches_meta_dimensions() -> None:
    client = TestClient(create_app())
    meta = client.get("/api/v1/fields/glorys_thetao/meta").json()

    resp = client.get(
        "/api/v1/fields/glorys_thetao/grid.bin",
        params={"depth_index": 0, "time_index": 0},
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/octet-stream"
    assert len(resp.content) == meta["width"] * meta["height"] * 4  # little-endian Float32, no header


def test_get_grid_bin_for_missing_depth_time_returns_error_envelope() -> None:
    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/fields/glorys_thetao/grid.bin",
        params={"depth_index": 9, "time_index": 9},
    )

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"
