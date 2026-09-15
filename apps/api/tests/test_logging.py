"""Tests for structured request logging and tracing (issue #34)."""

from __future__ import annotations

import json

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _log_lines(captured: str) -> list[dict]:
    return [json.loads(line) for line in captured.splitlines() if line.strip().startswith("{")]


def test_request_logs_id_method_path_status_duration(capsys: pytest.CaptureFixture[str]) -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")
    captured = capsys.readouterr()

    lines = [line for line in _log_lines(captured.out) if line.get("event") == "request_completed"]
    assert len(lines) == 1
    record = lines[0]

    assert record["method"] == "GET"
    assert record["path"] == "/api/v1/healthz"
    assert record["status"] == resp.status_code
    assert isinstance(record["duration_ms"], (int, float))
    assert record["request_id"]


def test_response_carries_the_same_request_id_as_the_log(capsys: pytest.CaptureFixture[str]) -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/healthz")
    captured = capsys.readouterr()

    record = next(line for line in _log_lines(captured.out) if line.get("event") == "request_completed")

    assert resp.headers["x-request-id"] == record["request_id"]


def test_unhandled_exception_logs_stack_trace_with_request_id(capsys: pytest.CaptureFixture[str]) -> None:
    app = create_app()

    boom_router = APIRouter()

    @boom_router.get("/boom")
    def boom() -> None:
        raise ValueError("kaboom")

    app.include_router(boom_router, prefix="/api/v1")

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/api/v1/boom")
    captured = capsys.readouterr()

    assert resp.status_code == 500

    record = next(line for line in _log_lines(captured.out) if line.get("event") == "request_failed")
    assert record["level"] == "error"
    assert record["request_id"]
    assert "ValueError" in record["exception"]
    assert "kaboom" in record["exception"]

    # request_failed replaces, not duplicates, the completion log for this request
    assert not [line for line in _log_lines(captured.out) if line.get("event") == "request_completed"]


def test_no_request_body_in_logs(capsys: pytest.CaptureFixture[str]) -> None:
    app = create_app()

    echo_router = APIRouter()

    @echo_router.post("/echo")
    def echo(body: dict) -> dict:
        return body

    app.include_router(echo_router, prefix="/api/v1")

    secret_marker = "super-secret-chat-content-should-not-be-logged"
    client = TestClient(app)
    client.post("/api/v1/echo", json={"content": secret_marker})
    captured = capsys.readouterr()

    assert secret_marker not in captured.out


def test_log_level_is_env_configurable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    client = TestClient(create_app(Settings()))
    client.get("/api/v1/healthz")
    captured = capsys.readouterr()

    assert not [line for line in _log_lines(captured.out) if line.get("event") == "request_completed"]

    monkeypatch.setenv("LOG_LEVEL", "INFO")
    client = TestClient(create_app(Settings()))
    client.get("/api/v1/healthz")
    captured = capsys.readouterr()

    assert [line for line in _log_lines(captured.out) if line.get("event") == "request_completed"]
