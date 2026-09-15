"""Tests for GET /api/v1/catalog/* (issue #38)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_list_layers_returns_the_fixture() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/layers")

    assert resp.status_code == 200
    body = resp.json()
    assert {layer["layerId"] for layer in body} == {"glorys_thetao", "coastlines"}


def test_list_layers_filters_by_kind() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/layers", params={"kind": "vector"})

    assert resp.status_code == 200
    body = resp.json()
    assert [layer["layerId"] for layer in body] == ["coastlines"]


def test_list_layers_filters_by_variable() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/layers", params={"variable": "temperature"})

    assert resp.status_code == 200
    body = resp.json()
    assert [layer["layerId"] for layer in body] == ["glorys_thetao"]


def test_get_layer_by_id() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/layers/glorys_thetao")

    assert resp.status_code == 200
    assert resp.json()["layerId"] == "glorys_thetao"


def test_get_unknown_layer_returns_error_envelope() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/layers/does-not-exist")

    assert resp.status_code == 404
    assert resp.json() == {
        "error": {"code": "not_found", "message": "Layer 'does-not-exist' does not exist"}
    }
