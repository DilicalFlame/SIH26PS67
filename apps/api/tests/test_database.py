"""Unit tests for get_database_url()'s two resolution paths. No live Postgres
needed — CI has no database service, so this is what actually exercises the
URL-construction logic (the encoding bug it exists to avoid is exactly the
kind of thing that only shows up when you build the string by hand)."""

from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url

from app.core.database import get_database_url


def test_prefers_database_url_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
    url = get_database_url()
    assert url.render_as_string(hide_password=False) == "postgresql+asyncpg://u:p@h:5432/d"


def test_builds_from_components_when_database_url_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_USER", "thalassa")
    monkeypatch.setenv("POSTGRES_PASSWORD", "admin@123")
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "thalassa")

    url = get_database_url()

    assert url.drivername == "postgresql+asyncpg"
    assert url.username == "thalassa"
    assert url.password == "admin@123"
    assert url.host == "postgres"
    assert url.port == 5432
    assert url.database == "thalassa"


def test_component_password_with_at_sign_round_trips_correctly(monkeypatch: pytest.MonkeyPatch) -> None:
    """The bug this exists to prevent: string-interpolating a password
    containing '@' into a URL template makes it ambiguous with the
    userinfo/host delimiter. URL.create() must percent-encode it so the
    rendered URL parses back to the exact same password."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_USER", "thalassa")
    monkeypatch.setenv("POSTGRES_PASSWORD", "admin@123")
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_DB", "thalassa")

    url = get_database_url()
    rendered = url.render_as_string(hide_password=False)

    assert "admin@123@postgres" not in rendered  # the literal ambiguous form
    parsed = make_url(rendered)
    assert parsed.password == "admin@123"
    assert parsed.host == "postgres"


def test_raises_with_nothing_set(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("DATABASE_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
        monkeypatch.delenv(var, raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_database_url()


def test_defaults_host_and_port_when_only_required_vars_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_HOST", raising=False)
    monkeypatch.delenv("POSTGRES_PORT", raising=False)
    monkeypatch.setenv("POSTGRES_USER", "thalassa")
    monkeypatch.setenv("POSTGRES_PASSWORD", "admin@123")
    monkeypatch.setenv("POSTGRES_DB", "thalassa")

    url = get_database_url()

    assert url.host == "localhost"
    assert url.port == 5432
