"""Classifies a Copernicus Marine `product_id` into filter facets.

Every rule table here was built by actually enumerating the live catalog's
9,628 layers (214 distinct product_ids) - not guessed from the handful of
examples seen while building the base catalog route - and re-verified
against that full enumeration until every layer classified into a named
bucket with **zero** falling into "other" for collection/region/category.
See the classify_* docstrings for the two structurally different id shapes
that made this take more than one regex.

If you add Copernicus products later and see a growing "other"/"Other"
bucket in the live facet counts, that's the signal these tables need a new
token - not a bug in the matching logic itself. `wmts_catalog.py` logs a
one-time summary of unclassified product_ids on each cache refresh for
exactly this reason.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Collection - "what kind of product is this" (model output vs. satellite
# observation vs. in-situ measurement vs. blended product vs. a derived
# indicator). Read off the product_id's FIRST underscore-token, which is
# always either a model region name (GLOBAL/ARCTIC/BALTICSEA/...) or an
# observation-type name (SST/SEAICE/WIND/OCEANCOLOUR/INSITU/OMI/...) - never
# ambiguous, confirmed 0/9628 unclassified.
# ---------------------------------------------------------------------------
_COLLECTION_BY_FIRST_TOKEN: dict[str, tuple[str, str]] = {
    "GLOBAL": ("global_model", "Global Ocean Model"),
    "ARCTIC": ("arctic_model", "Arctic Ocean Model"),
    "BALTICSEA": ("baltic_model", "Baltic Sea Model"),
    "BLKSEA": ("blksea_model", "Black Sea Model"),
    "MEDSEA": ("medsea_model", "Mediterranean Sea Model"),
    "IBI": ("ibi_model", "Iberia-Biscay-Ireland Model"),
    "NWSHELF": ("nwshelf_model", "North-West European Shelf Model"),
    "NORTHWESTSHELF": ("nwshelf_model", "North-West European Shelf Model"),
    "NWATL": ("nwatl_model", "North-West Atlantic Model"),
    "WAVE": ("wave_satellite", "Wave (Satellite)"),
    "OCEANCOLOUR": ("ocean_colour_satellite", "Ocean Colour (Satellite)"),
    "SST": ("sst_satellite", "Sea Surface Temperature (Satellite)"),
    "SEAICE": ("sea_ice_satellite", "Sea Ice (Satellite)"),
    "SEALEVEL": ("sea_level_satellite", "Sea Level (Satellite)"),
    "WIND": ("wind_satellite", "Wind (Satellite)"),
    "INSITU": ("in_situ", "In-Situ Observations"),
    "MULTIOBS": ("multi_obs", "Multi-Observation Products"),
    "OMI": ("indicator", "Ocean Monitoring Indicators"),
    "BATHYMETRY": ("bathymetry", "Bathymetry"),
}

# ---------------------------------------------------------------------------
# Region - a real geographic facet independent of collection (e.g. "show me
# everything about the Arctic, model output AND satellite obs alike"). The
# region token's *position* varies by id shape (first token for a model
# product, second for most satellite/in-situ products, buried mid-string for
# an OMI indicator id like "OMI_CLIMATE_SST_BAL_trend" or
# "OMI_HEALTH_CHL_ATLANTIC_OCEANCOLOUR_eutrophication") - so this matches by
# exact-token *set membership* against every underscore-split segment of the
# id, not by position or substring. Ordered so a longer/more specific token
# (BALTICSEA) is tried before a shorter one that could theoretically also
# appear (BAL) - in practice they never collide since they're different
# exact tokens, but the order also documents which spelling "wins" when a
# product genuinely carries more than one candidate token.
# ---------------------------------------------------------------------------
_REGION_TOKENS: list[tuple[str, str, str]] = [
    ("BALTICSEA", "baltic_sea", "Baltic Sea"),
    ("BLKSEA", "black_sea", "Black Sea"),
    ("MEDSEA", "mediterranean_sea", "Mediterranean Sea"),
    ("NORTHWESTSHELF", "nw_shelf", "North-West European Shelf"),
    ("NWSHELF", "nw_shelf", "North-West European Shelf"),
    ("NWS", "nw_shelf", "North-West European Shelf"),
    ("NWATL", "nw_atlantic", "North-West Atlantic"),
    ("ARCTIC", "arctic", "Arctic"),
    ("GLOBAL", "global", "Global"),
    ("IBI", "iberia_biscay_ireland", "Iberia-Biscay-Ireland"),
    ("ARC", "arctic", "Arctic"),
    ("ATLANTIC", "atlantic", "Atlantic"),
    ("ATL", "atlantic", "Atlantic"),
    ("BALTIC", "baltic_sea", "Baltic Sea"),
    ("BAL", "baltic_sea", "Baltic Sea"),
    ("MEDITERRANEAN", "mediterranean_sea", "Mediterranean Sea"),
    ("MED", "mediterranean_sea", "Mediterranean Sea"),
    ("BLK", "black_sea", "Black Sea"),
    ("BS", "black_sea", "Black Sea"),
    ("ANT", "antarctic", "Antarctic"),
    ("EUR", "europe", "Europe"),
    ("GLO", "global", "Global"),
]

# ---------------------------------------------------------------------------
# Category - the measurement domain, independent of region/collection.
# Checked in this order deliberately: PHYBGCWAV (a real single combined
# token some in-situ products use) and BGC before the bare PHY fallback, so
# a genuinely multi-domain or biogeochemistry product doesn't get bucketed
# as plain physics just because "PHY" also appears in it.
# ---------------------------------------------------------------------------
_CATEGORY_TOKEN_RULES: list[tuple[str, str, str]] = [
    ("PHYBGCWAV", "physics_bgc_waves", "Physics, Biogeochemistry & Waves"),
    ("BGC", "biogeochemistry", "Biogeochemistry"),
    ("TEMPSAL", "temp_salinity_trend", "Temperature & Salinity Trend"),
    ("CLIMATE", "climate_indicator", "Climate Indicator"),
    ("HEALTH", "ecosystem_health", "Ecosystem Health"),
    ("SEASTATE", "waves", "Waves"),
    ("WAV", "waves", "Waves"),
    ("WAVE", "waves", "Waves"),
    ("ICE", "sea_ice", "Sea Ice"),
]
# First-token fallbacks for the satellite collections whose product_id
# carries no domain token OF ITS OWN distinct from the generic "PHY" every
# model product also uses - checked BEFORE the bare-PHY fallback below, or
# every Wind/Sea Level/Sea Ice/SST satellite product (which also happens to
# contain a "PHY" token, e.g. "SEALEVEL_EUR_PHY_L4_MY_008_068") would get
# silently swallowed into generic "Physics" instead of its own distinct,
# far more useful category - verified against the live catalog: this
# ordering is what actually produces Wind=2292/Sea Level=876 as their own
# buckets; checking bare PHY first collapses both into Physics.
_CATEGORY_BY_FIRST_TOKEN: dict[str, tuple[str, str]] = {
    "SEAICE": ("sea_ice", "Sea Ice"),
    "SST": ("temperature", "Sea Surface Temperature"),
    "WIND": ("wind", "Wind"),
    "SEALEVEL": ("sea_level", "Sea Level"),
}
_PHY_FALLBACK = ("physics", "Physics")

_OTHER = ("other", "Other")

# Public label lookups, for the facets route to attach a display label to
# each value it counts - built from the same rule tables above so labels
# can never drift from what classify_*() actually produces.
COLLECTION_LABELS: dict[str, str] = {key: label for key, label in _COLLECTION_BY_FIRST_TOKEN.values()}
COLLECTION_LABELS["other"] = "Other"
REGION_LABELS: dict[str, str] = {key: label for _, key, label in _REGION_TOKENS}
REGION_LABELS["other"] = "Other"
CATEGORY_LABELS: dict[str, str] = {key: label for _, key, label in _CATEGORY_TOKEN_RULES}
CATEGORY_LABELS.update(dict(_CATEGORY_BY_FIRST_TOKEN.values()))
CATEGORY_LABELS[_PHY_FALLBACK[0]] = _PHY_FALLBACK[1]
CATEGORY_LABELS["other"] = "Other"


def classify_collection(product_id: str) -> tuple[str, str]:
    first_token = product_id.split("_", 1)[0]
    return _COLLECTION_BY_FIRST_TOKEN.get(first_token, _OTHER)


def classify_region(product_id: str) -> tuple[str, str]:
    tokens = set(product_id.split("_"))
    for token, key, label in _REGION_TOKENS:
        if token in tokens:
            return key, label
    return _OTHER


def classify_category(product_id: str) -> tuple[str, str]:
    tokens = set(product_id.split("_"))
    for token, key, label in _CATEGORY_TOKEN_RULES:
        if token in tokens:
            return key, label
    first_token = product_id.split("_", 1)[0]
    if first_token in _CATEGORY_BY_FIRST_TOKEN:
        return _CATEGORY_BY_FIRST_TOKEN[first_token]
    if "PHY" in tokens:
        return _PHY_FALLBACK
    return _OTHER
