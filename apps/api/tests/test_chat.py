"""Tests for /api/v1/projects/{project_id}/chat/* (issue #38)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import create_app


def test_get_chat_tree_returns_the_fixture_nodes() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/projects/proj1/chat/tree")

    assert resp.status_code == 200
    body = resp.json()
    assert [node["nodeId"] for node in body] == ["node_root", "node_reply"]
    assert body[0]["parentId"] is None
    assert body[1]["parentId"] == "node_root"


def test_create_chat_node_streams_all_six_frozen_event_types() -> None:
    client = TestClient(create_app())
    resp = client.post(
        "/api/v1/projects/proj1/chat/nodes",
        json={"parentId": None, "content": "hi"},
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    events = [json.loads(line[len("data: ") :]) for line in resp.text.splitlines() if line.startswith("data: ")]
    event_types = [event["type"] for event in events]

    assert event_types == ["node_created", "token", "token", "token", "tool_call", "ui_action", "done"]


def test_ui_action_event_omits_unset_optional_fields() -> None:
    """UiAction's optional fields (colormap, valueRange, ...) are TS `?:` -
    absent, not null. exclude_unset in the router must keep them absent."""
    client = TestClient(create_app())
    resp = client.post(
        "/api/v1/projects/proj1/chat/nodes",
        json={"parentId": None, "content": "hi"},
    )

    events = [
        json.loads(line[len("data: ") :]) for line in resp.text.splitlines() if line.startswith("data: ")
    ]
    ui_action_event = next(event for event in events if event["type"] == "ui_action")

    assert "colormap" not in ui_action_event["action"]
    assert "valueRange" not in ui_action_event["action"]
