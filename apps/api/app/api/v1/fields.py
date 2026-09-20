"""Scalar field endpoints (contracts §4.3). Stub-backed by
fixtures/fields/{layer_id}/{variable}/ (#38); real product/variable
resolution against the catalog lands in #80.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Response

from app.core.fixtures import fixture_path
from app.schemas.common import NOT_FOUND_RESPONSE, ApiError
from app.schemas.fields import ScalarFieldMeta, VolumeGridRequest, VolumeGridResponse
from app.services.copernicus_volume import fetch_volume_grid

router = APIRouter(prefix="/fields", tags=["fields"])


def _find_meta(layer_id: str) -> Path | None:
    layer_dir = fixture_path(f"fields/{layer_id}")
    if not layer_dir.is_dir():
        return None
    matches = sorted(layer_dir.glob("*/meta.json"))
    return matches[0] if matches else None


@router.get("/{layer_id}/meta", response_model=ScalarFieldMeta, responses=NOT_FOUND_RESPONSE)
async def get_field_meta(layer_id: str) -> ScalarFieldMeta:
    meta_path = _find_meta(layer_id)
    if meta_path is None:
        raise ApiError("not_found", f"Layer '{layer_id}' does not exist")
    return ScalarFieldMeta.model_validate(json.loads(meta_path.read_text()))


@router.get(
    "/{layer_id}/grid.bin",
    responses={200: {"content": {"application/octet-stream": {}}}, **NOT_FOUND_RESPONSE},
)
async def get_field_grid(layer_id: str, depth_index: int = 0, time_index: int = 0) -> Response:
    """Fallback path (contracts §4.3) - the browser normally fetches the
    .f32 object directly via gridUrlTemplate, bypassing this route."""
    meta_path = _find_meta(layer_id)
    if meta_path is None:
        raise ApiError("not_found", f"Layer '{layer_id}' does not exist")

    grid_path = meta_path.parent / f"d{depth_index}_t{time_index}.f32"
    if not grid_path.is_file():
        raise ApiError(
            "not_found",
            f"No grid for '{layer_id}' at depth_index={depth_index}, time_index={time_index}",
        )
    return Response(content=grid_path.read_bytes(), media_type="application/octet-stream")


@router.post("/volume", response_model=VolumeGridResponse)
async def get_volume_grid(req: VolumeGridRequest) -> VolumeGridResponse:
    """Bulk multi-depth GetFeatureInfo fan-out for the "Visualise Data" 3D
    popout (see app/services/copernicus_volume.py) - proxies a live
    Copernicus WMTS layer, not the fixture pipeline above; `layer_id` isn't
    involved because the caller already has the layer's WMTS identity
    (apps/web's DataLayerCatalogEntry.wmts)."""
    try:
        return await fetch_volume_grid(req)
    except ValueError as err:
        raise ApiError("bad_request", str(err)) from err
