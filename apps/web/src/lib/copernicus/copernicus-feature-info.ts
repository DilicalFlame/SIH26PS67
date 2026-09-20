/**
 * copernicus-feature-info.ts
 *
 * Numeric point-sampling against Copernicus Marine's WMTS GetFeatureInfo -
 * confirmed live, keyless, CORS-open this session (a real request at a
 * known point returned 28.42°C, correct order of magnitude for equatorial
 * Atlantic surface water). This is the ONLY data source the analysis
 * page's plots are built from: the same WMTS service's GetTile endpoint
 * (used for the map layers themselves) returns pre-rendered PNG pixels,
 * not queryable values.
 *
 * Every view on the analysis page (depth profile, 2D slice, 3D point
 * cloud) is just this module called at different point/depth/time grids -
 * deliberately NOT a bulk Zarr/raster pipeline. A keyless S3 Zarr path to
 * the same data exists too, but needs an unverified browser blosc-decode
 * pipeline; GetFeatureInfo alone covers every planned view at a resolution
 * that keeps per-view request counts in the tens-to-low-hundreds, so
 * there's no reason to take on that risk. See the plan this was built
 * from for the full resolution budget per view.
 */
import * as Cesium from "cesium";
import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";

/** The 50 standard CMEMS/GLORYS depth levels (metres, negative = below
 *  surface), surface-first. Identical across the reanalysis and forecast
 *  catalog entries (verified live against both) - extracted once from
 *  GetCapabilities' <Dimension> block rather than fetched at runtime (that
 *  document is ~65MB and not worth a client-side round trip). */
export const STANDARD_DEPTHS_M: readonly number[] = [
	-0.49402499198913574, -1.5413750410079956, -2.6456689834594727, -3.8194949626922607,
	-5.078224182128906, -6.440614223480225, -7.92956018447876, -9.572997093200684,
	-11.404999732971191, -13.467140197753906, -15.810070037841797, -18.495559692382812,
	-21.598819732666016, -25.211410522460938, -29.444730758666992, -34.43415069580078,
	-40.344051361083984, -47.37369155883789, -55.76428985595703, -65.80726623535156,
	-77.85385131835938, -92.3260726928711, -109.72930145263672, -130.66600036621094,
	-155.85069274902344, -186.12559509277344, -222.47520446777344, -266.0403137207031,
	-318.1274108886719, -380.2130126953125, -453.9377136230469, -541.0889282226562,
	-643.5667724609375, -763.3331298828125, -902.3392944335938, -1062.43994140625,
	-1245.291015625, -1452.2509765625, -1684.2840576171875, -1941.8929443359375,
	-2225.077880859375, -2533.3359375, -2865.702880859375, -3220.820068359375,
	-3597.031982421875, -3992.48388671875, -4405.22412109375, -4833.291015625,
	-5274.7841796875, -5727.9169921875,
];

const TILE_SIZE = 256;
// Deepest available level in the EPSG:4326 TileMatrixSet. GetFeatureInfo is
// billed per point, not per tile, so the highest zoom only sharpens the
// lon/lat -> pixel rounding - never costs an extra request.
const SAMPLE_LEVEL = 10;

const tilingScheme = new Cesium.GeographicTilingScheme();

interface TilePixel {
	tileRow: number;
	tileCol: number;
	i: number;
	j: number;
}

/** lon/lat -> the TILEROW/TILECOL/I/J a GetFeatureInfo request needs, reusing
 *  the same GeographicTilingScheme instance the imagery layers themselves
 *  are built with (this WMTS's EPSG:4326 TileMatrixSet matches it exactly -
 *  confirmed against the real <TileMatrixSet> definition in GetCapabilities). */
function lonLatToTilePixel(lon: number, lat: number): TilePixel {
	const cartographic = Cesium.Cartographic.fromDegrees(lon, lat);
	const tileXY = tilingScheme.positionToTileXY(cartographic, SAMPLE_LEVEL);
	if (!tileXY) {
		throw new Error(`Point (${lon}, ${lat}) falls outside the WMTS tiling scheme`);
	}
	const rect = tilingScheme.tileXYToRectangle(tileXY.x, tileXY.y, SAMPLE_LEVEL);
	const fracX = (cartographic.longitude - rect.west) / (rect.east - rect.west);
	const fracY = (rect.north - cartographic.latitude) / (rect.north - rect.south); // row 0 = north edge
	const i = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(fracX * TILE_SIZE)));
	const j = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(fracY * TILE_SIZE)));
	return { tileRow: tileXY.y, tileCol: tileXY.x, i, j };
}

