"""Unit tests for app.services.wmts_facets and wmts_variable_groups -
pure functions, no cache/route/XML involved. Coverage here mirrors what
was actually verified against the live ~9,628-layer catalog while building
these tables (0% "other" for all three classify_* dimensions) - see
wmts_facets.py's module docstring."""

from __future__ import annotations

from app.services.wmts_facets import (
    classify_category,
    classify_collection,
    classify_region,
)
from app.services.wmts_variable_groups import classify_variable


def test_classify_collection_standard_model_shape() -> None:
    assert classify_collection("ARCTIC_ANALYSISFORECAST_PHY_002_001")[0] == "arctic_model"
    assert classify_collection("GLOBAL_MULTIYEAR_BGC_001_029")[0] == "global_model"


def test_classify_collection_satellite_shape() -> None:
    assert classify_collection("SST_ATL_PHY_L3S_MY_010_038")[0] == "sst_satellite"
    assert classify_collection("SEAICE_ARC_PHY_AUTO_L3_NRT_011_023")[0] == "sea_ice_satellite"
    assert classify_collection("OCEANCOLOUR_GLO_BGC_L3_MY_009_107")[0] == "ocean_colour_satellite"


def test_classify_collection_indicator_and_unknown() -> None:
    assert classify_collection("OMI_CLIMATE_OHC_GLOBAL_trend")[0] == "indicator"
    assert classify_collection("SOMETHING_NEW_001")[0] == "other"


def test_classify_region_first_token_model_shape() -> None:
    assert classify_region("ARCTIC_ANALYSISFORECAST_PHY_002_001")[0] == "arctic"


def test_classify_region_second_token_satellite_shape() -> None:
    assert classify_region("SST_ATL_PHY_L3S_MY_010_038")[0] == "atlantic"
    assert classify_region("OCEANCOLOUR_ARC_BGC_L3_MY_009_123")[0] == "arctic"


def test_classify_region_buried_token_omi_shape() -> None:
    """OMI indicator ids don't follow a fixed region position at all -
    region can be a later free-floating token, matched by set membership
    rather than position."""
    assert classify_region("OMI_CLIMATE_SST_BAL_trend")[0] == "baltic_sea"
    assert classify_region("OMI_HEALTH_CHL_ATLANTIC_OCEANCOLOUR_eutrophication")[0] == "atlantic"


def test_classify_region_unclassifiable_falls_back_to_other() -> None:
    assert classify_region("MYSTERIOUS_PRODUCT_042")[0] == "other"


def test_classify_category_bgc_takes_priority_over_bare_phy() -> None:
    # A product carrying both BGC and PHY-shaped tokens must not be
    # mis-bucketed as plain physics.
    assert classify_category("GLOBAL_ANALYSISFORECAST_BGC_001_028")[0] == "biogeochemistry"


def test_classify_category_combined_insitu_token() -> None:
    assert classify_category("INSITU_ARC_PHYBGCWAV_DISCRETE_MYNRT_013_031")[0] == "physics_bgc_waves"


def test_classify_category_satellite_first_token_fallback_beats_bare_phy() -> None:
    """These ids also contain a "PHY" token (e.g. "SEALEVEL_EUR_PHY_L4_..."),
    same as every model product - the first-token fallback must be checked
    before the generic PHY rule, or Wind/Sea Level collapse into a
    non-distinct "Physics" bucket instead of their own useful category."""
    assert classify_category("SEALEVEL_EUR_PHY_L4_MY_008_068")[0] == "sea_level"
    assert classify_category("WIND_ARC_PHY_HR_L3_MY_012_105")[0] == "wind"


def test_classify_category_wave_shaped_omi_id() -> None:
    assert classify_category("OMI_EXTREME_WAVE_BLKSEA_wave_power")[0] == "waves"
    assert classify_category("IBI_OMI_SEASTATE_swi")[0] == "waves"


def test_classify_category_unclassifiable_falls_back_to_other() -> None:
    assert classify_category("MYSTERIOUS_PRODUCT_042")[0] == "other"


def test_classify_variable_known_codes() -> None:
    assert classify_variable("thetao") == "temperature"
    assert classify_variable("chl") == "chlorophyll_ocean_colour"
    assert classify_variable("VHM0") == "waves"


def test_classify_variable_silicate_vs_sea_ice_collision() -> None:
    """The exact collision this table's docstring warns about - silicate
    ('si', a nutrient) must never match via substring against the
    sea-ice-prefixed codes."""
    assert classify_variable("si") == "biogeochemistry_nutrients"
    assert classify_variable("siconc") == "sea_ice"
    assert classify_variable("sithick") == "sea_ice"


def test_classify_variable_unmapped_returns_none() -> None:
    assert classify_variable("POSITION_QC") is None
    assert classify_variable("some_unmapped_code_xyz") is None
