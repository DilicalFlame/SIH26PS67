"""Unit tests for get_database_url()'s two resolution paths. No live Postgres
needed - CI has no database service, so this is what actually exercises the
URL-construction logic (the encoding bug it exists to avoid is exactly the
kind of thing that only shows up when you build the string by hand)."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core import database
from app.core.database import get_database_url
from app.core.logging import configure_logging


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


class _FakeAsyncEngine:
    """Stands in for the AsyncEngine the real fixture would need - the
    listener only ever touches .sync_engine, and a plain sync SQLite engine
    exercises the same before/after-cursor-execute event pair without a
    live Postgres (issue #34's slow-query logging)."""

    def __init__(self, sync_engine) -> None:  # type: ignore[no-untyped-def]
        self.sync_engine = sync_engine


def test_slow_query_is_logged(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO")
    monkeypatch.setattr(database, "SLOW_QUERY_THRESHOLD_MS", -1.0)  # every query counts as slow

    sync_engine = create_engine("sqlite:///:memory:")
    database._register_slow_query_logging(_FakeAsyncEngine(sync_engine))  # type: ignore[arg-type]

    with sync_engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    record = next(line for line in lines if line.get("event") == "slow_query")

    assert record["level"] == "warning"
    assert "SELECT" in record["statement"].upper()
    assert record["duration_ms"] >= 0


def test_fast_query_is_not_logged(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO")

    sync_engine = create_engine("sqlite:///:memory:")
    database._register_slow_query_logging(_FakeAsyncEngine(sync_engine))  # type: ignore[arg-type]

    with sync_engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    assert not [line for line in lines if line.get("event") == "slow_query"]