/** One real numeric sample at a point/depth/time, or `null` for genuine
 *  no-data (below seafloor, outside coverage) - confirmed a real response
 *  shape from this service, not a failure case to special-case away.
 *  Throws only on an actual transport/HTTP failure - callers doing a batch
 *  fetch (see fetchGrid) decide how to handle that (retry/give up), a
 *  single caller can just let it propagate. */
export async function fetchFeatureInfo(
	wmts: CopernicusWmtsInfo,
	lon: number,
	lat: number,
	isoTime: string,
	elevationMeters?: string,
	signal?: AbortSignal,
): Promise<number | null> {
	const { tileRow, tileCol, i, j } = lonLatToTilePixel(lon, lat);
	const params = new URLSearchParams({
		SERVICE: "WMTS",
		REQUEST: "GetFeatureInfo",
		VERSION: "1.0.0",
		LAYER: wmts.layer,
		STYLE: wmts.style,
		TILEMATRIXSET: "EPSG:4326",
		TILEMATRIX: String(SAMPLE_LEVEL),
		TILEROW: String(tileRow),
		TILECOL: String(tileCol),
		I: String(i),
		J: String(j),
		INFOFORMAT: "application/json",
		TIME: isoTime,
		ELEVATION: elevationMeters ?? wmts.defaultElevation,
	});
	const res = await fetch(`${wmts.url}?${params.toString()}`, { signal });
	if (!res.ok) throw new Error(`GetFeatureInfo HTTP ${res.status}`);
	const body: unknown = await res.json();
	const feature = (body as { features?: { properties?: { value?: unknown } }[] })?.features?.[0];
	const value = feature?.properties?.value;
	return typeof value === "number" ? value : null;
}

export interface GridPoint {
	lon: number;
	lat: number;
}

export interface GridSample extends GridPoint {
	value: number | null;
}

export interface FetchGridOptions {
	/** Simultaneous in-flight requests. The research burst this was sized
	 *  against saw no throttling at 20 concurrent, but that's not proof of
	 *  no limit - stay well under it by default. */
	concurrency?: number;
	signal?: AbortSignal;
	onProgress?: (completed: number, total: number) => void;
	/** Fired as each point resolves, in whatever order workers finish (not
	 *  index order) - lets a 3D view render points as they arrive instead
	 *  of blocking on the whole grid. */
	onSample?: (sample: GridSample, index: number) => void;
}

/** Bounded-concurrency batch fetch over `points`, all at the same
 *  time/depth. Retries a failed point up to 2 extra times with backoff
 *  before giving up on it (recorded as `value: null`, same shape as a
 *  genuine no-data response - a transport hiccup on one point shouldn't
 *  blank out an otherwise-good grid). */
export async function fetchGrid(
	wmts: CopernicusWmtsInfo,
	points: GridPoint[],
	isoTime: string,
	elevationMeters: string | undefined,
	options: FetchGridOptions = {},
): Promise<GridSample[]> {
	const { concurrency = 6, signal, onProgress, onSample } = options;
	const results: GridSample[] = new Array(points.length);
	let nextIndex = 0;
	let completed = 0;

	async function worker(): Promise<void> {
		for (;;) {
			if (signal?.aborted) return;
			const index = nextIndex++;
			if (index >= points.length) return;
			const point = points[index];

			let value: number | null = null;
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					value = await fetchFeatureInfo(wmts, point.lon, point.lat, isoTime, elevationMeters, signal);
					break;
				} catch (err) {
					if (signal?.aborted) return;
					if (attempt === 2) {
						console.warn("[copernicus-feature-info] Giving up on a point after 3 attempts:", point, err);
						value = null;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
				}
			}

			const sample: GridSample = { ...point, value };
			results[index] = sample;
			completed++;
			onSample?.(sample, index);
			onProgress?.(completed, points.length);
		}
	}

	const workerCount = Math.min(concurrency, points.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}
