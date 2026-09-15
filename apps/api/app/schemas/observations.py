"""GET /observations/* (contracts §4.4)."""

from __future__ import annotations

from typing import Literal

from app.schemas.common import CamelModel

PlatformType = Literal["argo", "glider", "ctd", "mooring"]


class PointGeometry(CamelModel):
    type: Literal["Point"]
    coordinates: tuple[float, float]


class PlatformProperties(CamelModel):
    platform_id: str
    platform_type: PlatformType
    name: str | None
    profile_count: int
    latest_observed_at: str


class PlatformFeature(CamelModel):
    type: Literal["Feature"]
    geometry: PointGeometry
    properties: PlatformProperties


class PlatformFeatureCollection(CamelModel):
    type: Literal["FeatureCollection"]
    features: list[PlatformFeature]


class ProfileSummary(CamelModel):
    profile_id: str
    observed_at: str
    lat: float
    lon: float
    cycle_number: int | None
    max_depth: float


class ProfileLevel(CamelModel):
    depth: float
    temperature: float | None
    salinity: float | None
    pressure: float | None


class Profile(CamelModel):
    profile_id: str
    platform_id: str
    observed_at: str
    lat: float
    lon: float
    levels: list[ProfileLevel]
