"""Fetches and caches the full Copernicus Marine WMTS layer catalog.

The handful of "documented" variables barely scratch what this WMTS
actually serves - querying its own GetCapabilities returns every
product/dataset/variable combination it has (1451 at last count: global and
regional, physics/biogeochemistry/waves/sea-ice). Hand-transcribing entries
into apps/web's static catalog one at a time (as its first ~10 layers were
built, verified against a live GetCapabilities fetch each time) doesn't
scale to that and drifts stale as products get reversioned. This module
does that same verification live, on a cache TTL, instead of by hand once.

GetCapabilities is a ~65MB XML document - too large for the browser to
re-fetch every session just to build a layer picker. This service fetches
and parses it once here and serves a compact per-layer JSON summary
instead. Everything cheap and per-layer (the exact GetLegend colour
ramp/value range/units, GetFeatureInfo point sampling) stays a direct,
keyless, CORS-open browser call, unchanged from how the existing catalog
already works - see apps/web/src/lib/copernicus/copernicus-legend.ts and
copernicus-feature-info.ts. Nothing here needs Copernicus credentials.
"""

from __future__ import annotations

import asyncio
import io
import json
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from xml.etree import ElementTree as ET

import httpx
import structlog

from app.schemas.wmts_catalog import (
    WmtsElevationDimension,
    WmtsLayerDescriptor,
    WmtsTimeDimension,
)
from app.services.wmts_facets import (
    classify_category,
    classify_collection,
    classify_region,
)
from app.services.wmts_variable_groups import classify_variable

logger = structlog.get_logger(__name__)

COPERNICUS_WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts"
CACHE_TTL_SECONDS = 12 * 60 * 60
FETCH_TIMEOUT_SECONDS = 120.0

# Cold-start seed only, not a source of truth - a fresh process always
# re-checks the live TTL regardless of what's on disk. Keeps a freshly
# started API from making a user's first catalog request wait out a ~65MB
# download + parse every single time the process restarts.
_DISK_CACHE_PATH = Path(tempfile.gettempdir()) / "thalassa-wmts-catalog-cache.json"

# Grid-geometry/coordinate metadata Copernicus exposes as ordinary WMTS
# layers alongside real measurements - each returns a real number
# everywhere (which is exactly why a data-coverage check can't tell these
# apart from genuine data), but none is a physical measurement: a model
# grid cell's dimensions, its vertical-level index, or a land/sea/ice
# classification mask. Excluded at parse time so they never reach search,
# facets, or counts. Exact-match only (see wmts_variable_groups.py's "si"
# vs "siconc"/"sithick" precedent) - a substring/prefix rule risks catching
# a real variable that happens to share a token. Enumerated against the
# live ~9,628-layer catalog (169 layers, 1.8% - see this constant's git
# history for the enumeration script) rather than guessed from NEMO's grid
# variable naming convention in the abstract; real bathymetry (`deptho`)
# deliberately isn't here since sea floor depth is genuine, useful data.
_GRID_METADATA_VARIABLES = frozenset(
    {
        "e1t",  # cell dimension along the X axis
        "e2t",  # cell dimension along the Y axis
        "e3t",  # cell dimension along the Z axis
        "deptho_lev",  # vertical grid level index of the sea floor, not a depth
        "deptho_lev_interp",  # same, for interpolated 3D fields
        "mask",  # land/sea/ice/lake bit mask
        "land_water_mask",  # land/water classification mask
    }
)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _children(elem: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in elem if _local_name(child.tag) == name]


def _child(elem: ET.Element, name: str) -> ET.Element | None:
    matches = _children(elem, name)
    return matches[0] if matches else None


def _text(elem: ET.Element | None) -> str | None:
    return elem.text.strip() if elem is not None and elem.text else None


def _parse_bbox(layer: ET.Element) -> tuple[float, float, float, float] | None:
    bbox_el = _child(layer, "WGS84BoundingBox")
    if bbox_el is None:
        return None
    lower = _text(_child(bbox_el, "LowerCorner"))
    upper = _text(_child(bbox_el, "UpperCorner"))
    if not lower or not upper:
        return None
    try:
        west, south = (float(v) for v in lower.split())
        east, north = (float(v) for v in upper.split())
    except ValueError:
        return None
    return (west, south, east, north)


