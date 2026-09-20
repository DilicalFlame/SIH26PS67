"""GET /fields/{layer_id}/meta (contracts §4.3)."""

from __future__ import annotations

from typing import Literal

from app.schemas.common import CamelModel


class ScalarFieldMeta(CamelModel):
    layer_id: str
    variable: str
    units: str
    width: int
    height: int
    bbox: tuple[float, float, float, float]
    depths: list[float]
    times: list[str]
    value_min: float
    value_max: float
    no_data_value: Literal["NaN"]
    grid_url_template: str


class VolumeGridRequest(CamelModel):
    """Proxies a bulk multi-depth GetFeatureInfo fan-out against a live
    Copernicus WMTS layer (see app/services/copernicus_volume.py) - one
    (lon, lat, depth) grid at a single time, server-side instead of from
    the browser, so the "Visualise Data" 3D popout doesn't have to make
    hundreds-to-thousands of individual fetches itself."""

    url: str
    layer: str
    style: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    width: int
    height: int
    time: str
    # Literal ELEVATION query-param values (e.g. "-0.49402499198913574"),
    # exactly as apps/web's STANDARD_DEPTHS_M entries stringify - not
    # re-parsed/reformatted here, just forwarded to Copernicus as-is.
    elevations: list[str]


class VolumeGridResponse(CamelModel):
    width: int
    height: int
    depth_count: int
    bbox: tuple[float, float, float, float]
    depths: list[float]
    time: str
    value_min: float
    value_max: float
    no_data_value: Literal["NaN"]
    # Row-major [depth][row][col], row 0 = north edge (matches
    # ScalarFieldMeta's grid convention) - `null` for no-data.
    values: list[float | None]
