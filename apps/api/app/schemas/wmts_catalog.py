"""Schema for the live Copernicus Marine WMTS layer catalog.

Distinct from `LayerDescriptor` (contracts §4.2) on purpose: that contract is
frozen for the team's own Postgres/PostGIS-backed source type and has no
field for an external WMTS tile source (see apps/web/src/lib/tiles/
data-layers-catalog.ts's header comment for the reasoning). This is a new,
unfrozen route/schema - nothing here reshapes the frozen one.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import CamelModel


class WmtsTimeDimension(CamelModel):
    default: str | None = None
    # A continuous "start/end/period" interval, e.g. period "P1D", "P1M", or
    # "PT21600S" - Copernicus uses both calendar (P1M/P1Y) and fixed-duration
    # (PTnnnnS) ISO 8601 periods depending on the product, so this stays a
    # string rather than a seconds-count the frontend must further interpret.
    interval_start: str | None = None
    interval_end: str | None = None
    interval_period: str | None = None
    # Set instead of the interval fields on the handful of layers that
    # advertise discrete timestamps rather than one compact interval.
    values: list[str] | None = None


class WmtsElevationDimension(CamelModel):
    default: str | None = None
    unit: str | None = None
    # Count only, not the full depth grid (~50 levels on most products) -
    # across 1451 layers a full per-layer depth array would bloat this bulk
    # response for no current UI use. A per-layer depth-grid lookup can be
    # added later (mirroring how value ranges are fetched lazily via
    # GetLegend) if a depth picker ever needs the exact values.
    level_count: int = 0


class WmtsLayerDescriptor(CamelModel):
    id: str  # "product_id/dataset_id/variable" - also the WMTS LAYER param
    product_id: str
    dataset_id: str
    variable: str
    title: str
    bbox: tuple[float, float, float, float] | None = None  # west, south, east, north
    default_style: str | None = None
    styles: list[str] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=list)
    time: WmtsTimeDimension | None = None
    elevation: WmtsElevationDimension | None = None
    # Facet fields, computed once at parse time (see app/services/
    # wmts_facets.py and wmts_variable_groups.py) - never recomputed
    # per-request, and defaulted here (not required) so an old disk-cache
    # seed written before these fields existed still deserializes instead
    # of crashing the cold-start path.
    collection: str = "other"
    region: str = "other"
    category: str = "other"
    friendly_variable_group: str | None = None


class WmtsFacetValue(CamelModel):
    value: str
    label: str
    # Computed with every *other* active filter dimension applied but not
    # this dimension's own current selections - see get_wmts_layer_facets's
    # docstring for why (this is what makes it a real faceted-search count
    # instead of a count that zeroes out every other option once you pick one).
    count: int


class WmtsFacetGroup(CamelModel):
    dimension: str
    values: list[WmtsFacetValue]


class WmtsFacetsResponse(CamelModel):
    generated_at: str
    # Count of layers matching every currently-active filter (q + all facet
    # selections) - the picker's "N results" header, distinct from each
    # individual facet value's own hold-out count above.
    total_count: int
    facets: list[WmtsFacetGroup]


class WmtsCatalogResponse(CamelModel):
    # ISO 8601 UTC timestamp of when this catalog was parsed from a live
    # GetCapabilities fetch - not "now" (the response may be cache-served).
    generated_at: str
    source: str
    # `count` is len(layers) - how many are in THIS response, after offset/
    # limit slicing. `total_count` is how many matched q/product before
    # slicing, so a paginating caller (the picker's infinite scroll) knows
    # whether `offset + count` has reached the end without a separate call.
    count: int
    total_count: int
    layers: list[WmtsLayerDescriptor]
