"""Live Copernicus Marine WMTS layer catalog.

NOT part of the frozen /catalog/layers contract (§4.2) - that one is scoped
to the team's own Postgres/PostGIS-backed source type and has no field for
an external WMTS tile source (see apps/web/src/lib/tiles/
data-layers-catalog.ts's header comment). This route mirrors, server-side,
the same GetCapabilities-driven discovery process that catalog's ~10
hand-verified entries were built from, but for the full set of
product/dataset/variable combinations the live service advertises today
(~9,628 at last count), refreshed on a cache TTL instead of by hand.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from xml.etree.ElementTree import ParseError

import httpx
from fastapi import APIRouter, Query

from app.schemas.common import ApiError
from app.schemas.wmts_catalog import (
    WmtsCatalogResponse,
    WmtsFacetGroup,
    WmtsFacetsResponse,
    WmtsFacetValue,
    WmtsLayerDescriptor,
)
from app.services.wmts_catalog import COPERNICUS_WMTS_URL, wmts_catalog_cache
from app.services.wmts_facets import CATEGORY_LABELS, COLLECTION_LABELS, REGION_LABELS
from app.services.wmts_geo import BBox, bboxes_intersect, parse_polygon_candidates
from app.services.wmts_variable_groups import GROUP_LABELS

router = APIRouter(prefix="/catalog/wmts-layers", tags=["catalog"])


def _display_title_key(title: str) -> str:
    """The raw GetCapabilities title is "{dataset_id} - {human label}" - the
    frontend's own cleanTitle() (wmts-catalog-client.ts) strips the id
    prefix for what a card actually displays. Sorting by the raw `title`
    field instead would order by that id prefix, which reads as scrambled
    next to the human labels actually shown - this mirrors cleanTitle()'s
    split so a title sort matches what the user sees on screen."""
    sep = title.find(" - ")
    return (title[sep + 3 :] if sep != -1 else title).lower()


@dataclass
class _FilterParams:
    """One bag for every filter dimension a request can set - passed to
    `_apply_filters` so both routes (the list route, and the facets
    route's "hold one dimension out" recomputation) share exactly one
    predicate implementation instead of several near-duplicates."""

    q: str | None = None
    product: str | None = None
    collection: list[str] | None = None
    region: list[str] | None = None
    category: list[str] | None = None
    friendly_variable_group: list[str] | None = None
    # Resolved (id -> bbox already looked up) bboxes for the user's
    # currently-*checked* polygons only - see list_wmts_layers/
    # get_wmts_layer_facets for where `candidatePolygon`+`selectedPolygon`
    # get resolved into this.
    selected_polygon_bboxes: list[BBox] | None = None


def _apply_filters(
    layers: list[WmtsLayerDescriptor], params: _FilterParams, *, exclude: str | None = None
) -> list[WmtsLayerDescriptor]:
    """`exclude` names one dimension ("collection"/"region"/"category"/
    "friendly_variable_group"/"polygon") to skip filtering by - used by the
    facets route to compute a dimension's own option counts against every
    *other* active filter, so picking one region doesn't zero out every
    other region's count (real faceted-search semantics, not a dead end)."""
    if params.product is not None:
        layers = [layer for layer in layers if layer.product_id == params.product]
    if params.q is not None:
        needle = params.q.lower()
        layers = [
            layer
            for layer in layers
            if needle in layer.title.lower()
            or needle in layer.variable.lower()
            or needle in layer.product_id.lower()
            or needle in layer.dataset_id.lower()
        ]
    if exclude != "collection" and params.collection:
        wanted = set(params.collection)
        layers = [layer for layer in layers if layer.collection in wanted]
    if exclude != "region" and params.region:
        wanted = set(params.region)
        layers = [layer for layer in layers if layer.region in wanted]
    if exclude != "category" and params.category:
        wanted = set(params.category)
        layers = [layer for layer in layers if layer.category in wanted]
    if exclude != "friendly_variable_group" and params.friendly_variable_group:
        wanted = set(params.friendly_variable_group)
        layers = [layer for layer in layers if layer.friendly_variable_group in wanted]
    if exclude != "polygon" and params.selected_polygon_bboxes:
        wanted_bboxes = params.selected_polygon_bboxes
        # A layer with no advertised bbox at all can't be confirmed to
        # cover any area of interest - excluded rather than assumed global.
        layers = [
            layer
            for layer in layers
            if layer.bbox is not None and any(bboxes_intersect(layer.bbox, b) for b in wanted_bboxes)
        ]
    return layers


def _facet_label(dimension: str, value: str) -> str:
    if dimension == "collection":
        return COLLECTION_LABELS.get(value, value)
    if dimension == "region":
        return REGION_LABELS.get(value, value)
    if dimension == "category":
        return CATEGORY_LABELS.get(value, value)
    if value == "uncategorized":
        return "Uncategorized"
    return GROUP_LABELS.get(value, value)


def _facet_group(layers: list[WmtsLayerDescriptor], dimension: str) -> WmtsFacetGroup:
    counts: dict[str, int] = {}
    for layer in layers:
        if dimension == "collection":
            key = layer.collection
        elif dimension == "region":
            key = layer.region
        elif dimension == "category":
            key = layer.category
        else:  # friendlyVariableGroup
            key = layer.friendly_variable_group or "uncategorized"
        counts[key] = counts.get(key, 0) + 1

    values = [
        WmtsFacetValue(value=key, label=_facet_label(dimension, key), count=count)
        for key, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return WmtsFacetGroup(dimension=dimension, values=values)


def _polygon_facet_group(layers: list[WmtsLayerDescriptor], candidates: dict[str, BBox]) -> WmtsFacetGroup:
    """Unlike every other dimension, "polygon" has no backend-known value
    space - the candidates are whatever polygons the requesting browser has
    drawn this session (see wmts-catalog-client.ts). `label` is set to the
    id, not a real name: the frontend already has the user-facing label
    (e.g. "Polygon 2") locally and substitutes it in; the backend doesn't
    know it and doesn't need to."""
    values = [
        WmtsFacetValue(
            value=polygon_id,
            label=polygon_id,
            count=sum(1 for layer in layers if layer.bbox is not None and bboxes_intersect(layer.bbox, bbox)),
        )
        for polygon_id, bbox in candidates.items()
    ]
    return WmtsFacetGroup(dimension="polygon", values=values)


@router.get("", response_model=WmtsCatalogResponse)
async def list_wmts_layers(
    q: str | None = Query(default=None, description="Case-insensitive substring match against title/variable/product/dataset"),
    product: str | None = Query(default=None, description="Exact product_id filter, e.g. GLOBAL_ANALYSISFORECAST_BGC_001_028"),
    collection: Annotated[
        list[str] | None, Query(description="Filter to one or more collection facet values (OR'd)")
    ] = None,
    region: Annotated[list[str] | None, Query(description="Filter to one or more region facet values (OR'd)")] = None,
    category: Annotated[
        list[str] | None, Query(description="Filter to one or more category facet values (OR'd)")
    ] = None,
    friendly_variable_group: Annotated[
        list[str] | None,
        Query(alias="friendlyVariableGroup", description="Filter to one or more variable-group facet values (OR'd)"),
    ] = None,
    candidate_polygon: Annotated[
        list[str] | None,
        Query(
            alias="candidatePolygon",
            description='Every polygon the browser currently has drawn, as "<id>|<west>,<south>,<east>,<north>" - '
            "resolves selectedPolygon ids to a bbox to filter by; has no effect on its own",
        ),
    ] = None,
    selected_polygon: Annotated[
        list[str] | None,
        Query(alias="selectedPolygon", description="ids (from candidatePolygon) to filter by, OR'd"),
    ] = None,
    refresh: bool = Query(default=False, description="Bypass the cache and re-fetch GetCapabilities live"),
    limit: int | None = Query(
        default=None, ge=1, le=500, description="Cap the number of layers returned, applied after filtering"
    ),
    offset: int = Query(default=0, ge=0, description="Skip this many matches before applying limit - pagination"),
    sort: str | None = Query(
        default=None,
        description='"titleAsc"/"titleDesc" to sort by title instead of the default product/dataset/variable '
        "grouping (omit, or any other value, for that default)",
    ),
) -> WmtsCatalogResponse:
    try:
        layers, generated_at = await wmts_catalog_cache.get(force_refresh=refresh)
    except (httpx.HTTPError, ParseError) as exc:
        raise ApiError("upstream_error", f"Failed to fetch the Copernicus Marine WMTS catalog: {exc}") from None

    polygon_candidates = parse_polygon_candidates(candidate_polygon)
    params = _FilterParams(
        q=q,
        product=product,
        collection=collection,
        region=region,
        category=category,
        friendly_variable_group=friendly_variable_group,
        selected_polygon_bboxes=[
            polygon_candidates[pid] for pid in (selected_polygon or []) if pid in polygon_candidates
        ]
        or None,
    )
    layers = _apply_filters(layers, params)

    if sort == "titleAsc":
        layers.sort(key=lambda layer: _display_title_key(layer.title))
    elif sort == "titleDesc":
        layers.sort(key=lambda layer: _display_title_key(layer.title), reverse=True)
    else:
        # Sorted so pagination is stable AND group-coherent: the picker
        # groups a page's results by product_id client-side, which only
        # makes sense (no product split across a page boundary re-appearing
        # later as a second, disconnected group) if every layer for a
        # product is contiguous across the whole matched set, not just
        # within one page. Only holds under this default order - a title
        # sort interleaves products, so the picker renders a flat list
        # (no grouping) whenever a non-default sort is requested instead.
        layers.sort(key=lambda layer: (layer.product_id, layer.dataset_id, layer.variable))
    total_count = len(layers)
    layers = layers[offset:]
    if limit is not None:
        layers = layers[:limit]

    return WmtsCatalogResponse(
        generated_at=generated_at,
        source=COPERNICUS_WMTS_URL,
        count=len(layers),
        total_count=total_count,
        layers=layers,
    )


@router.get("/facets", response_model=WmtsFacetsResponse)
async def get_wmts_layer_facets(
    q: str | None = Query(default=None),
    collection: Annotated[list[str] | None, Query()] = None,
    region: Annotated[list[str] | None, Query()] = None,
    category: Annotated[list[str] | None, Query()] = None,
    friendly_variable_group: Annotated[list[str] | None, Query(alias="friendlyVariableGroup")] = None,
    candidate_polygon: Annotated[list[str] | None, Query(alias="candidatePolygon")] = None,
    selected_polygon: Annotated[list[str] | None, Query(alias="selectedPolygon")] = None,
    refresh: bool = Query(default=False),
) -> WmtsFacetsResponse:
    """Facet value counts for the current filter state - cheap, computed
    from the already-cached in-memory layer list, no re-parsing.

    Each dimension's own value counts are computed with every *other*
    active filter applied but never that dimension's own current
    selections (`_apply_filters(..., exclude=<dimension>)`) - this is what
    makes these real faceted-search counts: selecting "Arctic" under
    Region doesn't zero out every other region's count, only narrows what
    Collection/Category/variable-group counts are computed against.

    "polygon" is the one dimension whose *candidates* - not just which are
    selected - come from the request: the backend has no fixed value space
    for a browser's own drawn shapes the way it does for region/category
    (see _polygon_facet_group). A count is still computed for every
    candidate, selected or not, for the same reason: so checking one
    polygon doesn't hide the ability to also check another.
    """
    try:
        layers, _generated_at = await wmts_catalog_cache.get(force_refresh=refresh)
    except (httpx.HTTPError, ParseError) as exc:
        raise ApiError("upstream_error", f"Failed to fetch the Copernicus Marine WMTS catalog: {exc}") from None

    polygon_candidates = parse_polygon_candidates(candidate_polygon)
    params = _FilterParams(
        q=q,
        collection=collection,
        region=region,
        category=category,
        friendly_variable_group=friendly_variable_group,
        selected_polygon_bboxes=[
            polygon_candidates[pid] for pid in (selected_polygon or []) if pid in polygon_candidates
        ]
        or None,
    )

    total_count = len(_apply_filters(layers, params))
    facets = [
        _facet_group(_apply_filters(layers, params, exclude="collection"), "collection"),
        _facet_group(_apply_filters(layers, params, exclude="region"), "region"),
        _facet_group(_apply_filters(layers, params, exclude="category"), "category"),
        _facet_group(_apply_filters(layers, params, exclude="friendly_variable_group"), "friendlyVariableGroup"),
        _polygon_facet_group(_apply_filters(layers, params, exclude="polygon"), polygon_candidates),
    ]

    return WmtsFacetsResponse(
        generated_at=datetime.now(UTC).isoformat(),
        total_count=total_count,
        facets=facets,
    )
