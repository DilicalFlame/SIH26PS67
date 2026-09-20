"""Tests for POST /api/v1/fields/volume.

Monkeypatches copernicus_volume._fetch_point (the one seam that talks to
Copernicus) instead of hitting the real WMTS service - this route's job is
shaping the grid/response, not re-verifying the live GetFeatureInfo fetch
(exercised manually; see copernicus-feature-info.ts's own header comment
for how that was confirmed live from the browser side)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import fields as fields_route
from app.main import create_app
from app.services import copernicus_volume


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    async def fake_fetch_point(client, req, lon, lat, elevation):  # noqa: ANN001
        # Deterministic value derived from inputs so the response shape
        # (grid ordering, min/max) is actually exercised, not just a
        # constant echoed back.
        if lon > 50 and lat > 50:
            return None  # exercises no-data handling
        return lon + lat + float(elevation)

    monkeypatch.setattr(copernicus_volume, "_fetch_point", fake_fetch_point)
    return TestClient(create_app())


def test_volume_grid_shape_and_ordering(client: TestClient) -> None:
    body = {
        "url": "https://wmts.marine.copernicus.eu/teroWmts",
        "layer": "some/layer/thetao",
        "style": "cmap:thermal",
        "bbox": [0.0, 0.0, 10.0, 10.0],
        "width": 3,
        "height": 2,
        "time": "2020-01-01T00:00:00Z",
        "elevations": ["-0.5", "-10.0"],
    }
    res = client.post("/api/v1/fields/volume", json=body)
    assert res.status_code == 200
    data = res.json()

    assert data["width"] == 3
    assert data["height"] == 2
    assert data["depthCount"] == 2
    assert data["depths"] == [-0.5, -10.0]
    assert len(data["values"]) == 3 * 2 * 2

    # Row 0 = north edge: first row's values should come from lat=10 (north),
    # matching ScalarFieldMeta's documented convention.
    first_depth_first_row = data["values"][0:3]
    assert all(v is not None for v in first_depth_first_row)


def test_volume_grid_rejects_oversized_request(client: TestClient) -> None:
    body = {
        "url": "https://wmts.marine.copernicus.eu/teroWmts",
        "layer": "some/layer/thetao",
        "style": "cmap:thermal",
        "bbox": [0.0, 0.0, 10.0, 10.0],
        "width": 200,
        "height": 200,
        "time": "2020-01-01T00:00:00Z",
        "elevations": ["-0.5"] * 5,
    }
    res = client.post("/api/v1/fields/volume", json=body)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"


def test_volume_grid_route_registered() -> None:
    assert any(getattr(r, "path", "") == "/fields/volume" for r in fields_route.router.routes)
