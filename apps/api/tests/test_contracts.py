"""Fixture <-> model agreement (issue #38's AC).

Every fixtures/*.json file (fixture data shared with the frontend, per
contracts §6) must validate against the Pydantic model that serves it, and
round-trip back to the exact same JSON shape. A test that only hits a route
and checks 200 wouldn't prove this — FastAPI would coerce or silently drop
fields on the way out. This validates the fixture on disk directly.

grid.bin's raw Float32 fixture is not JSON and is exercised in
test_fields.py instead.
"""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter

from app.core.fixtures import fixtures_dir, load_fixture
from app.schemas.auth import User
from app.schemas.catalog import LayerDescriptor
from app.schemas.chat import ChatNode, ChatSSEEvent
from app.schemas.fields import ScalarFieldMeta
from app.schemas.observations import PlatformFeatureCollection, Profile, ProfileSummary

# (fixture path relative to fixtures/, TypeAdapter, dump kwargs beyond by_alias+mode="json")
CONTRACT_CASES: list[tuple[str, TypeAdapter, dict[str, bool]]] = [
    ("catalog/layers.json", TypeAdapter(list[LayerDescriptor]), {}),
    ("fields/glorys_thetao/temperature/meta.json", TypeAdapter(ScalarFieldMeta), {}),
    ("observations/platforms.json", TypeAdapter(PlatformFeatureCollection), {}),
    ("observations/profiles_summary.json", TypeAdapter(list[ProfileSummary]), {}),
    ("observations/profiles_by_id.json", TypeAdapter(dict[str, Profile]), {}),
    ("auth/user.json", TypeAdapter(User), {}),
    ("chat/tree.json", TypeAdapter(list[ChatNode]), {}),
    # exclude_unset: the SSE stub (app/api/v1/chat.py) dumps the same way, so
    # a UiAction's absent optional fields (TS `?:`) round-trip as absent,
    # not as an explicit null.
    ("chat/sse_events.json", TypeAdapter(list[ChatSSEEvent]), {"exclude_unset": True}),
]

# Binary fixtures, or JSON fixtures intentionally not wire-validated here.
NON_CONTRACT_FIXTURES = {"fields/glorys_thetao/temperature/d0_t0.f32"}


@pytest.mark.parametrize("relative_path,adapter,dump_kwargs", CONTRACT_CASES, ids=[c[0] for c in CONTRACT_CASES])
def test_fixture_matches_model(relative_path: str, adapter: TypeAdapter, dump_kwargs: dict[str, bool]) -> None:
    raw = load_fixture(relative_path)
    validated = adapter.validate_python(raw)
    dumped = adapter.dump_python(validated, by_alias=True, mode="json", **dump_kwargs)
    assert dumped == raw


def test_every_fixture_file_is_covered() -> None:
    """Fails loudly if a fixture is added without a matching model here."""
    all_fixtures = {str(p.relative_to(fixtures_dir())) for p in fixtures_dir().rglob("*") if p.is_file()}
    covered = {path for path, _, _ in CONTRACT_CASES} | NON_CONTRACT_FIXTURES

    assert all_fixtures == covered
