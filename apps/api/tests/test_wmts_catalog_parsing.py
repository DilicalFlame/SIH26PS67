"""Tests for app.services.wmts_catalog.parse_capabilities - pure/offline,
no network. A small synthetic GetCapabilities document stands in for the
real ~65MB one; only the shapes this parser actually reads are modelled:
namespaced ows:Identifier/ows:Title/ows:WGS84BoundingBox, Style (with
isDefault), Format, and time/elevation Dimension blocks."""

from __future__ import annotations

from app.services.wmts_catalog import parse_capabilities

_SAMPLE_CAPABILITIES = """<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0"
              xmlns:ows="http://www.opengis.net/ows/1.1">
  <Contents>
    <Layer queryable="1">
      <ows:Identifier>GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao</ows:Identifier>
      <ows:Title>cmems_mod_glo_phy_my_0.083deg_P1D-m_202311 - Temperature (thetao)</ows:Title>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>-180 -80</ows:LowerCorner>
        <ows:UpperCorner>179.9166717529297 90</ows:UpperCorner>
      </ows:WGS84BoundingBox>
      <Style isDefault="true">
        <ows:Identifier>cmap:thermal</ows:Identifier>
      </Style>
      <Style>
        <ows:Identifier>cmap:viridis</ows:Identifier>
      </Style>
      <Format>image/png</Format>
      <Dimension>
        <ows:Identifier>time</ows:Identifier>
        <ows:UOM>ISO8601</ows:UOM>
        <Default>2026-06-23T00:00:00.000Z</Default>
        <Value>1993-01-01T00:00:00Z/2026-06-23T00:00:00Z/P1D</Value>
      </Dimension>
      <Dimension>
        <ows:Identifier>elevation</ows:Identifier>
        <UnitSymbol>m</UnitSymbol>
        <Default>-0.49402499198913574</Default>
        <Value>-5727.9169921875</Value>
        <Value>-5274.7841796875</Value>
        <Value>-0.49402499198913574</Value>
      </Dimension>
    </Layer>
    <Layer queryable="1">
      <ows:Identifier>GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy_anfc_0.083deg_static_202211--ext--bathy/deptho</ows:Identifier>
      <ows:Title>cmems_mod_glo_phy_anfc_0.083deg_static_202211--ext--bathy - Depth (deptho)</ows:Title>
      <Style isDefault="true">
        <ows:Identifier>cmap:viridis</ows:Identifier>
      </Style>
      <Format>image/png</Format>
    </Layer>
    <Layer queryable="1">
      <ows:Identifier>malformed-identifier-without-slashes</ows:Identifier>
      <ows:Title>Should be skipped</ows:Title>
      <Style isDefault="true">
        <ows:Identifier>cmap:viridis</ows:Identifier>
      </Style>
    </Layer>
    <Layer queryable="1">
      <ows:Identifier>BALTICSEA_ANALYSISFORECAST_BGC_003_007/cmems_mod_bal_bgc_anfc_static_202311--ext--coords/e1t</ows:Identifier>
      <ows:Title>cmems_mod_bal_bgc_anfc_static_202311--ext--coords - Cell dimension along X axis (e1t)</ows:Title>
      <Style isDefault="true">
        <ows:Identifier>cmap:viridis</ows:Identifier>
      </Style>
    </Layer>
  </Contents>
</Capabilities>
"""


def test_parses_a_full_time_and_elevation_layer() -> None:
    layers = parse_capabilities(_SAMPLE_CAPABILITIES.encode("utf-8"))
    thetao = next(layer for layer in layers if layer.variable == "thetao")

    assert thetao.id == "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao"
    assert thetao.product_id == "GLOBAL_MULTIYEAR_PHY_001_030"
    assert thetao.dataset_id == "cmems_mod_glo_phy_my_0.083deg_P1D-m_202311"
    assert thetao.title == "cmems_mod_glo_phy_my_0.083deg_P1D-m_202311 - Temperature (thetao)"
    assert thetao.bbox == (-180.0, -80.0, 179.9166717529297, 90.0)
    assert thetao.default_style == "cmap:thermal"
    assert thetao.styles == ["cmap:thermal", "cmap:viridis"]
    assert thetao.formats == ["image/png"]

    assert thetao.time is not None
    assert thetao.time.default == "2026-06-23T00:00:00.000Z"
    assert thetao.time.interval_start == "1993-01-01T00:00:00Z"
    assert thetao.time.interval_end == "2026-06-23T00:00:00Z"
    assert thetao.time.interval_period == "P1D"
    assert thetao.time.values is None

    assert thetao.elevation is not None
    assert thetao.elevation.default == "-0.49402499198913574"
    assert thetao.elevation.unit == "m"
    assert thetao.elevation.level_count == 3


def test_static_layer_has_no_time_or_elevation_dimension() -> None:
    layers = parse_capabilities(_SAMPLE_CAPABILITIES.encode("utf-8"))
    deptho = next(layer for layer in layers if layer.variable == "deptho")

    assert deptho.time is None
    assert deptho.elevation is None
    assert deptho.bbox is None


def test_skips_layers_with_unexpected_identifier_shape() -> None:
    layers = parse_capabilities(_SAMPLE_CAPABILITIES.encode("utf-8"))

    assert all(layer.id != "malformed-identifier-without-slashes" for layer in layers)
    assert len(layers) == 2


def test_skips_grid_metadata_variables_but_keeps_real_bathymetry() -> None:
    """e1t (a grid cell dimension, not a measurement) must never reach the
    catalog, while deptho (real sea floor depth) - present in the same
    sample document - must still come through untouched. See
    _GRID_METADATA_VARIABLES's doc comment for why these are treated
    differently despite both being "static" layers."""
    layers = parse_capabilities(_SAMPLE_CAPABILITIES.encode("utf-8"))

    assert all(layer.variable != "e1t" for layer in layers)
    assert any(layer.variable == "deptho" for layer in layers)


def test_parsed_layers_carry_facet_fields() -> None:
    """Classification (app/services/wmts_facets.py, wmts_variable_groups.py)
    happens inside _parse_layer - this confirms the wiring actually sets
    the fields on the resulting descriptor, not just that the classify_*
    functions work in isolation (already covered by test_wmts_facets.py)."""
    layers = parse_capabilities(_SAMPLE_CAPABILITIES.encode("utf-8"))
    thetao = next(layer for layer in layers if layer.variable == "thetao")
    deptho = next(layer for layer in layers if layer.variable == "deptho")

    assert thetao.collection == "global_model"
    assert thetao.region == "global"
    assert thetao.category == "physics"
    assert thetao.friendly_variable_group == "temperature"

    assert deptho.collection == "global_model"
    assert deptho.region == "global"
    assert deptho.category == "physics"
    assert deptho.friendly_variable_group == "bathymetry_grid"
