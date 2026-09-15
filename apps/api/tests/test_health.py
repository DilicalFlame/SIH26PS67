"""Tests for GET /api/v1/healthz dependency checks (issue #37)."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

import app.api.v1 as api_v1
from app.core.config import Settings
from app.core.health import check_storage
from app.main import create_app


async def _ok() -> bool:
    return True


async def _down() -> bool:
    return False


async def _ok_storage(minio_endpoint: str) -> bool:
    return True


async def _down_storage(minio_endpoint: str) -> bool:
    return False


def test_returns_200_with_per_dependency_booleans_when_healthy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_v1, "check_database", _ok)
    monkeypatch.setattr(api_v1, "check_storage", _ok_storage)

    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": True, "storage": True}


def test_returns_503_when_database_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_v1, "check_database", _down)
    monkeypatch.setattr(api_v1, "check_storage", _ok_storage)

    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "error"
    assert body["db"] is False
    assert body["storage"] is True


def test_returns_503_when_storage_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_v1, "check_database", _ok)
    monkeypatch.setattr(api_v1, "check_storage", _down_storage)

    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "error"
    assert body["db"] is True
    assert body["storage"] is False


def test_settings_minio_endpoint_reaches_check_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Proves app.state.settings actually flows into the healthz handler,
    not just that check_storage's own return value is honoured."""
    seen_endpoints: list[str] = []

    async def _recording_check_storage(minio_endpoint: str) -> bool:
        seen_endpoints.append(minio_endpoint)
        return True

    monkeypatch.setattr(api_v1, "check_database", _ok)
    monkeypatch.setattr(api_v1, "check_storage", _recording_check_storage)

    client = TestClient(create_app(Settings(MINIO_ENDPOINT="http://sentinel:9000")))
    client.get("/api/v1/healthz")

    assert seen_endpoints == ["http://sentinel:9000"]


def test_does_not_require_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_v1, "check_database", _ok)
    monkeypatch.setattr(api_v1, "check_storage", _ok_storage)

    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")  # no Authorization header, no cookie

    assert resp.status_code not in (401, 403)


@pytest.mark.anyio
async def test_check_storage_true_when_minio_reports_live() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/minio/health/live"
        return httpx.Response(200)

    result = await check_storage("http://minio:9000", transport=httpx.MockTransport(handler))

    assert result is True


@pytest.mark.anyio
async def test_check_storage_false_on_non_200() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    result = await check_storage("http://minio:9000", transport=httpx.MockTransport(handler))

    assert result is False


@pytest.mark.anyio
async def test_check_storage_false_when_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    result = await check_storage("http://minio:9000", transport=httpx.MockTransport(handler))

    assert result is False


@pytest.mark.anyio
async def test_check_storage_false_on_malformed_endpoint() -> None:
    """A bad MINIO_ENDPOINT raises httpx.InvalidURL, not an httpx.HTTPError
    subclass — this must degrade to False, not propagate into a 500."""
    result = await check_storage("::::")

    assert result is False
