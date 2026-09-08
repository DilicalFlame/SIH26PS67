/**
 * tile-cache.ts
 *
 * Small generic LRU keyed by tile id string. Used per-layer so a recently
 * seen tile (e.g. backing out of a zoom, or a wheel-velocity prefetch hit)
 * reuses its already-decoded GPU buffers instead of re-fetching/re-decoding.
 */

export class TileLRUCache<V> {
	private map = new Map<string, V>();

	constructor(
		private readonly maxSize: number,
		private readonly onEvict: (key: string, value: V) => void,
		/** Entries this returns true for are never evicted. */
		private readonly isPinned?: (value: V) => boolean
	) {}

	get(key: string): V | undefined {
		const v = this.map.get(key);
		if (v !== undefined) {
			this.map.delete(key);
			this.map.set(key, v);
		}
		return v;
	}

	set(key: string, value: V): void {
		if (this.map.has(key)) this.map.delete(key);
		this.map.set(key, value);
		this.trim();
	}

	private trim(): void {
		// Walk from the least recently used end, skipping anything still in use.
		// Evicting a tile that is currently on screen tears a hole in the map,
		// which is exactly what rapid panning used to trigger: the churn of new
		// tiles pushed visible ones out of the cache.
		let guard = this.map.size;
		while (this.map.size > this.maxSize && guard-- > 0) {
			const oldestKey = this.map.keys().next().value as string;
			const oldestVal = this.map.get(oldestKey) as V;
			this.map.delete(oldestKey);

			if (this.isPinned?.(oldestVal)) {
				this.map.set(oldestKey, oldestVal); // move to the recent end and keep
				continue;
			}
			this.onEvict(oldestKey, oldestVal);
		}
	}

	/** Removes without invoking onEvict — the caller owns the value's disposal. */
	delete(key: string): void {
		this.map.delete(key);
	}

	values(): IterableIterator<V> {
		return this.map.values();
	}

	entries(): IterableIterator<[string, V]> {
		return this.map.entries();
	}
}
