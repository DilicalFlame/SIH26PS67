"""Catalog endpoints (contracts §4.2). Stub-backed by fixtures/catalog/ (#38);
real queries against Postgres land in #79."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.fixtures import load_fixture
from app.schemas.catalog import LayerDescriptor
from app.schemas.common import NOT_FOUND_RESPONSE, ApiError

router = APIRouter(prefix="/catalog", tags=["catalog"])


def _layers() -> list[LayerDescriptor]:
    return [LayerDescriptor.model_validate(raw) for raw in load_fixture("catalog/layers.json")]


@router.get("/layers", response_model=list[LayerDescriptor])
async def list_layers(kind: str | None = None, variable: str | None = None) -> list[LayerDescriptor]:
    layers = _layers()
    if kind is not None:
        layers = [layer for layer in layers if layer.kind == kind]
    if variable is not None:
        layers = [layer for layer in layers if layer.variable == variable]
    return layers


@router.get("/layers/{layer_id}", response_model=LayerDescriptor, responses=NOT_FOUND_RESPONSE)
async def get_layer(layer_id: str) -> LayerDescriptor:
    for layer in _layers():
        if layer.layer_id == layer_id:
            return layer
    raise ApiError("not_found", f"Layer '{layer_id}' does not exist")
