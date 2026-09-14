"""Tests for create_app(): settings, CORS, and the /api/v1 mount (issue #36)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_settings_load_with_sane_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("API_HOST", "API_PORT", "WEB_ORIGIN", "SESSION_SECRET", "GROQ_API_KEY", "GROQ_MODEL"):
        monkeypatch.delenv(var, raising=False)

    settings = Settings()

    assert settings.API_HOST == "0.0.0.0"
    assert settings.API_PORT == 8000
    assert settings.WEB_ORIGIN == "http://localhost:5173"


def test_settings_load_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WEB_ORIGIN", "https://example.com")
    monkeypatch.setenv("API_PORT", "9001")

    settings = Settings()

    assert settings.WEB_ORIGIN == "https://example.com"
    assert settings.API_PORT == 9001


def test_docs_renders() -> None:
    client = TestClient(create_app())
    resp = client.get("/docs")
    assert resp.status_code == 200


def test_healthz_under_api_v1() -> None:
    """Mount/shape only — dependency-down behavior is issue #37's, in test_health.py."""
    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")
    assert resp.status_code in (200, 503)
    body = resp.json()
    assert body["status"] in ("ok", "error")
    assert isinstance(body["db"], bool)
    assert isinstance(body["storage"], bool)


def test_cors_allows_configured_web_origin() -> None:
    settings = Settings(WEB_ORIGIN="http://localhost:5173")
    client = TestClient(create_app(settings))

    resp = client.get("/api/v1/healthz", headers={"Origin": "http://localhost:5173"})

    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_other_origins() -> None:
    settings = Settings(WEB_ORIGIN="http://localhost:5173")
    client = TestClient(create_app(settings))

    resp = client.get("/api/v1/healthz", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in resp.headers
