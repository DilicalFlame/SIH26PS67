/**
 * texture-cache.ts
 *
 * LRU cache of scalar-field `THREE.DataTexture`s (#45), keyed by the exact
 * resolved grid URL (which already encodes layer, variable, depth, and time
 * - see contracts §4.3) rather than a hand-assembled `layerId:depth:time`
 * triple. Keying on layerId/depth/time alone collides whenever two configs
 * share a layerId but differ in grid shape or URL template, silently
 * serving one layer's texture for another's request.
 *
 * Reuses TileLRUCache (tile-cache.ts) rather than reimplementing LRU
 * bookkeeping - mirroring that pattern is what the issue asks for, and it
 * comes with `isPinned` for free: the texture actually bound to a live
 * renderer is never evicted mid prefetch-burst.
 */

import type * as THREE from 'three';
import { TileLRUCache } from './tile-cache';

const DEFAULT_MAX_SIZE = 150;

export class TextureCache {
	private readonly lru: TileLRUCache<THREE.DataTexture>;
	private readonly pinned = new Set<THREE.DataTexture>();

	constructor(maxSize: number = DEFAULT_MAX_SIZE) {
		this.lru = new TileLRUCache<THREE.DataTexture>(
			maxSize,
			(_key, texture) => texture.dispose(), // #45: GPU memory leaks if you only drop the reference
			(texture) => this.pinned.has(texture)
		);
	}

	get(url: string): THREE.DataTexture | undefined {
		return this.lru.get(url);
	}

	set(url: string, texture: THREE.DataTexture): void {
		this.lru.set(url, texture);
	}

	/** Protects a texture actively bound to a renderer from eviction. */
	pin(texture: THREE.DataTexture): void {
		this.pinned.add(texture);
	}

	unpin(texture: THREE.DataTexture): void {
		this.pinned.delete(texture);
	}

	setMaxSize(size: number): void {
		this.lru.setMaxSize(size);
	}

	get size(): number {
		return this.lru.size;
	}

	/** Disposes every cached texture, pinned or not - full teardown only. */
	clear(): void {
		for (const texture of this.lru.values()) texture.dispose();
		this.pinned.clear();
		this.lru.clear();
	}
}

/** Shared across every ScalarFieldRenderer by default so revisiting a
 * depth/time - even from a different renderer instance - hits the cache.
 * Tests inject their own instance instead (see scalar-field.test.ts) so
 * cached entries from one test can't leak into the next. */
export const sharedTextureCache = new TextureCache();
