/**
 * data-layers-catalog.ts
 *
 * Frontend-only registry of data layers offered in the "Data layers" catalog
 * picker (DataLayersCatalog.svelte). Same shape/convention as basemaps.ts —
 * a flat typed array with an async build() factory — deliberately NOT routed
 * through apps/api's /catalog/layers (see docs/planning/01-contracts.md):
 * that contract is frozen for the team's own Postgres/PostGIS-backed source
 * type, and nothing in it describes a WMTS tile source. `source` mirrors the
 * three data-source types the product actually has (our db, a connected
 * external API, user uploads) so those slot in later without a reshape —
 * only 'api' has a real implementation today.
 *
 * Both entries below hit Copernicus Marine's own WMTS tile service directly
 * from the browser — confirmed live, keyless, and CORS-open
 * (access-control-allow-origin: *) — no backend involvement needed.
 * TileMatrixSet "EPSG:4326" has an 11-level (0-10), 2x1-root tile pyramid
 * that matches Cesium's default GeographicTilingScheme exactly (verified
 * against the real <TileMatrixSet> definition in GetCapabilities), so no
 * custom tiling scheme or tile-matrix-label mapping is needed.
 *
 * TIME/ELEVATION are hardcoded to each layer's server-advertised default
 * (surface depth, latest available day) at the time this was written. The
 * reanalysis/forecast window advances over time, so these literals will
 * eventually go stale and the tile request will 400 — there's no depth/time
 * picker yet to let the user choose a different value. Known v1 limitation,
 * not a bug: fixing it properly means reading the live <Dimension> default
 * out of a ~62MB GetCapabilities document, which is out of scope here.
 */
import * as Cesium from "cesium";

export type LayerSource = "postgis" | "api" | "upload";

export interface DataLayerCatalogEntry {
	id: string;
	title: string;
	description: string;
	source: LayerSource;
	variable?: string;
	units?: string;
	attribution?: string;
	/** 0-1, applied via ImageryLayer.alpha when the layer is first added. */
	defaultOpacity: number;
	build: () => Promise<Cesium.ImageryProvider>;
}

const COPERNICUS_WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts";
const COPERNICUS_ATTRIBUTION = "E.U. Copernicus Marine Service Information";

export const DATA_LAYERS: DataLayerCatalogEntry[] = [
	{
		id: "copernicus_thetao",
		title: "Sea Water Potential Temperature",
		description:
			"Daily sea water potential temperature (surface) — Copernicus Marine GLORYS12V1 global ocean reanalysis.",
		source: "api",
		variable: "temperature",
		units: "°C",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 0.85,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao",
				style: "cmap:thermal",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-06-23T00:00:00.000Z", ELEVATION: "-0.49402499198913574" },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
	},
	{
		id: "copernicus_thetao_forecast",
		title: "Sea Water Potential Temperature (Forecast)",
		description:
			"Near-real-time sea water potential temperature (surface) — Copernicus Marine global ocean analysis/forecast.",
		source: "api",
		variable: "temperature",
		units: "°C",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 0.85,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: "GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i_202406/thetao",
				style: "cmap:thermal",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-16T00:00:00.000Z", ELEVATION: "-0.49402499198913574" },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
	},
];
