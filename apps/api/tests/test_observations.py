"""Tests for GET /api/v1/observations/* (issue #38)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_list_platforms_returns_geojson_feature_collection() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/platforms")

    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert {f["properties"]["platformId"] for f in body["features"]} == {"5904471", "2902746"}
    assert body["features"][0]["geometry"]["type"] == "Point"


def test_list_platform_profiles_for_known_platform() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/platforms/5904471/profiles")

    assert resp.status_code == 200
    body = resp.json()
    assert [p["profileId"] for p in body] == ["5904471_045", "5904471_044"]


def test_list_platform_profiles_does_not_leak_other_platforms() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/platforms/2902746/profiles")

    assert resp.status_code == 200
    body = resp.json()
    assert [p["profileId"] for p in body] == ["2902746_112"]


def test_list_platform_profiles_for_unknown_platform_returns_error_envelope() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/platforms/does-not-exist/profiles")

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_get_profile_by_id() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/profiles/5904471_045")

    assert resp.status_code == 200
    body = resp.json()
    assert body["profileId"] == "5904471_045"
    assert body["levels"] == sorted(body["levels"], key=lambda level: level["depth"])


def test_get_unknown_profile_returns_error_envelope() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/observations/profiles/does-not-exist")

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"
