"""Tests for /api/v1/auth/* (issue #38)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

SEEDED_EMAIL = "researcher@thalassa.dev"


def test_me_without_cookie_is_unauthorized() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/auth/me")

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


def test_login_with_wrong_email_is_unauthorized() -> None:
    client = TestClient(create_app())
    resp = client.post("/api/v1/auth/login", json={"email": "nope@example.com", "password": "x"})

    assert resp.status_code == 401
    assert "session" not in resp.cookies


def test_login_with_seeded_email_sets_session_cookie_and_returns_user() -> None:
    """Sprint 0: password check is a stub (contracts §4.5) — any password works."""
    client = TestClient(create_app())
    resp = client.post("/api/v1/auth/login", json={"email": SEEDED_EMAIL, "password": "anything"})

    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == SEEDED_EMAIL
    assert "session" in resp.cookies


def test_me_with_session_cookie_returns_user() -> None:
    client = TestClient(create_app())
    client.post("/api/v1/auth/login", json={"email": SEEDED_EMAIL, "password": "anything"})

    resp = client.get("/api/v1/auth/me")

    assert resp.status_code == 200
    assert resp.json()["user"]["email"] == SEEDED_EMAIL


def test_logout_clears_session_and_returns_204() -> None:
    client = TestClient(create_app())
    client.post("/api/v1/auth/login", json={"email": SEEDED_EMAIL, "password": "anything"})

    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 204
    assert logout_resp.content == b""

    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 401
