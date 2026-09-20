/**
 * copernicus-legend.ts
 *
 * Fetches the exact colour ramp a WMTS style renders with, via the same
 * WMTS's GetLegend request used to verify styles/value-ranges while
 * building the catalog - confirmed keyless and CORS-open
 * (access-control-allow-origin: *) independently of GetTile/GetFeatureInfo,
 * so this also runs straight from the browser, no backend involved.
 *
 * Returned colours are exact RGB stops from Copernicus's own colormap
 * (`continuous.colorMapStrings`), not a re-implementation - the legend a
 * user sees here always matches the pixels rendered on the globe.
 */
import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";

export interface LegendData {
	/** CSS-ready colour stops (e.g. "rgb(4, 35, 51)"), evenly spaced 0..1. */
	colors: string[];
	valueMin: number;
	valueMax: number;
	units: string | null;
}

const cache = new Map<string, Promise<LegendData | null>>();

/** One real GetLegend fetch per (layer, style) pair, ever - subsequent
 *  callers (re-opening the same layer's accordion) reuse the in-flight or
 *  resolved promise instead of re-requesting. */
export function fetchLegend(wmts: CopernicusWmtsInfo): Promise<LegendData | null> {
	const key = `${wmts.layer}|${wmts.style}`;
	const cached = cache.get(key);
	if (cached) return cached;

	const promise = (async (): Promise<LegendData | null> => {
		const params = new URLSearchParams({
			SERVICE: "WMTS",
			REQUEST: "GetLegend",
			LAYER: wmts.layer,
			STYLE: wmts.style,
			FORMAT: "application/json",
		});
		try {
			const res = await fetch(`${wmts.url}?${params.toString()}`);
			if (!res.ok) return null;
			const body: unknown = await res.json();
			const continuous = (body as { continuous?: Record<string, unknown> })?.continuous;
			if (!continuous) return null;
			// The colour ramp is nested one level deeper, under `cmap` -
			// `continuous` itself only carries the value range/units/cmap name.
			const cmap = continuous.cmap as Record<string, unknown> | undefined;
			const colors = cmap?.colorMapStrings;
			const valueMin = continuous.valueMin;
			const valueMax = continuous.valueMax;
			if (!Array.isArray(colors) || typeof valueMin !== "number" || typeof valueMax !== "number") {
				return null;
			}
			return {
				colors: colors as string[],
				valueMin,
				valueMax,
				units: typeof continuous.units === "string" ? continuous.units : null,
			};
		} catch {
			return null;
		}
	})();

	cache.set(key, promise);
	return promise;
}
