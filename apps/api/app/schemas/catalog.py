"""GET /catalog/layers[/{layer_id}] (contracts §4.2)."""

from __future__ import annotations

from typing import Literal

from app.schemas.common import CamelModel

LayerKind = Literal["vector", "scalar_field", "point_collection"]


class LayerDescriptor(CamelModel):
    layer_id: str
    title: str
    kind: LayerKind
    variable: str | None
    units: str | None
    description: str | None
    bbox: tuple[float, float, float, float]
    depths: list[float]
    times: list[str]
    value_min: float | None
    value_max: float | None
    default_colormap: str
    object_path: str | None
    source: str | None
    attribution: str | None
