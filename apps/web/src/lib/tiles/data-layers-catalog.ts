/**
 * data-layers-catalog.ts
 *
 * Frontend-only registry of data layers offered in the "Data layers" catalog
 * picker (DataLayersCatalog.svelte). Same shape/convention as basemaps.ts -
 * a flat typed array with an async build() factory - deliberately NOT routed
 * through apps/api's /catalog/layers (see docs/planning/01-contracts.md):
 * that contract is frozen for the team's own Postgres/PostGIS-backed source
 * type, and nothing in it describes a WMTS tile source. `source` mirrors the
 * three data-source types the product actually has (our db, a connected
 * external API, user uploads) so those slot in later without a reshape -
 * only 'api' has a real implementation today.
 *
 * Both entries below hit Copernicus Marine's own WMTS tile service directly
 * from the browser - confirmed live, keyless, and CORS-open
 * (access-control-allow-origin: *) - no backend involvement needed.
 * TileMatrixSet "EPSG:4326" has an 11-level (0-10), 2x1-root tile pyramid
 * that matches Cesium's default GeographicTilingScheme exactly (verified
 * against the real <TileMatrixSet> definition in GetCapabilities), so no
 * custom tiling scheme or tile-matrix-label mapping is needed.
 *
 * TIME/ELEVATION in each build()'s `dimensions` are hardcoded to the
 * layer's server-advertised default (surface depth, latest available day)
 * at the time this was written - the main-page time slider (see
 * DataLayerManager.setGlobalTime) moves the *displayed* tiles away from
 * this default at runtime, but the literal here is still what a fresh
 * `build()` starts at. The reanalysis/forecast window advances over time,
 * so both this literal and `timeEnd` below will drift stale and need
 * bumping periodically - known limitation, not a bug.
 *
 * `wmts`/`valueMin`/`valueMax` support the analysis page's
 * `copernicus-feature-info.ts` - the same WMTS service also answers
 * GetFeatureInfo (a keyless, per-point numeric query, verified live),
 * which is what plots on that page are actually built from.
 */
import * as Cesium from "cesium";

export type LayerSource = "postgis" | "api" | "upload";

/** The WMTS identifiers GetTile *and* GetFeatureInfo both need - kept
 *  explicit here (not re-derived from `build()`'s closure) so
 *  copernicus-feature-info.ts (the numeric-sampling module used by the
 *  analysis page) has one source of truth instead of duplicating the
 *  layer/style strings that `build()` also uses to construct the imagery
 *  provider. */
export interface CopernicusWmtsInfo {
	url: string;
	layer: string;
	style: string;
	/** Same string this entry's build() bakes into `dimensions.ELEVATION` -
	 *  the surface-level default, used when a caller doesn't specify a depth. */
	defaultElevation: string;
}

// Mirrors apps/api/app/schemas/wmts_catalog.py's CamelModel wire shape for
// GET /api/v1/catalog/wmts-layers. Defined here (not in wmts-catalog-client.ts,
// which builds DataLayerCatalogEntry values *from* this shape) so
// DataLayerCatalogEntry.restoreDescriptor below can reference it without
// wmts-catalog-client.ts and this module importing from each other.
export interface WmtsTimeDimension {
	default: string | null;
	intervalStart: string | null;
	intervalEnd: string | null;
	intervalPeriod: string | null;
	values: string[] | null;
}
export interface WmtsElevationDimension {
	default: string | null;
	unit: string | null;
	levelCount: number;
}
export interface WmtsLayerDescriptor {
	id: string;
	productId: string;
	datasetId: string;
	variable: string;
	title: string;
	bbox: [number, number, number, number] | null;
	defaultStyle: string | null;
	styles: string[];
	formats: string[];
	time: WmtsTimeDimension | null;
	elevation: WmtsElevationDimension | null;
	/** Facet fields computed server-side (apps/api/app/services/
	 *  wmts_facets.py, wmts_variable_groups.py) - a product/dataset-type
	 *  grouping, a geographic region, a measurement domain, and (when the
	 *  variable code is in the curated table) a human-friendly group.
	 *  `"other"`/`null` are real, visible values (rendered as "Other"/
	 *  "Uncategorized" facet options), not errors. */
	collection: string;
	region: string;
	category: string;
	friendlyVariableGroup: string | null;
}

