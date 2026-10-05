"""Bounding-box geometry for the "filter by my drawn polygons" facet.

Deliberately just an axis-aligned rectangle overlap test against each
layer's own advertised WGS84BoundingBox (already parsed from
GetCapabilities, see wmts_catalog.py) - not a real polygon-vs-polygon or
point-in-polygon test. That's the right level of precision here: a
Copernicus product's bbox already reflects its true data extent (tight for
a regional product, ~global for a global one), so "does the user's
drawn-shape bbox overlap this layer's bbox" is an accurate proxy for "does
this layer have data in the user's area of interest" without needing to
query any actual pixel data. Antimeridian-crossing shapes (a bbox spanning
e.g. 170°E to -170°E) are NOT handled - a known, rare-in-practice
limitation rather than something worth the extra complexity here.
"""

from __future__ import annotations

BBox = tuple[float, float, float, float]  # west, south, east, north


def bboxes_intersect(a: BBox, b: BBox) -> bool:
    a_west, a_south, a_east, a_north = a
    b_west, b_south, b_east, b_north = b
    return a_west <= b_east and b_west <= a_east and a_south <= b_north and b_south <= a_north


def parse_polygon_candidates(raw: list[str] | None) -> dict[str, BBox]:
    """Parses `"<id>|<west>,<south>,<east>,<north>"` query-param entries (see
    apps/web/src/lib/tiles/wmts-catalog-client.ts's candidatePolygon
    serialization) into an id -> bbox map. Silently skips any entry that
    doesn't parse - a malformed candidate from a stale/corrupted client
    should degrade to "not selectable", never a 400 for the whole request."""
    candidates: dict[str, BBox] = {}
    for entry in raw or []:
        try:
            polygon_id, coords = entry.split("|", 1)
            west, south, east, north = (float(v) for v in coords.split(","))
        except ValueError:
            continue
        candidates[polygon_id] = (west, south, east, north)
    return candidates
