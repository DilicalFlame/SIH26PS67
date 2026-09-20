/**
 * copernicus-coverage-check.ts
 *
 * Catches the case a plain bbox-intersection filter can't: a product whose
 * *declared* WGS84BoundingBox is far wider than its *real* data density
 * (confirmed live - e.g. a coastal-only bathymetry product that still
 * declares near-global coverage), so it passes the polygon "Area of
 * Interest" filter's server-side bbox check yet has no actual data anywhere
 * near the point the user cares about.
 *
 * Deliberately a single GetFeatureInfo point-check per (layer, sample
 * point) pair, called lazily as each result card scrolls into view (see
 * CatalogLayerCard.svelte's thumbVisibility action) - not a grid, and not
 * run against the full ~500-candidate result set up front. This is a
 * spot-check, not a guarantee: a polygon's centroid can land on a genuinely
 * empty pixel (e.g. a small landmass) inside an otherwise-valid area, so a
 * "false" result is surfaced in the UI as a soft warning, never a block on
 * adding the layer.
 */
import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";
import { fetchFeatureInfo } from "$lib/copernicus/copernicus-feature-info";

export interface SamplePoint {
	lon: number;
	lat: number;
}

// Bounded worker pool shared across every card's check - a scroll burst
// past dozens of results at once would otherwise fire that many concurrent
// fetches with no coordination at all (each card's effect is independent),
// leaving how many actually run in parallel entirely up to the browser's own
// per-origin connection cap. This is I/O-bound (waiting on Copernicus, not
// CPU), so more *workers* here means more concurrent in-flight requests, not
// literal Web Worker threads - those wouldn't shorten a network round trip.
// 12 is a deliberate step above fetchGrid's own 6 (copernicus-feature-info.ts)
// since each request here is a single tiny point query, not part of a larger
// grid fetch competing for the same connections.
const MAX_CONCURRENT_CHECKS = 12;
let activeChecks = 0;
const pendingQueue: (() => void)[] = [];

function runQueued<T>(task: () => Promise<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		const run = () => {
			activeChecks++;
			task()
				.then(resolve, reject)
				.finally(() => {
					activeChecks--;
					pendingQueue.shift()?.();
				});
		};
		if (activeChecks < MAX_CONCURRENT_CHECKS) run();
		else pendingQueue.push(run);
	});
}

// Keyed by layer+style+time+points so re-checking the same card (e.g. after
// scrolling away and back) is a cache hit, not a repeat request.
const resultCache = new Map<string, Promise<boolean>>();

function cacheKey(entry: DataLayerCatalogEntry, isoTime: string, points: SamplePoint[]): string {
	const pointKey = points.map((p) => `${p.lon.toFixed(3)},${p.lat.toFixed(3)}`).join(";");
	return `${entry.wmts?.layer}|${entry.wmts?.style}|${isoTime}|${pointKey}`;
}

/** True if a real (non-null) value was found at ANY of `points` - matches
 *  the polygon filter's own OR-across-selected-polygons semantics, so a
 *  layer that covers just one of several selected areas isn't flagged.
 *  Fails OPEN: a transport error or abort (e.g. the card scrolled back out
 *  of view mid-request) never counts as "confirmed missing," only a clean
 *  no-data response from every point does - an inconclusive check simply
 *  isn't cached, so a later retry starts fresh. */
export async function hasDataNearPoints(entry: DataLayerCatalogEntry, points: SamplePoint[]): Promise<boolean> {
	if (!entry.wmts || points.length === 0) return true;

	const isoTime = entry.timeEnd ?? entry.restoreDescriptor?.time?.default ?? new Date().toISOString();
	const elevation = entry.wmts.defaultElevation || undefined;
	const key = cacheKey(entry, isoTime, points);

	const cached = resultCache.get(key);
	if (cached) return cached;

	const wmts = entry.wmts;
	const promise = runQueued(async () => {
		for (const point of points) {
			try {
				const value = await fetchFeatureInfo(wmts, point.lon, point.lat, isoTime, elevation);
				if (value !== null) return true;
			} catch {
				resultCache.delete(key);
				return true;
			}
		}
		return false;
	});
	resultCache.set(key, promise);
	return promise;
}
