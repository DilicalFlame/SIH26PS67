"""Server-side bulk multi-depth GetFeatureInfo fan-out against Copernicus
Marine's WMTS service, for the "Visualise Data" 3D volumetric popout.

apps/web's own copernicus-feature-info.ts already does this same
point-by-point GetFeatureInfo sampling, but from the browser, one point at a
time - fine for a 2D heatmap slice (dozens of points) but not for a full
volumetric grid (width x height x depth points, e.g. 10x10x12 = 1200),
where per-request browser overhead and a shared 6-8 connection limit make it
too slow. Doing the same fan-out here instead - server to server, higher
concurrency, no browser connection cap - is the whole point of this module.

No bulk/Zarr access to Copernicus's underlying data was verified as
reachable without credentials, so this proxies GetFeatureInfo (the same
keyless, CORS-open endpoint apps/web already uses) rather than reading a
raw array store - see docs/planning for the fuller spike writeup. Real
per-layer/per-bbox caching (mirroring wmts_catalog.py's disk-cache pattern)
is a follow-up once this proves out end-to-end; every request here is a
live fetch.
"""

from __future__ import annotations

import asyncio

import httpx
import structlog

from app.schemas.fields import VolumeGridRequest, VolumeGridResponse

logger = structlog.get_logger(__name__)

# Same TileMatrixSet/level this WMTS's EPSG:4326 pyramid and apps/web's
# copernicus-feature-info.ts both already sample at - GetFeatureInfo is
# billed per point, not per tile, so a deeper level only sharpens the
# lon/lat -> pixel rounding, never costs an extra request.
TILE_MATRIX_LEVEL = 10
TILE_SIZE = 256

# Guards against an accidental (or abusive) request turning into tens of
# thousands of upstream GetFeatureInfo calls - width*height*depth_count is
# the exact request count this module makes.
MAX_POINTS = 4000

REQUEST_TIMEOUT_SECONDS = 12.0
# Measured live against the real Copernicus WMTS: a sustained burst (two
# back-to-back requests at concurrency 16-24, ~300-1200 points each)
# earned real HTTP 429s from the service - it does rate-limit despite
# being keyless/undocumented, contradicting the "no throttling observed"
# assumption copernicus-feature-info.ts's own header comment made from a
# much lighter, single-view research burst. 8 matches that module's own
# proven-safe default (its fetchGrid concurrency=6, given a small margin)
# rather than pushing the limit further.
MAX_CONCURRENCY = 8
MAX_ATTEMPTS = 3


def _lonlat_to_tile_pixel(lon: float, lat: float) -> tuple[int, int, int, int]:
    """Mirrors copernicus-feature-info.ts's lonLatToTilePixel: this WMTS's
    EPSG:4326 TileMatrixSet is a standard 2x1-root-tile geographic pyramid
    (verified against its own GetCapabilities), so the tile row/col + pixel
    offset can be computed directly instead of via a real tiling library."""
    num_cols = 2 * (2**TILE_MATRIX_LEVEL)
    num_rows = 1 * (2**TILE_MATRIX_LEVEL)
    tile_width_deg = 360.0 / num_cols
    tile_height_deg = 180.0 / num_rows

    tile_col = min(max(int((lon + 180.0) / tile_width_deg), 0), num_cols - 1)
    tile_row = min(max(int((90.0 - lat) / tile_height_deg), 0), num_rows - 1)

    west = -180.0 + tile_col * tile_width_deg
    north = 90.0 - tile_row * tile_height_deg
    frac_x = (lon - west) / tile_width_deg
    frac_y = (north - lat) / tile_height_deg
    i = min(max(int(frac_x * TILE_SIZE), 0), TILE_SIZE - 1)
    j = min(max(int(frac_y * TILE_SIZE), 0), TILE_SIZE - 1)
    return tile_row, tile_col, i, j


async def _fetch_point(
    client: httpx.AsyncClient,
    req: VolumeGridRequest,
    lon: float,
    lat: float,
    elevation: str,
) -> float | None:
    tile_row, tile_col, i, j = _lonlat_to_tile_pixel(lon, lat)
    params = {
        "SERVICE": "WMTS",
        "REQUEST": "GetFeatureInfo",
        "VERSION": "1.0.0",
        "LAYER": req.layer,
        "STYLE": req.style,
        "TILEMATRIXSET": "EPSG:4326",
        "TILEMATRIX": str(TILE_MATRIX_LEVEL),
        "TILEROW": str(tile_row),
        "TILECOL": str(tile_col),
        "I": str(i),
        "J": str(j),
        "INFOFORMAT": "application/json",
        "TIME": req.time,
        "ELEVATION": elevation,
    }

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            resp = await client.get(req.url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            resp.raise_for_status()
            body = resp.json()
            features = body.get("features") or []
            if not features:
                return None
            value = features[0].get("properties", {}).get("value")
            return float(value) if isinstance(value, (int, float)) else None
        except Exception as err:  # noqa: BLE001 - retried below, logged on final failure
            last_error = err
            if attempt < MAX_ATTEMPTS - 1:
                await asyncio.sleep(0.3 * (2**attempt))

    logger.warning(
        "copernicus_volume.point_failed", lon=lon, lat=lat, elevation=elevation, error=str(last_error)
    )
    return None


async def fetch_volume_grid(req: VolumeGridRequest) -> VolumeGridResponse:
    depth_count = len(req.elevations)
    if req.width * req.height * depth_count > MAX_POINTS:
        raise ValueError(
            f"Requested grid ({req.width}x{req.height}x{depth_count}) exceeds the "
            f"{MAX_POINTS}-point limit"
        )

    west, south, east, north = req.bbox
    lons = [west if req.width == 1 else west + col * (east - west) / (req.width - 1) for col in range(req.width)]
    # Row 0 = north edge, matching ScalarFieldMeta's grid convention.
    lats = [north if req.height == 1 else north - row * (north - south) / (req.height - 1) for row in range(req.height)]

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    values: list[float | None] = [None] * (depth_count * req.height * req.width)

    async def worker(flat_index: int, lon: float, lat: float, elevation: str, client: httpx.AsyncClient) -> None:
        async with semaphore:
            values[flat_index] = await _fetch_point(client, req, lon, lat, elevation)

    async with httpx.AsyncClient() as client:
        tasks = []
        flat_index = 0
        for elevation in req.elevations:
            for lat in lats:
                for lon in lons:
                    tasks.append(worker(flat_index, lon, lat, elevation, client))
                    flat_index += 1
        await asyncio.gather(*tasks)

    real_values = [v for v in values if v is not None]
    value_min = min(real_values) if real_values else 0.0
    value_max = max(real_values) if real_values else 0.0

    return VolumeGridResponse(
        width=req.width,
        height=req.height,
        depth_count=depth_count,
        bbox=req.bbox,
        depths=[float(e) for e in req.elevations],
        time=req.time,
        value_min=value_min,
        value_max=value_max,
        no_data_value="NaN",
        values=values,
    )
