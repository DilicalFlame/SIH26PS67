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
 * TIME/ELEVATION in each build()'s `dimensions` are hardcoded to the
 * layer's server-advertised default (surface depth, latest available day)
 * at the time this was written — the main-page time slider (see
 * DataLayerManager.setGlobalTime) moves the *displayed* tiles away from
 * this default at runtime, but the literal here is still what a fresh
 * `build()` starts at. The reanalysis/forecast window advances over time,
 * so both this literal and `timeEnd` below will drift stale and need
 * bumping periodically — known limitation, not a bug.
 *
 * `wmts`/`valueMin`/`valueMax` support the analysis page's
 * `copernicus-feature-info.ts` — the same WMTS service also answers
 * GetFeatureInfo (a keyless, per-point numeric query, verified live),
 * which is what plots on that page are actually built from.
 */
import * as Cesium from "cesium";

export type LayerSource = "postgis" | "api" | "upload";

/** The WMTS identifiers GetTile *and* GetFeatureInfo both need — kept
 *  explicit here (not re-derived from `build()`'s closure) so
 *  copernicus-feature-info.ts (the numeric-sampling module used by the
 *  analysis page) has one source of truth instead of duplicating the
 *  layer/style strings that `build()` also uses to construct the imagery
 *  provider. */
export interface CopernicusWmtsInfo {
	url: string;
	layer: string;
	style: string;
	/** Same string this entry's build() bakes into `dimensions.ELEVATION` —
	 *  the surface-level default, used when a caller doesn't specify a depth. */
	defaultElevation: string;
}

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
	/** ISO 8601. Available-date bounds for the time slider — not discovered
	 *  live (that means fetching the ~62MB GetCapabilities document), just
	 *  the product's documented cadence. `timeEnd` is a hardcoded recent
	 *  cutoff for the same reason the current TIME literal above is: the
	 *  reanalysis window keeps advancing, so this will drift stale and need
	 *  bumping periodically — known limitation, not a bug. */
	timeStart: string;
	timeEnd: string;
	timeStepSeconds: number;
	/** Present only for layers a GetFeatureInfo-based numeric sample can be
	 *  taken from (currently both entries) — absent would mean "display
	 *  only, no plotting support" for a future non-Copernicus layer. */
	wmts?: CopernicusWmtsInfo;
	/** Server-declared value range for this variable (GetCapabilities'
	 *  VariableInformation block) — used as the analysis page's default
	 *  colorbar/axis range, not enforced as a hard clamp on sampled values. */
	valueMin?: number;
	valueMax?: number;
}

const COPERNICUS_WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts";
const COPERNICUS_ATTRIBUTION = "E.U. Copernicus Marine Service Information";
const COPERNICUS_STYLE = "cmap:thermal";
const COPERNICUS_DEFAULT_ELEVATION = "-0.49402499198913574";

const REANALYSIS_LAYER = "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao";
const FORECAST_LAYER =
	"GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i_202406/thetao";

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
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: REANALYSIS_LAYER,
				style: COPERNICUS_STYLE,
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-06-23T00:00:00.000Z", ELEVATION: COPERNICUS_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		// Server-declared reanalysis window at the time this was verified live
		// against GetCapabilities — daily cadence, 1993-01-01 through the same
		// end date already hardcoded into the TIME dimension above.
		timeStart: "1993-01-01T00:00:00.000Z",
		timeEnd: "2026-06-23T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: REANALYSIS_LAYER,
			style: COPERNICUS_STYLE,
			defaultElevation: COPERNICUS_DEFAULT_ELEVATION,
		},
		// GetCapabilities' VariableInformation block for this layer, verified live.
		valueMin: -1.7980594635009766,
		valueMax: 29.406993865966797,
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
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: FORECAST_LAYER,
				style: COPERNICUS_STYLE,
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-16T00:00:00.000Z", ELEVATION: COPERNICUS_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		// Verified live against GetCapabilities: <Value>2022-06-01T00:00:00Z/
		// 2026-09-25T00:00:00Z/PT21600S</Value> — a rolling hindcast+forecast
		// window (not a multi-decade archive like the reanalysis), 6-hourly.
		timeStart: "2022-06-01T00:00:00.000Z",
		timeEnd: "2026-09-25T00:00:00.000Z",
		timeStepSeconds: 21600,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: FORECAST_LAYER,
			style: COPERNICUS_STYLE,
			defaultElevation: COPERNICUS_DEFAULT_ELEVATION,
		},
		valueMin: -1.7293856406211852,
		valueMax: 29.830848693847656,
	},
];