def _parse_time_dimension(dim: ET.Element) -> WmtsTimeDimension:
    default = _text(_child(dim, "Default"))
    raw_values = [v for v in (_text(el) for el in _children(dim, "Value")) if v]
    interval_start: str | None = None
    interval_end: str | None = None
    interval_period: str | None = None
    explicit: list[str] = []
    for value in raw_values:
        parts = value.split("/")
        if len(parts) == 3 and interval_start is None:
            interval_start, interval_end, interval_period = parts
        else:
            explicit.append(value)
    return WmtsTimeDimension(
        default=default,
        interval_start=interval_start,
        interval_end=interval_end,
        interval_period=interval_period,
        values=explicit or None,
    )


def _parse_elevation_dimension(dim: ET.Element) -> WmtsElevationDimension:
    return WmtsElevationDimension(
        default=_text(_child(dim, "Default")),
        unit=_text(_child(dim, "UnitSymbol")),
        level_count=len(_children(dim, "Value")),
    )


def _parse_layer(layer: ET.Element) -> WmtsLayerDescriptor | None:
    identifier = _text(_child(layer, "Identifier"))
    if not identifier:
        return None
    parts = identifier.split("/")
    if len(parts) != 3:
        # A small number of non-variable layers (aggregate/legacy ids) don't
        # follow the product/dataset/variable shape - skip rather than guess.
        logger.debug("wmts_layer_skipped_unexpected_identifier", identifier=identifier)
        return None
    product_id, dataset_id, variable = parts
    if variable in _GRID_METADATA_VARIABLES:
        return None

    title = _text(_child(layer, "Title")) or identifier
    bbox = _parse_bbox(layer)

    default_style: str | None = None
    styles: list[str] = []
    for style_el in _children(layer, "Style"):
        style_id = _text(_child(style_el, "Identifier"))
        if not style_id:
            continue
        styles.append(style_id)
        if style_el.get("isDefault") == "true":
            default_style = style_id

    formats = [f for f in (_text(el) for el in _children(layer, "Format")) if f]

    time_dim: WmtsTimeDimension | None = None
    elevation_dim: WmtsElevationDimension | None = None
    for dim_el in _children(layer, "Dimension"):
        dim_name = _text(_child(dim_el, "Identifier"))
        if dim_name == "time":
            time_dim = _parse_time_dimension(dim_el)
        elif dim_name == "elevation":
            elevation_dim = _parse_elevation_dimension(dim_el)

    collection_key, _ = classify_collection(product_id)
    region_key, _ = classify_region(product_id)
    category_key, _ = classify_category(product_id)

    return WmtsLayerDescriptor(
        id=identifier,
        product_id=product_id,
        dataset_id=dataset_id,
        variable=variable,
        title=title,
        bbox=bbox,
        default_style=default_style,
        styles=styles,
        formats=formats,
        time=time_dim,
        elevation=elevation_dim,
        collection=collection_key,
        region=region_key,
        category=category_key,
        friendly_variable_group=classify_variable(variable),
    )


def parse_capabilities(xml_bytes: bytes) -> list[WmtsLayerDescriptor]:
    """Pure, synchronous, no I/O - safe to unit-test directly and safe to
    run in a worker thread (see WmtsCatalogCache._refresh). iterparse over a
    ~65MB document is squarely CPU-bound, not something to await on the
    event loop directly. `elem.clear()` after each </Layer> drops that
    layer's now-extracted subtree (its Dimension/Style/Value children - the
    actual bulk of the file), keeping peak memory well under a full DOM
    parse of the whole document."""
    layers: list[WmtsLayerDescriptor] = []
    for _event, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("end",)):
        if _local_name(elem.tag) != "Layer":
            continue
        descriptor = _parse_layer(elem)
        if descriptor is not None:
            layers.append(descriptor)
        elem.clear()
    return layers


