"""`/docs` shows every contracts §4 route with a response model (issue #38's AC)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

EXPECTED_ROUTES = {
    ("/api/v1/healthz", "get"),
    ("/api/v1/catalog/layers", "get"),
    ("/api/v1/catalog/layers/{layer_id}", "get"),
    ("/api/v1/fields/{layer_id}/meta", "get"),
    ("/api/v1/fields/{layer_id}/grid.bin", "get"),
    ("/api/v1/observations/platforms", "get"),
    ("/api/v1/observations/platforms/{platform_id}/profiles", "get"),
    ("/api/v1/observations/profiles/{profile_id}", "get"),
    ("/api/v1/auth/login", "post"),
    ("/api/v1/auth/logout", "post"),
    ("/api/v1/auth/me", "get"),
    ("/api/v1/projects/{project_id}/chat/nodes", "post"),
    ("/api/v1/projects/{project_id}/chat/tree", "get"),
}


def test_docs_renders() -> None:
    client = TestClient(create_app())
    assert client.get("/docs").status_code == 200


def test_openapi_lists_every_contract_route_with_a_response_schema() -> None:
    client = TestClient(create_app())
    schema = client.get("/openapi.json").json()

    found = {(path, method) for path, methods in schema["paths"].items() for method in methods}
    assert EXPECTED_ROUTES <= found

    for path, method in EXPECTED_ROUTES:
        operation = schema["paths"][path][method]
        success_response = next(body for status, body in operation["responses"].items() if status.startswith(("2",)))
        # grid.bin and the SSE endpoint are octet-stream/event-stream, not
        # JSON, and logout is 204 No Content — every other route must
        # declare a JSON response schema.
        if path.endswith(("grid.bin", "/chat/nodes", "/auth/logout")):
            continue
        assert any("schema" in media_type for media_type in success_response["content"].values()), (
            f"{method.upper()} {path} has no response schema"
        )