/** One value the picker's facet sidebar can show/select, with a live
 *  count - mirrors apps/api/app/schemas/wmts_catalog.py's WmtsFacetValue. */
export interface WmtsFacetValue {
	value: string;
	label: string;
	count: number;
}

/** "polygon" has no backend-known value space, unlike the other three - its
 *  candidates are whatever the browser's own drawn polygons are this
 *  session (see wmts-catalog-client.ts's WmtsCatalogFilters.candidatePolygons
 *  and apps/api/app/api/v1/wmts_catalog.py's _polygon_facet_group). */
export type WmtsFacetDimension = "collection" | "region" | "category" | "friendlyVariableGroup" | "polygon";

export interface WmtsFacetGroup {
	dimension: WmtsFacetDimension;
	values: WmtsFacetValue[];
}

export interface DataLayerCatalogEntry {
	id: string;
	title: string;
	description: string;
	source: LayerSource;
	variable?: string;
	units?: string;
	attribution?: string;
	/** Set on every dynamically-fetched (live-search) entry - its raw
	 *  Copernicus product/dataset for the "Full Copernicus catalog" picker
	 *  section to group by. Curated entries leave this unset; they're never
	 *  grouped, only listed. */
	productId?: string;
	/** West/south/east/north degrees - real regional coverage for a live
	 *  layer (e.g. an Arctic-only product), used for the "zoom to" action and
	 *  for picking a thumbnail tile that actually falls inside the layer's
	 *  data (see wmts-catalog-client.ts's wmtsThumbnailUrl). Curated entries
	 *  leave this unset (they're all global); callers treat "unset" as
	 *  whole-earth. */
	bbox?: [number, number, number, number];
	/** Only a dynamic entry sets this - the exact JSON this entry was built
	 *  from (see wmts-catalog-client.ts's copernicusWmtsLayerToEntry). This
	 *  module never reads it; it's persisted verbatim by DataLayerManager's
	 *  session-store round-trip so a page reload (or the separate /analysis
	 *  tab, which reads the same localStorage snapshot) can reconstruct the
	 *  same entry via copernicusWmtsLayerToEntry without a live re-search -
	 *  the id alone isn't enough since it was never in the static array. */
	restoreDescriptor?: WmtsLayerDescriptor;
	/** 0-1, applied via ImageryLayer.alpha when the layer is first added. */
	defaultOpacity: number;
	build: () => Promise<Cesium.ImageryProvider>;
	/** ISO 8601. Available-date bounds for the time slider - not discovered
	 *  live (that means fetching the ~62MB GetCapabilities document), just
	 *  the product's documented cadence. `timeEnd` is a hardcoded recent
	 *  cutoff for the same reason the current TIME literal above is: the
	 *  reanalysis window keeps advancing, so this will drift stale and need
	 *  bumping periodically - known limitation, not a bug.
	 *
	 *  Optional because a dynamically-fetched entry (see
	 *  wmts-catalog-client.ts, backed by GET /api/v1/catalog/wmts-layers)
	 *  may be static (no time dimension at all) or use a calendar-variable
	 *  cadence (P1M/P1Y) this trio can't represent as a fixed second count -
	 *  such a layer still renders, it just isn't slider-scrubbable. All ten
	 *  hand-curated entries below set every field in the trio together. */
	timeStart?: string;
	timeEnd?: string;
	timeStepSeconds?: number;
	/** The alternative to the trio above - a genuinely discrete, non-uniform
	 *  set of available times (e.g. a monthly climatology's twelve named
	 *  months), rather than a fixed-length step over a continuous range.
	 *  WMTS's own `<Dimension>` block distinguishes these at the XML level
	 *  (see apps/api's _parse_time_dimension): a "start/end/period" triple
	 *  becomes the trio above, standalone `<Value>` entries become this
	 *  instead - the two are mutually exclusive on any one layer. Confirmed
	 *  live: GLOBAL_ANALYSISFORECAST_PHY_001_024's
	 *  sea_surface_temperature_rmsd_uncertainty renders on the map fine (its
	 *  build() only needs time.default) but was invisible to both the
	 *  shared time slider and the /analysis page entirely before this
	 *  existed, since neither recognized a time-capable layer that wasn't
	 *  slider-uniform. */
	timeValues?: string[];
	/** Present only for layers a GetFeatureInfo-based numeric sample can be
	 *  taken from (currently both entries) - absent would mean "display
	 *  only, no plotting support" for a future non-Copernicus layer. */
	wmts?: CopernicusWmtsInfo;
	/** Server-declared value range for this variable (GetCapabilities'
	 *  VariableInformation block) - used as the analysis page's default
	 *  colorbar/axis range, not enforced as a hard clamp on sampled values. */
	valueMin?: number;
	valueMax?: number;
}

