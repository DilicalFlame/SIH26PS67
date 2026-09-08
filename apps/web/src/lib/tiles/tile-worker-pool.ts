/**
 * tile-worker-pool.ts
 *
 * Round-robin pool of tile-decode workers. There's no true network-level
 * cancellation of an in-flight decode (Comlink calls aren't abortable
 * mid-flight without extra plumbing) — instead tile-manager.ts simply
 * ignores results for tiles that are no longer wanted by the time they
 * arrive, which is the standard/acceptable pattern for tile prefetching.
 */

import * as Comlink from 'comlink';
import type { DecodeRequest, DecodeResult, TileWorkerApi } from './tile.worker';

export type { DecodeRequest, DecodeResult };

/**
 * Cap on in-flight tile requests. Deep zoom plus prefetch can queue hundreds
 * of tiles at once; letting them all issue range requests concurrently makes
 * the browser/object store start dropping them ("Failed to fetch"), which
 * shows up as permanent holes in the map.
 */
const MAX_IN_FLIGHT = 10;

export class TileWorkerPool {
	private workers: Comlink.Remote<TileWorkerApi>[] = [];
	private rawWorkers: Worker[] = [];
	private next = 0;
	private inFlight = 0;
	private queue: (() => void)[] = [];

	constructor(size = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))) {
		for (let i = 0; i < size; i++) {
			const worker = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' });
			this.rawWorkers.push(worker);
			this.workers.push(Comlink.wrap<TileWorkerApi>(worker));
		}
	}

	async decode(req: DecodeRequest): Promise<DecodeResult> {
		if (this.inFlight >= MAX_IN_FLIGHT) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.inFlight++;
		try {
			const worker = this.workers[this.next];
			this.next = (this.next + 1) % this.workers.length;
			return await worker.decodeTile(req);
		} finally {
			this.inFlight--;
			this.queue.shift()?.();
		}
	}

	dispose(): void {
		for (const w of this.rawWorkers) w.terminate();
		this.workers = [];
		this.rawWorkers = [];
		this.queue = [];
	}
}
