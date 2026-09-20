/**
 * wmts-catalog-client.ts
 *
 * Talks to the backend's GET /api/v1/catalog/wmts-layers (apps/api/app/api/
 * v1/wmts_catalog.py) - the live Copernicus Marine WMTS catalog (~9,628
 * product/dataset/variable layers at last count), and adapts each result
 * into the same DataLayerCatalogEntry shape the ten hand-curated entries in
 * data-layers-catalog.ts already use, so every existing consumer (the
 * picker, the active-layers panel, the layer manager) needs no special
 * case for "a layer that came from search" vs. "a layer that's hardcoded."
 *
 * This is the first frontend caller of apps/api - PUBLIC_API_BASE_URL is
 * already declared in the root .env(.example) but was unused until now.
 */
import * as Cesium from "cesium";
import { env } from "$env/dynamic/public";
import type { DataLayerCatalogEntry, WmtsFacetGroup, WmtsLayerDescriptor } from "$lib/tiles/data-layers-catalog";

export type {
	WmtsLayerDescriptor,
	WmtsTimeDimension,
	WmtsElevationDimension,
	WmtsFacetValue,
	WmtsFacetGroup,
	WmtsFacetDimension,
} from "$lib/tiles/data-layers-catalog";

const API_BASE_URL = env.PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";
const COPERNICUS_WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts";
const COPERNICUS_ATTRIBUTION = "E.U. Copernicus Marine Service Information";

/** Every filter dimension the picker's facet sidebar + search box can set -
 *  mirrors apps/api/app/api/v1/wmts_catalog.py's query params 1:1 (each
 *  array serializes to a repeated query param, OR'd within a dimension on
 *  the backend; multiple non-empty fields here AND together).
 *
 *  `candidatePolygons`/`selectedPolygons` are the odd ones out: every other
 *  field is a value from a backend-known enum, but a polygon is one of the
 *  browser's own drawn shapes, which the backend has no way to know about
 *  ahead of time - so the request itself carries the candidate list
 *  (`"<id>|<west>,<south>,<east>,<north>"` per polygon, from
 *  wmtsBoundingBoxParam below) alongside which of those ids are actually
 *  checked. Always send the full candidate list, selected or not - the
 *  facets endpoint needs every candidate to compute a per-polygon count
 *  (see apps/api/app/api/v1/wmts_catalog.py's _polygon_facet_group). */
export interface WmtsCatalogFilters {
	query?: string;
	collections?: string[];
	regions?: string[];
	categories?: string[];
	friendlyVariableGroups?: string[];
	candidatePolygons?: string[];
	selectedPolygons?: string[];
}

/** Encodes one polygon for the `candidatePolygon` query param - see the
 *  WmtsCatalogFilters doc comment above. Kept here (not computed inline at
 *  each call site) so the exact `"id|w,s,e,n"` format has one definition. */
