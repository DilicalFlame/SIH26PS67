"""Observation endpoints (contracts §4.4). Stub-backed by
fixtures/observations/ (#38); real queries against Postgres land in #63.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.fixtures import load_fixture
from app.schemas.common import NOT_FOUND_RESPONSE, ApiError
from app.schemas.observations import PlatformFeatureCollection, Profile, ProfileSummary

router = APIRouter(prefix="/observations", tags=["observations"])


def _known_platform_ids() -> set[str]:
    features = load_fixture("observations/platforms.json")["features"]
    return {feature["properties"]["platformId"] for feature in features}


@router.get("/platforms", response_model=PlatformFeatureCollection)
async def list_platforms(
    bbox: str | None = None,
    start: str | None = None,
    end: str | None = None,
    platform_type: str | None = Query(default=None, alias="type"),
    limit: int = 500,
) -> PlatformFeatureCollection:
    """Stub (#38): bbox/start/end/type/limit are accepted for shape
    compatibility with contracts §4.4 and ignored - real filtering against
    Postgres lands in #63."""
    return PlatformFeatureCollection.model_validate(load_fixture("observations/platforms.json"))


@router.get(
    "/platforms/{platform_id}/profiles",
    response_model=list[ProfileSummary],
    responses=NOT_FOUND_RESPONSE,
)
async def list_platform_profiles(
    platform_id: str,
    start: str | None = None,
    end: str | None = None,
    limit: int = 500,
) -> list[ProfileSummary]:
    """start/end/limit are accepted and ignored, same as list_platforms above."""
    if platform_id not in _known_platform_ids():
        raise ApiError("not_found", f"Platform '{platform_id}' does not exist")
    all_summaries = load_fixture("observations/profiles_summary.json")
    return [
        ProfileSummary.model_validate(raw)
        for raw in all_summaries
        if raw["profileId"].startswith(f"{platform_id}_")
    ]


@router.get("/profiles/{profile_id}", response_model=Profile, responses=NOT_FOUND_RESPONSE)
async def get_profile(profile_id: str) -> Profile:
    # profiles_by_id.json is a lookup table keyed by profileId, not a
    # response body itself - unlike every other fixture in fixtures/.
    profiles = load_fixture("observations/profiles_by_id.json")
    if profile_id not in profiles:
        raise ApiError("not_found", f"Profile '{profile_id}' does not exist")
    return Profile.model_validate(profiles[profile_id])
