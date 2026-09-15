/**
 * prefetch-manager.ts
 *
 * Background loading for scalar-field textures (#45): the whole time
 * series for the active depth loads in the background as soon as a layer
 * is bound, so a later depth/time change is usually a cache hit with no
 * network request. Depth-neighbour prefetch-on-hover is implemented per
 * the issue's notes but not wired to anything yet — ScalarFieldRenderer has
 * no hover plumbing, and building that here would be UI scope this file
 * shouldn't own; #55/#58 can call `prefetchDepthNeighbors` once it exists.
 *
 * Deliberately decoupled from ScalarFieldRenderer: it knows nothing about
 * uniforms, meshes, or configs — only URLs and a texture cache — so it can't
 * duplicate or drift from scalar-field.ts's own fetch/bind logic.
 */

import { buildGridUrl, fetchGridTexture } from '$lib/render/grid-texture';
import type { TextureCache } from './texture-cache';

export interface TimeSeriesPrefetchOptions {
	/** {tilesBase}/{d}/{t} resolved except {d}/{t} — see grid-texture.ts. */
	resolvedGridUrlTemplate: string;
	depthIndex: number;
	totalTimeSteps: number;
	width: number;
	height: number;
}

export interface DepthNeighborPrefetchOptions {
	resolvedGridUrlTemplate: string;
	timeIndex: number;
	depthIndices: number[];
	width: number;
	height: number;
}

export class PrefetchManager {
	private readonly activePrefetches = new Set<string>();
	private controller = new AbortController();

	constructor(private readonly cache: TextureCache) {}

	/** At 96 KB/grid a 60-step series is under 6 MB — fire every request now
	 * rather than awaiting each in turn; cache/in-flight checks dedupe. */
	prefetchTimeSeries(options: TimeSeriesPrefetchOptions): void {
		const { resolvedGridUrlTemplate, depthIndex, totalTimeSteps, width, height } = options;
		for (let time = 0; time < totalTimeSteps; time++) {
			this.prefetchOne(buildGridUrl(resolvedGridUrlTemplate, depthIndex, time), width, height);
		}
	}

	prefetchDepthNeighbors(options: DepthNeighborPrefetchOptions): void {
		const { resolvedGridUrlTemplate, timeIndex, depthIndices, width, height } = options;
		for (const depth of depthIndices) {
			this.prefetchOne(buildGridUrl(resolvedGridUrlTemplate, depth, timeIndex), width, height);
		}
	}

	/** Aborts every in-flight prefetch — call on renderer dispose(). Already-
	 * cached results from prefetches that finished earlier are unaffected. */
	cancelAll(): void {
		this.controller.abort();
		this.controller = new AbortController();
		this.activePrefetches.clear();
	}

	private prefetchOne(url: string, width: number, height: number): void {
		if (this.cache.get(url) || this.activePrefetches.has(url)) return;

		this.activePrefetches.add(url);
		fetchGridTexture(url, width, height, this.controller.signal)
			.then((texture) => {
				if (texture) this.cache.set(url, texture);
			})
			.catch((err: unknown) => {
				console.warn(`[PrefetchManager] failed to prefetch ${url}:`, err);
			})
			.finally(() => {
				this.activePrefetches.delete(url);
			});
	}
}