export function encodeCandidatePolygon(
	id: string,
	bbox: { west: number; south: number; east: number; north: number },
): string {
	return `${id}|${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}

function buildFilterParams(filters: WmtsCatalogFilters): URLSearchParams {
	const params = new URLSearchParams();
	if (filters.query) params.set("q", filters.query);
	for (const v of filters.collections ?? []) params.append("collection", v);
	for (const v of filters.regions ?? []) params.append("region", v);
	for (const v of filters.categories ?? []) params.append("category", v);
	for (const v of filters.friendlyVariableGroups ?? []) params.append("friendlyVariableGroup", v);
	for (const v of filters.candidatePolygons ?? []) params.append("candidatePolygon", v);
	for (const v of filters.selectedPolygons ?? []) params.append("selectedPolygon", v);
	return params;
}

interface WmtsCatalogResponse {
	generatedAt: string;
	source: string;
	count: number;
	totalCount: number;
	layers: WmtsLayerDescriptor[];
}
export interface WmtsSearchResult {
	layers: WmtsLayerDescriptor[];
	totalCount: number;
}

/** "relevance" (the default, omitted from the request entirely) is the
 *  backend's own grouped-by-product order (see wmts_catalog.py's
 *  list_wmts_layers) - the only order CatalogResultGrid's product grouping
 *  is coherent under, since it relies on same-product entries being
 *  contiguous across pages. The title orders intentionally bypass that:
 *  CatalogResultGrid renders a flat list (no product grouping) whenever
 *  `sort` isn't "relevance" - see that component's `groups` derivation. */
export type WmtsSortOrder = "relevance" | "titleAsc" | "titleDesc";

export async function searchWmtsLayers(
	filters: WmtsCatalogFilters,
	options: { limit?: number; offset?: number; sort?: WmtsSortOrder; signal?: AbortSignal } = {},
): Promise<WmtsSearchResult> {
	const url = new URL(`${API_BASE_URL}/catalog/wmts-layers`, window.location.origin);
	const params = buildFilterParams(filters);
	if (options.limit) params.set("limit", String(options.limit));
	if (options.offset) params.set("offset", String(options.offset));
	if (options.sort && options.sort !== "relevance") params.set("sort", options.sort);
	url.search = params.toString();

	const res = await fetch(url, { signal: options.signal });
	if (!res.ok) throw new Error(`GET /catalog/wmts-layers HTTP ${res.status}`);
	const body = (await res.json()) as WmtsCatalogResponse;
	return { layers: body.layers, totalCount: body.totalCount };
}

/** Human labels for a facet dimension's raw values ("physics" ->
 *  "Physics"), keyed by dimension - built once from a live facets response
 *  and handed to CatalogLayerCard so each card's tag row can show the same
 *  label the sidebar/tab chips already show, instead of the raw backend
 *  key. Every value a rendered card can carry is guaranteed present in the
 *  matching facet group's hold-out count (see get_wmts_layer_facets's
 *  docstring: each dimension's group is computed with only *its own*
 *  selections excluded, so it's always a superset of what's in the current
 *  results) - no separate lookup/label fetch needed per card. */
export interface CatalogLabelMaps {
	region: Map<string, string>;
	category: Map<string, string>;
	collection: Map<string, string>;
	friendlyVariableGroup: Map<string, string>;
}

export function buildCatalogLabelMaps(facetGroups: WmtsFacetGroup[]): CatalogLabelMaps {
	const mapFor = (dimension: WmtsFacetGroup["dimension"]): Map<string, string> =>
		new Map((facetGroups.find((g) => g.dimension === dimension)?.values ?? []).map((v) => [v.value, v.label]));
	return {
		region: mapFor("region"),
		category: mapFor("category"),
		collection: mapFor("collection"),
		friendlyVariableGroup: mapFor("friendlyVariableGroup"),
	};
}

interface WmtsFacetsApiResponse {
	generatedAt: string;
	totalCount: number;
	facets: WmtsFacetGroup[];
}
export interface WmtsFacetsResult {
	totalCount: number;
	facets: WmtsFacetGroup[];
}

/** Facet value counts for the current filter state - cheap on the backend
 *  (computed from its already-cached in-memory layer list). Each
 *  dimension's own counts are computed with every *other* active filter
 *  applied but not that dimension's own selections (see the backend
 *  route's docstring) - real faceted-search semantics, not a dead end
 *  where picking one option zeroes out its sibling options' counts. */
export async function fetchWmtsCatalogFacets(
	filters: WmtsCatalogFilters,
	options: { signal?: AbortSignal } = {},
): Promise<WmtsFacetsResult> {
	const url = new URL(`${API_BASE_URL}/catalog/wmts-layers/facets`, window.location.origin);
	url.search = buildFilterParams(filters).toString();

	const res = await fetch(url, { signal: options.signal });
	if (!res.ok) throw new Error(`GET /catalog/wmts-layers/facets HTTP ${res.status}`);
	const body = (await res.json()) as WmtsFacetsApiResponse;
	return { totalCount: body.totalCount, facets: body.facets };
}

/** A single low-zoom tile centred on the layer's own coverage (its bbox
 *  centre, or the globe's centre for a global layer) - deliberately not a
 *  fixed world tile, which for a regional product (Arctic/Baltic/...) would
 *  render mostly empty ocean-outside-coverage instead of "the data it
 *  really shows." Zoom level 2 is coarse but real: a genuine GetTile
 *  response from the same service and style the full layer renders with. */
export function wmtsThumbnailUrl(entry: DataLayerCatalogEntry): string | null {
	if (!entry.wmts) return null;
	const level = 2;
	const [west, south, east, north] = entry.bbox ?? [-180, -90, 180, 90];
	const centerLon = (west + east) / 2;
	const centerLat = (south + north) / 2;
	const numCols = 2 * 2 ** level;
	const numRows = 2 ** level;
	const col = Math.min(numCols - 1, Math.max(0, Math.floor(((centerLon + 180) / 360) * numCols)));
	const row = Math.min(numRows - 1, Math.max(0, Math.floor(((90 - centerLat) / 180) * numRows)));

	const params = new URLSearchParams({
		SERVICE: "WMTS",
		REQUEST: "GetTile",
		VERSION: "1.0.0",
		LAYER: entry.wmts.layer,
		STYLE: entry.wmts.style,
		TILEMATRIXSET: "EPSG:4326",
		TILEMATRIX: String(level),
		TILEROW: String(row),
		TILECOL: String(col),
		FORMAT: "image/png",
	});
	if (entry.timeEnd) params.set("TIME", entry.timeEnd);
	if (entry.wmts.defaultElevation) params.set("ELEVATION", entry.wmts.defaultElevation);
	return `${entry.wmts.url}?${params.toString()}`;
}

/** ISO 8601 duration -> seconds, for the fixed-length subset the shared
 *  TimeSlider can represent (P#D, P#W, PT#H, PT#M, PT#S and combinations).
 *  Calendar-variable periods (P1M, P1Y - a real month/year isn't a fixed
 *  second count) deliberately return null: the caller then just skips
 *  offering that layer on the slider rather than mis-stepping through it. */
function parseIsoDurationSeconds(period: string): number | null {
	const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(period);
	if (!match) return null;
	const [, weeks, days, hours, minutes, seconds] = match;
	if (!weeks && !days && !hours && !minutes && !seconds) return null;
	return (
		Number(weeks ?? 0) * 604800 +
		Number(days ?? 0) * 86400 +
		Number(hours ?? 0) * 3600 +
		Number(minutes ?? 0) * 60 +
		Number(seconds ?? 0)
	);
}

/** The raw GetCapabilities title is "{datasetId} - {human label}" - strip
 *  the dataset-id prefix for the picker card's headline, but keep the full
 *  raw string as `description` so the dataset id/cadence context isn't lost
 *  (shown in the card body and in LayerInfoOverlay). */
function cleanTitle(rawTitle: string): string {
	const sep = rawTitle.indexOf(" - ");
	return sep === -1 ? rawTitle : rawTitle.slice(sep + 3);
}

export function copernicusWmtsLayerToEntry(descriptor: WmtsLayerDescriptor): DataLayerCatalogEntry {
	const style = descriptor.defaultStyle ?? descriptor.styles[0] ?? "";
	const format = descriptor.formats[0] ?? "image/png";
	const elevationDefault = descriptor.elevation?.default ?? undefined;
	const timeDefault = descriptor.time?.default ?? descriptor.time?.intervalEnd ?? undefined;
	const periodSeconds = descriptor.time?.intervalPeriod
		? parseIsoDurationSeconds(descriptor.time.intervalPeriod)
		: null;
	const sliderCapable =
		descriptor.time?.intervalStart && descriptor.time?.intervalEnd && periodSeconds !== null;
	// The alternative to slider-capable - a discrete, non-uniform value list
	// (a monthly climatology's named months, an irregular NRT cadence) - see
	// DataLayerCatalogEntry.timeValues's doc comment. Mutually exclusive with
	// sliderCapable in practice (apps/api's _parse_time_dimension never
	// populates both), sorted defensively since GetCapabilities doesn't
	// itself guarantee <Value> declaration order.
	const timeValues =
		descriptor.time?.values && descriptor.time.values.length > 0
			? [...descriptor.time.values].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
			: undefined;

	return {
		id: descriptor.id,
		title: cleanTitle(descriptor.title),
		description: descriptor.title,
		source: "api",
		variable: descriptor.variable,
		productId: descriptor.productId,
		bbox: descriptor.bbox ?? undefined,
		restoreDescriptor: descriptor,
		attribution: COPERNICUS_ATTRIBUTION,
		defaultOpacity: 1,
		build: async () =>
			new Cesium.WebMapTileServiceImageryProvider({
				url: COPERNICUS_WMTS_URL,
				layer: descriptor.id,
				style,
				tileMatrixSetID: "EPSG:4326",
				format,
				tilingScheme: new Cesium.GeographicTilingScheme(),
				dimensions: {
					...(timeDefault ? { TIME: timeDefault } : {}),
					...(elevationDefault ? { ELEVATION: elevationDefault } : {}),
				},
				// Regional products (Arctic/Baltic/Mediterranean/...) advertise a
				// tighter WGS84BoundingBox than the global -180..180/-90..90 default
				// - without this, Cesium requests tiles outside their real coverage.
				rectangle: descriptor.bbox ? Cesium.Rectangle.fromDegrees(...descriptor.bbox) : undefined,
				minimumLevel: 0,
				maximumLevel: 10,
			}),
		...(sliderCapable
			? {
					timeStart: descriptor.time!.intervalStart!,
					timeEnd: descriptor.time!.intervalEnd!,
					timeStepSeconds: periodSeconds!,
				}
			: {}),
		...(timeValues ? { timeValues } : {}),
		wmts: {
			url: COPERNICUS_WMTS_URL,
			layer: descriptor.id,
			style,
			defaultElevation: elevationDefault ?? "",
		},
	};
}