/** An entry known (at the type level) to be scrubbable by TimeSlider -
 *  either the whole continuous trio is set, or a discrete `timeValues` list
 *  is (see that field's doc comment; the two never both apply to one
 *  layer). Narrow to this with isTimeCapable() rather than a non-null
 *  assertion; see ActiveLayersPanel.svelte and routes/analysis/+page.svelte. */
export type TimeCapableLayerEntry = DataLayerCatalogEntry &
	({ timeStart: string; timeEnd: string; timeStepSeconds: number } | { timeValues: string[] });

/** Any entry a GetFeatureInfo-based numeric sample can be taken from at all
 *  - what routes/analysis/+page.svelte actually requires to plot something.
 *  Broader than TimeCapableLayerEntry: a genuinely static field (real
 *  bathymetry, a land-sea mask - no `<Dimension>` block of any kind in
 *  GetCapabilities) is still real, plottable data, it just has no time axis
 *  to scrub, so TimeSlider simply isn't shown for it (gate on
 *  isTimeCapable, not on this type). Confirmed live that Copernicus's WMTS
 *  tolerates an irrelevant TIME/ELEVATION query param on such a layer
 *  without error, so no special-casing is needed in
 *  copernicus-feature-info.ts itself - any placeholder isoTime works when
 *  the layer has nowhere to apply it. */
export type AnalysableLayerEntry = DataLayerCatalogEntry & { wmts: CopernicusWmtsInfo };

export function isTimeCapable(entry: DataLayerCatalogEntry | undefined): entry is TimeCapableLayerEntry {
	if (!entry) return false;
	if (entry.timeStart && entry.timeEnd && entry.timeStepSeconds) return true;
	return Boolean(entry.timeValues && entry.timeValues.length > 0);
}

/** Snaps `iso` into a time this entry actually has data for - clamping into
 *  [timeStart, timeEnd] for a continuous entry, or to the nearest declared
 *  value for a discrete one. Centralizes what ActiveLayersPanel.svelte's
 *  hover sampling and routes/analysis/+page.svelte's plots both separately
 *  needed: a raw `isoTime` (e.g. the shared session's last-used time, or
 *  today's wall-clock default before the slider's ever touched) sent
 *  straight to GetFeatureInfo can fall outside a specific layer's own
 *  window and gets rejected with a 400. */
export function resolveIsoTimeForEntry(iso: string, entry: TimeCapableLayerEntry): string {
	if (entry.timeValues && entry.timeValues.length > 0) {
		const values = entry.timeValues;
		const t = new Date(iso).getTime();
		let best = values[0];
		let bestDiff = Infinity;
		for (const candidate of values) {
			const diff = Number.isNaN(t) ? 0 : Math.abs(new Date(candidate).getTime() - t);
			if (diff < bestDiff) {
				bestDiff = diff;
				best = candidate;
			}
		}
		return best;
	}
	// isTimeCapable()'s contract guarantees the continuous trio is set
	// whenever timeValues isn't - TypeScript can't see across that contract
	// from the union type alone, so narrow explicitly here too rather than
	// asserting.
	if (entry.timeStart && entry.timeEnd) {
		const t = new Date(iso).getTime();
		const start = new Date(entry.timeStart).getTime();
		const end = new Date(entry.timeEnd).getTime();
		if (Number.isNaN(t) || t < start) return entry.timeStart;
		if (t > end) return entry.timeEnd;
		return iso;
	}
	return iso;
}

const COPERNICUS_WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts";
const COPERNICUS_ATTRIBUTION = "E.U. Copernicus Marine Service Information";
const COPERNICUS_STYLE = "cmap:thermal";
const COPERNICUS_DEFAULT_ELEVATION = "-0.49402499198913574";
// The BGC product family's surface layer advertises a very slightly different
// default elevation float than the physics family above - both are "surface",
// this is just the two products' independent vertical-grid definitions.
const COPERNICUS_BGC_DEFAULT_ELEVATION = "-0.4940253794193268";