class WmtsCatalogCache:
    """In-memory TTL cache with a disk-backed cold-start seed and an
    asyncio.Lock guarding refreshes so concurrent requests during a cache
    miss trigger one fetch, not a thundering herd. No Redis/scheduler
    dependency - matches the rest of the repo, which has neither."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._layers: list[WmtsLayerDescriptor] | None = None
        self._fetched_at: float = 0.0  # time.monotonic() of the last live fetch
        self._generated_at_iso: str = ""
        self._loaded_disk_seed = False

    def _is_fresh(self) -> bool:
        return self._layers is not None and (time.monotonic() - self._fetched_at) < CACHE_TTL_SECONDS

    def _load_disk_seed(self) -> None:
        if self._loaded_disk_seed or self._layers is not None:
            return
        self._loaded_disk_seed = True
        if not _DISK_CACHE_PATH.is_file():
            return
        try:
            raw = json.loads(_DISK_CACHE_PATH.read_text())
            self._layers = [WmtsLayerDescriptor.model_validate(item) for item in raw["layers"]]
            self._generated_at_iso = raw["generatedAt"]
            # _fetched_at stays 0.0 - this is only a cold-start seed, the
            # next get() still performs (or waits behind) a real TTL check.
            logger.info("wmts_catalog_disk_seed_loaded", layer_count=len(self._layers), path=str(_DISK_CACHE_PATH))
        except Exception:
            logger.warning("wmts_catalog_disk_seed_load_failed", exc_info=True)

    def _write_disk_seed(self) -> None:
        assert self._layers is not None
        try:
            payload = {
                "generatedAt": self._generated_at_iso,
                "layers": [layer.model_dump(by_alias=True) for layer in self._layers],
            }
            tmp_path = _DISK_CACHE_PATH.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(payload))
            tmp_path.replace(_DISK_CACHE_PATH)
        except Exception:
            logger.warning("wmts_catalog_disk_seed_write_failed", exc_info=True)

    async def get(self, *, force_refresh: bool = False) -> tuple[list[WmtsLayerDescriptor], str]:
        self._load_disk_seed()
        if not force_refresh and self._is_fresh():
            assert self._layers is not None
            return self._layers, self._generated_at_iso

        async with self._lock:
            # Another request may have refreshed while we waited for the lock.
            if not force_refresh and self._is_fresh():
                assert self._layers is not None
                return self._layers, self._generated_at_iso
            await self._refresh()

        assert self._layers is not None
        return self._layers, self._generated_at_iso

    async def _refresh(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
                response = await client.get(
                    COPERNICUS_WMTS_URL,
                    params={"SERVICE": "WMTS", "REQUEST": "GetCapabilities"},
                )
                response.raise_for_status()
                xml_bytes = response.content
            layers = await asyncio.to_thread(parse_capabilities, xml_bytes)
        except Exception:
            if self._layers is not None:
                logger.warning(
                    "wmts_catalog_refresh_failed_serving_stale",
                    stale_layer_count=len(self._layers),
                    exc_info=True,
                )
                return
            raise

        self._layers = layers
        self._fetched_at = time.monotonic()
        self._generated_at_iso = datetime.now(UTC).isoformat()
        self._write_disk_seed()
        logger.info("wmts_catalog_refreshed", layer_count=len(layers))
        self._log_unclassified_summary(layers)

    @staticmethod
    def _log_unclassified_summary(layers: list[WmtsLayerDescriptor]) -> None:
        """One-time-per-refresh visibility into wmts_facets.py/
        wmts_variable_groups.py's classification coverage - a growing
        "other"/unmapped count here is the signal those tables need a new
        token, not a bug in the matching logic (see their docstrings)."""
        other_products = {layer.product_id for layer in layers if "other" in (layer.collection, layer.region, layer.category)}
        unmapped_variables = {layer.variable for layer in layers if layer.friendly_variable_group is None}
        if other_products:
            logger.info(
                "wmts_facets_unclassified_products",
                product_count=len(other_products),
                sample=sorted(other_products)[:10],
            )
        logger.info(
            "wmts_variable_groups_coverage",
            unmapped_variable_count=len(unmapped_variables),
            total_variable_count=len({layer.variable for layer in layers}),
        )


wmts_catalog_cache = WmtsCatalogCache()
