"""Tests for GET /api/v1/catalog/wmts-layers and .../wmts-layers/facets.

Monkeypatches the module-level `wmts_catalog_cache` singleton's `get()`
instead of hitting the real Copernicus WMTS - this route's job is
filtering/shaping whatever the cache returns, not re-verifying the live
fetch (that's exercised manually against the real service; see the parsing
unit tests for the offline-testable half of that path).

The fixture below sets collection/region/category/friendlyVariableGroup
explicitly per layer (real values, matching what wmts_facets.py/
wmts_variable_groups.py would actually produce for these product_ids/
variables - verified separately in test_wmts_facets.py) rather than
running the sample data through the classifiers, so these tests only ever
exercise the route's filtering/faceting logic, not classification
correctness.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import wmts_catalog as wmts_catalog_route
from app.main import create_app
from app.schemas.wmts_catalog import WmtsLayerDescriptor

_SAMPLE_LAYERS = [
    WmtsLayerDescriptor(
        id="ARCTIC_ANALYSISFORECAST_PHY_002_001/cmems_mod_arc_phy_anfc_6km_detided_P1D-m_202311/so",
        product_id="ARCTIC_ANALYSISFORECAST_PHY_002_001",
        dataset_id="cmems_mod_arc_phy_anfc_6km_detided_P1D-m_202311",
        variable="so",
        title="cmems_mod_arc_phy_anfc_6km_detided_P1D-m_202311 - Salinity (so)",
        bbox=(-180.0, 50.0, 179.75, 90.0),
        default_style="cmap:haline",
        styles=["cmap:haline"],
        formats=["image/png"],
        collection="arctic_model",
        region="arctic",
        category="physics",
        friendly_variable_group="salinity",
    ),
    WmtsLayerDescriptor(
        id="GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao",
        product_id="GLOBAL_MULTIYEAR_PHY_001_030",
        dataset_id="cmems_mod_glo_phy_my_0.083deg_P1D-m_202311",
        variable="thetao",
        title="cmems_mod_glo_phy_my_0.083deg_P1D-m_202311 - Temperature (thetao)",
        bbox=(-180.0, -90.0, 180.0, 90.0),
        default_style="cmap:thermal",
        styles=["cmap:thermal"],
        formats=["image/png"],
        collection="global_model",
        region="global",
        category="physics",
        friendly_variable_group="temperature",
    ),
    WmtsLayerDescriptor(
        id="GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m_202311/chl",
        product_id="GLOBAL_ANALYSISFORECAST_BGC_001_028",
        dataset_id="cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m_202311",
        variable="chl",
        title="cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m_202311 - Total Chlorophyll (chl)",
        bbox=(-180.0, -90.0, 180.0, 90.0),
        default_style="cmap:algae",
        styles=["cmap:algae"],
        formats=["image/png"],
        collection="global_model",
        region="global",
        category="biogeochemistry",
        friendly_variable_group="chlorophyll_ocean_colour",
    ),
    WmtsLayerDescriptor(
        # bbox deliberately left None - exercises "a layer with no
        # advertised bbox is excluded from a polygon filter" in
        # TestPolygonFilter below.
        id="GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m_202311/o2",
        product_id="GLOBAL_ANALYSISFORECAST_BGC_001_028",
        dataset_id="cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m_202311",
        variable="o2",
        title="cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m_202311 - Dissolved Oxygen (o2)",
        default_style="cmap:matter",
        styles=["cmap:matter"],
        formats=["image/png"],
        collection="global_model",
        region="global",
        category="biogeochemistry",
        friendly_variable_group="biogeochemistry_nutrients",
    ),
    WmtsLayerDescriptor(
        # An OMI-shaped indicator id (see wmts_facets.py) - no separate
        # product/variable naming shape from the model-region-first ids
        # above, and "ohc" (ocean heat content) is deliberately absent from
        # wmts_variable_groups.py's curated table, so this also exercises
        # the "Uncategorized" friendlyVariableGroup bucket.
        id="OMI_CLIMATE_OHC_GLOBAL_trend/cmems_obs-omi_glo_phy-heat-content_my_trend_P1Y-m_202411/ohc",
        product_id="OMI_CLIMATE_OHC_GLOBAL_trend",
        dataset_id="cmems_obs-omi_glo_phy-heat-content_my_trend_P1Y-m_202411",
        variable="ohc",
        title="cmems_obs-omi_glo_phy-heat-content_my_trend_P1Y-m_202411 - Ocean Heat Content Trend (ohc)",
        default_style="cmap:thermal",
        styles=["cmap:thermal"],
        formats=["image/png"],
        collection="indicator",
        region="global",
        category="climate_indicator",
        friendly_variable_group=None,
    ),
]


@pytest.fixture(autouse=True)
def _patched_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(*, force_refresh: bool = False) -> tuple[list[WmtsLayerDescriptor], str]:
        return _SAMPLE_LAYERS, "2026-09-19T00:00:00+00:00"

    monkeypatch.setattr(wmts_catalog_route.wmts_catalog_cache, "get", fake_get)


def test_list_wmts_layers_returns_everything_by_default() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 5
    assert body["totalCount"] == 5
    assert body["source"] == "https://wmts.marine.copernicus.eu/teroWmts"
    assert {layer["variable"] for layer in body["layers"]} == {"so", "chl", "o2", "thetao", "ohc"}


def test_list_wmts_layers_sorts_by_product_then_dataset_then_variable() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers")

    body = resp.json()
    # ARCTIC_... < GLOBAL_ANALYSISFORECAST_BGC_... < GLOBAL_MULTIYEAR_PHY_... < OMI_...
    # and within the shared BGC product, dataset "bgc-bio" < "bgc-pft".
    assert [layer["variable"] for layer in body["layers"]] == ["so", "o2", "chl", "thetao", "ohc"]


def test_list_wmts_layers_filters_by_product() -> None:
    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/catalog/wmts-layers", params={"product": "GLOBAL_ANALYSISFORECAST_BGC_001_028"}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert body["totalCount"] == 2
    assert {layer["variable"] for layer in body["layers"]} == {"chl", "o2"}


def test_list_wmts_layers_applies_limit_after_filtering() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers", params={"limit": 1})

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["totalCount"] == 5
    assert len(body["layers"]) == 1


def test_list_wmts_layers_offset_paginates_without_gaps_or_overlap() -> None:
    client = TestClient(create_app())
    page1 = client.get("/api/v1/catalog/wmts-layers", params={"limit": 2, "offset": 0}).json()
    page2 = client.get("/api/v1/catalog/wmts-layers", params={"limit": 2, "offset": 2}).json()
    page3 = client.get("/api/v1/catalog/wmts-layers", params={"limit": 2, "offset": 4}).json()

    assert [layer["variable"] for layer in page1["layers"]] == ["so", "o2"]
    assert [layer["variable"] for layer in page2["layers"]] == ["chl", "thetao"]
    assert [layer["variable"] for layer in page3["layers"]] == ["ohc"]
    assert page1["totalCount"] == page2["totalCount"] == page3["totalCount"] == 5


def test_list_wmts_layers_filters_by_search_query() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers", params={"q": "chlorophyll"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["totalCount"] == 1
    assert body["layers"][0]["variable"] == "chl"


def test_list_wmts_layers_filters_by_region() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers", params={"region": "arctic"})

    body = resp.json()
    assert body["totalCount"] == 1
    assert body["layers"][0]["variable"] == "so"


def test_list_wmts_layers_filters_by_multiple_regions_ored() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers", params=[("region", "arctic"), ("region", "global")])

    body = resp.json()
    assert body["totalCount"] == 5  # every sample layer is arctic or global


def test_list_wmts_layers_filters_by_category_and_collection_anded() -> None:
    client = TestClient(create_app())
    resp = client.get(
        "/api/v1/catalog/wmts-layers",
        params={"category": "biogeochemistry", "collection": "global_model"},
    )

    body = resp.json()
    assert body["totalCount"] == 2
    assert {layer["variable"] for layer in body["layers"]} == {"chl", "o2"}


def test_list_wmts_layers_filters_by_friendly_variable_group() -> None:
    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers", params={"friendlyVariableGroup": "salinity"})

    body = resp.json()
    assert body["totalCount"] == 1
    assert body["layers"][0]["variable"] == "so"


def test_list_wmts_layers_surfaces_upstream_failures_as_error_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import httpx

    async def failing_get(*, force_refresh: bool = False) -> tuple[list[WmtsLayerDescriptor], str]:
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(wmts_catalog_route.wmts_catalog_cache, "get", failing_get)

    client = TestClient(create_app())
    resp = client.get("/api/v1/catalog/wmts-layers")

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "upstream_error"


class TestFacets:
    def test_facets_unfiltered_counts_every_dimension(self) -> None:
        client = TestClient(create_app())
        resp = client.get("/api/v1/catalog/wmts-layers/facets")

        assert resp.status_code == 200
        body = resp.json()
        assert body["totalCount"] == 5
        by_dimension = {group["dimension"]: group for group in body["facets"]}
        assert set(by_dimension) == {"collection", "region", "category", "friendlyVariableGroup", "polygon"}
        # No candidatePolygon params were sent - the group exists but is
        # empty rather than absent (see TestPolygonFilter for a populated one).
        assert by_dimension["polygon"]["values"] == []

        region_counts = {v["value"]: v["count"] for v in by_dimension["region"]["values"]}
        assert region_counts == {"arctic": 1, "global": 4}

        friendly_counts = {v["value"]: v["count"] for v in by_dimension["friendlyVariableGroup"]["values"]}
        assert friendly_counts["uncategorized"] == 1  # ohc, deliberately unmapped

    def test_facets_labels_are_human_friendly_not_raw_keys(self) -> None:
        client = TestClient(create_app())
        body = client.get("/api/v1/catalog/wmts-layers/facets").json()
        region_values = {v["value"]: v["label"] for v in next(g for g in body["facets"] if g["dimension"] == "region")["values"]}

        assert region_values["arctic"] == "Arctic"
        assert region_values["global"] == "Global"

    def test_facets_own_dimension_selection_does_not_zero_out_other_options(self) -> None:
        """The core faceted-search guarantee: selecting one region must not
        make every OTHER region's count disappear from the region facet
        group itself - only cross-dimension filters should narrow it."""
        client = TestClient(create_app())
        resp = client.get("/api/v1/catalog/wmts-layers/facets", params={"region": "arctic"})

        body = resp.json()
        assert body["totalCount"] == 1  # the actual filtered result count
        region_group = next(g for g in body["facets"] if g["dimension"] == "region")
        region_counts = {v["value"]: v["count"] for v in region_group["values"]}
        # Both options still present with their own real (unfiltered-by-self) counts.
        assert region_counts == {"arctic": 1, "global": 4}

    def test_facets_cross_dimension_filter_narrows_other_dimensions(self) -> None:
        """Unlike a dimension's own selections, a filter on a DIFFERENT
        dimension must narrow what's counted."""
        client = TestClient(create_app())
        resp = client.get("/api/v1/catalog/wmts-layers/facets", params={"category": "biogeochemistry"})

        body = resp.json()
        assert body["totalCount"] == 2
        region_group = next(g for g in body["facets"] if g["dimension"] == "region")
        region_counts = {v["value"]: v["count"] for v in region_group["values"]}
        # Both BGC layers are "global" - arctic (the physics-only layer)
        # must disappear entirely once biogeochemistry is selected.
        assert region_counts == {"global": 2}

    def test_facets_surfaces_upstream_failures_as_error_envelope(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import httpx

        async def failing_get(*, force_refresh: bool = False) -> tuple[list[WmtsLayerDescriptor], str]:
            raise httpx.ConnectTimeout("timed out")

        monkeypatch.setattr(wmts_catalog_route.wmts_catalog_cache, "get", failing_get)

        client = TestClient(create_app())
        resp = client.get("/api/v1/catalog/wmts-layers/facets")

        assert resp.status_code == 502
        assert resp.json()["error"]["code"] == "upstream_error"


class TestPolygonFilter:
    """Fixture bboxes: so=Arctic-only, thetao/chl=whole globe, o2/ohc=None
    (no advertised bbox at all)."""

    _ARCTIC_POLYGON = "arctic|-10,70,10,85"  # inside so's bbox
    _EQUATOR_POLYGON = "equator|-10,-5,10,5"  # outside so's bbox, inside the global ones
    _FAR_POLYGON = "far|150,-80,160,-70"  # disjoint from every fixture layer

    def test_filters_by_selected_polygon_bbox(self) -> None:
        client = TestClient(create_app())
        resp = client.get(
            "/api/v1/catalog/wmts-layers",
            params=[("candidatePolygon", self._ARCTIC_POLYGON), ("selectedPolygon", "arctic")],
        )
        body = resp.json()
        assert body["totalCount"] == 3
        assert {layer["variable"] for layer in body["layers"]} == {"so", "thetao", "chl"}

    def test_excludes_layers_with_no_bbox_even_though_other_filters_would_match(self) -> None:
        client = TestClient(create_app())
        resp = client.get(
            "/api/v1/catalog/wmts-layers",
            params=[("candidatePolygon", self._ARCTIC_POLYGON), ("selectedPolygon", "arctic")],
        )
        variables = {layer["variable"] for layer in resp.json()["layers"]}
        assert "o2" not in variables
        assert "ohc" not in variables

    def test_polygon_outside_a_regional_layers_coverage_excludes_it(self) -> None:
        client = TestClient(create_app())
        resp = client.get(
            "/api/v1/catalog/wmts-layers",
            params=[("candidatePolygon", self._EQUATOR_POLYGON), ("selectedPolygon", "equator")],
        )
        assert {layer["variable"] for layer in resp.json()["layers"]} == {"thetao", "chl"}

    def test_multiple_selected_polygons_are_ored(self) -> None:
        client = TestClient(create_app())
        resp = client.get(
            "/api/v1/catalog/wmts-layers",
            params=[
                ("candidatePolygon", self._ARCTIC_POLYGON),
                ("candidatePolygon", self._FAR_POLYGON),
                ("selectedPolygon", "arctic"),
                ("selectedPolygon", "far"),
            ],
        )
        assert {layer["variable"] for layer in resp.json()["layers"]} == {"so", "thetao", "chl"}

    def test_an_unselected_candidate_has_no_filtering_effect(self) -> None:
        client = TestClient(create_app())
        resp = client.get("/api/v1/catalog/wmts-layers", params=[("candidatePolygon", self._FAR_POLYGON)])
        assert resp.json()["totalCount"] == 5

    def test_facets_polygon_group_counts_every_candidate_regardless_of_selection(self) -> None:
        client = TestClient(create_app())
        resp = client.get(
            "/api/v1/catalog/wmts-layers/facets",
            params=[
                ("candidatePolygon", self._ARCTIC_POLYGON),
                ("candidatePolygon", self._EQUATOR_POLYGON),
                ("selectedPolygon", "arctic"),
            ],
        )
        body = resp.json()
        polygon_group = next(g for g in body["facets"] if g["dimension"] == "polygon")
        counts = {v["value"]: v["count"] for v in polygon_group["values"]}
        # Both candidates get a real count, including the unselected one -
        # selecting "arctic" must not zero out "equator"'s own count.
        assert counts == {"arctic": 3, "equator": 2}
        assert body["totalCount"] == 3