const REANALYSIS_LAYER = "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/thetao";
const FORECAST_LAYER =
	"GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i_202406/thetao";

// Reanalysis (GLORYS12V1) dataset - same product/dataset as thetao above,
// just a different variable path. Daily, 1993-01-01 through the same cutoff.
const SALINITY_LAYER = "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/so";
const SSH_LAYER = "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/zos";
const MLD_LAYER = "GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/mlotst";
const CURRENTS_LAYER =
	"GLOBAL_MULTIYEAR_PHY_001_030/cmems_mod_glo_phy_my_0.083deg_P1D-m_202311/sea_water_velocity";
const CURRENTS_STYLE = "cmap:speed,vectorStyle:solid";

// Biogeochemistry analysis/forecast product - near-real-time, 2021-11-01 onward.
const CHLOROPHYLL_LAYER = "GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m_202311/chl";
const OXYGEN_LAYER = "GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m_202311/o2";
const PH_LAYER = "GLOBAL_ANALYSISFORECAST_BGC_001_028/cmems_mod_glo_bgc-car_anfc_0.25deg_P1D-m_202311/ph";

// Wave analysis/forecast product - 3-hourly, 2022-11-01 onward.
const WAVE_HEIGHT_LAYER = "GLOBAL_ANALYSISFORECAST_WAV_001_027/cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202411/VHM0";

