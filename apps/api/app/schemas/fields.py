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