export const DATA_LAYERS: DataLayerCatalogEntry[] = [
	{
		id: "copernicus_thetao",
		title: "Sea Water Potential Temperature",
		description:
			"Daily sea water potential temperature (surface) - Copernicus Marine GLORYS12V1 global ocean reanalysis.",
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
		// against GetCapabilities - daily cadence, 1993-01-01 through the same
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
			"Near-real-time sea water potential temperature (surface) - Copernicus Marine global ocean analysis/forecast.",
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
		// 2026-09-25T00:00:00Z/PT21600S</Value> - a rolling hindcast+forecast
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
	{
		id: "copernicus_so",
		title: "Sea Water Salinity",
		description: "Daily sea water salinity (surface) - Copernicus Marine GLORYS12V1 global ocean reanalysis.",
		source: "api",
		variable: "salinity",
		units: "PSU",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: SALINITY_LAYER,
				style: "cmap:haline",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-06-23T00:00:00.000Z", ELEVATION: COPERNICUS_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "1993-01-01T00:00:00.000Z",
		timeEnd: "2026-06-23T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: SALINITY_LAYER,
			style: "cmap:haline",
			defaultElevation: COPERNICUS_DEFAULT_ELEVATION,
		},
		valueMin: 30.45442008972168,
		valueMax: 36.84652328491211,
	},
	{
		id: "copernicus_zos",
		title: "Sea Surface Height",
		description:
			"Daily sea surface height above geoid - Copernicus Marine GLORYS12V1 global ocean reanalysis.",
		source: "api",
		variable: "sea_surface_height",
		units: "m",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: SSH_LAYER,
				style: "cmap:viridis",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				// No ELEVATION dimension for this layer (2D surface field, verified
				// against GetCapabilities - unlike thetao/so it has no vertical grid).
				dimensions: { TIME: "2026-06-23T00:00:00.000Z" },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "1993-01-01T00:00:00.000Z",
		timeEnd: "2026-06-23T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: SSH_LAYER,
			style: "cmap:viridis",
			defaultElevation: "",
		},
		valueMin: -1.7450484037399292,
		valueMax: 0.8908352851867676,
	},
	{
		id: "copernicus_mlotst",
		title: "Mixed Layer Thickness",
		description:
			"Daily density ocean mixed layer thickness - Copernicus Marine GLORYS12V1 global ocean reanalysis.",
		source: "api",
		variable: "mixed_layer_thickness",
		units: "m",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: MLD_LAYER,
				style: "cmap:plasma",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-06-23T00:00:00.000Z" },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "1993-01-01T00:00:00.000Z",
		timeEnd: "2026-06-23T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: MLD_LAYER,
			style: "cmap:plasma",
			defaultElevation: "",
		},
		valueMin: 10.528885841369629,
		valueMax: 200.04884338378906,
	},
	{
		id: "copernicus_currents",
		title: "Ocean Currents",
		description:
			"Daily sea water velocity (surface) - Copernicus Marine GLORYS12V1 global ocean reanalysis.",
		source: "api",
		variable: "sea_water_velocity",
		units: "m/s",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: CURRENTS_LAYER,
				style: CURRENTS_STYLE,
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-06-23T00:00:00.000Z", ELEVATION: COPERNICUS_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "1993-01-01T00:00:00.000Z",
		timeEnd: "2026-06-23T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: CURRENTS_LAYER,
			style: CURRENTS_STYLE,
			defaultElevation: COPERNICUS_DEFAULT_ELEVATION,
		},
		valueMin: 0,
		valueMax: 1.04,
	},
	{
		id: "copernicus_chl",
		title: "Chlorophyll Concentration",
		description:
			"Daily total chlorophyll (surface) - Copernicus Marine global biogeochemistry analysis/forecast.",
		source: "api",
		variable: "chlorophyll",
		units: "mg/m³",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: CHLOROPHYLL_LAYER,
				style: "cmap:algae",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-19T00:00:00.000Z", ELEVATION: COPERNICUS_BGC_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		// Verified live against GetCapabilities: this product's window starts
		// 2021-11-01 (not the multi-decade reanalysis span above) and rolls
		// forward daily to a near-term forecast cutoff.
		timeStart: "2021-11-01T00:00:00.000Z",
		timeEnd: "2026-09-28T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: CHLOROPHYLL_LAYER,
			style: "cmap:algae",
			defaultElevation: COPERNICUS_BGC_DEFAULT_ELEVATION,
		},
		valueMin: 0.0028339088894426823,
		valueMax: 0.7750626325607299,
	},
	{
		id: "copernicus_o2",
		title: "Dissolved Oxygen",
		description:
			"Daily dissolved oxygen (surface) - Copernicus Marine global biogeochemistry analysis/forecast.",
		source: "api",
		variable: "dissolved_oxygen",
		units: "mmol/m³",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: OXYGEN_LAYER,
				style: "cmap:matter",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-19T00:00:00.000Z", ELEVATION: COPERNICUS_BGC_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "2021-11-01T00:00:00.000Z",
		timeEnd: "2026-09-28T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: OXYGEN_LAYER,
			style: "cmap:matter",
			defaultElevation: COPERNICUS_BGC_DEFAULT_ELEVATION,
		},
		valueMin: 40.23836135864258,
		valueMax: 378.4803161621094,
	},
	{
		id: "copernicus_ph",
		title: "Ocean pH (Acidification)",
		description: "Daily sea water pH (surface) - Copernicus Marine global biogeochemistry analysis/forecast.",
		source: "api",
		variable: "ph",
		units: "pH",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: PH_LAYER,
				style: "cmap:viridis",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-19T00:00:00.000Z", ELEVATION: COPERNICUS_BGC_DEFAULT_ELEVATION },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		timeStart: "2021-11-01T00:00:00.000Z",
		timeEnd: "2026-09-28T00:00:00.000Z",
		timeStepSeconds: 86400,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: PH_LAYER,
			style: "cmap:viridis",
			defaultElevation: COPERNICUS_BGC_DEFAULT_ELEVATION,
		},
		valueMin: 7.618447780609131,
		valueMax: 8.132478713989258,
	},
	{
		id: "copernicus_wave_height",
		title: "Significant Wave Height",
		description:
			"Spectral significant wave height (Hm0), 3-hourly - Copernicus Marine global wave analysis/forecast.",
		source: "api",
		variable: "wave_height",
		units: "m",
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: WAVE_HEIGHT_LAYER,
				style: "cmap:amp",
				tileMatrixSetID: "EPSG:4326",
				format: "image/png",
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: { TIME: "2026-09-19T09:00:00.000Z" },
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		// Verified live: 2022-11-01T03:00:00Z/2026-09-28T00:00:00Z, PT10800S (3h) cadence.
		timeStart: "2022-11-01T03:00:00.000Z",
		timeEnd: "2026-09-28T00:00:00.000Z",
		timeStepSeconds: 10800,
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: WAVE_HEIGHT_LAYER,
			style: "cmap:amp",
			defaultElevation: "",
		},
		valueMin: 0.4099999964237213,
		valueMax: 6.869999885559082,
	},
];
