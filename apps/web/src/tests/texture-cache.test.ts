// apps/web/src/tests/texture-cache.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TextureCache } from '$lib/tiles/texture-cache';

function makeTexture(): THREE.DataTexture {
	return new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
}

describe('TextureCache', () => {
	it('returns undefined for a url that was never set', () => {
		const cache = new TextureCache(10);
		expect(cache.get('https://example.test/a.f32')).toBeUndefined();
	});

	it('returns exactly what was set for a url', () => {
		const cache = new TextureCache(10);
		const texture = makeTexture();
		cache.set('https://example.test/a.f32', texture);
		expect(cache.get('https://example.test/a.f32')).toBe(texture);
	});

	it('disposes the least-recently-used texture once maxSize is exceeded (#45)', () => {
		const cache = new TextureCache(2);
		const a = makeTexture();
		const b = makeTexture();
		const c = makeTexture();
		const disposeA = vi.spyOn(a, 'dispose');

		cache.set('a', a);
		cache.set('b', b);
		cache.set('c', c); // evicts 'a' - least recently used, never re-accessed

		expect(disposeA).toHaveBeenCalledTimes(1);
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBe(b);
		expect(cache.get('c')).toBe(c);
	});

	it('a get() refreshes recency, protecting it from the next eviction', () => {
		const cache = new TextureCache(2);
		const a = makeTexture();
		const b = makeTexture();
		const c = makeTexture();
		const disposeB = vi.spyOn(b, 'dispose');

		cache.set('a', a);
		cache.set('b', b);
		cache.get('a'); // 'a' is now more recently used than 'b'
		cache.set('c', c); // evicts 'b', not 'a'

		expect(disposeB).toHaveBeenCalledTimes(1);
		expect(cache.get('a')).toBe(a);
		expect(cache.get('c')).toBe(c);
	});

	it('a pinned texture is never evicted, even as the least recently used', () => {
		const cache = new TextureCache(1);
		const pinned = makeTexture();
		const other = makeTexture();
		const disposePinned = vi.spyOn(pinned, 'dispose');

		cache.set('pinned', pinned);
		cache.pin(pinned);
		cache.set('other', other); // would normally evict 'pinned' at maxSize 1

		expect(disposePinned).not.toHaveBeenCalled();
		expect(cache.get('pinned')).toBe(pinned);
	});

	it('unpin makes a texture evictable again', () => {
		const cache = new TextureCache(1);
		const texture = makeTexture();
		const disposeSpy = vi.spyOn(texture, 'dispose');

		cache.set('a', texture);
		cache.pin(texture);
		cache.unpin(texture);
		cache.set('b', makeTexture());

		expect(disposeSpy).toHaveBeenCalledTimes(1);
	});

	it('setMaxSize is configurable and trims immediately when shrunk (#45)', () => {
		const cache = new TextureCache(10);
		const a = makeTexture();
		const b = makeTexture();
		cache.set('a', a);
		cache.set('b', b);
		const disposeA = vi.spyOn(a, 'dispose');

		cache.setMaxSize(1);

		expect(disposeA).toHaveBeenCalledTimes(1);
		expect(cache.size).toBe(1);
		expect(cache.get('b')).toBe(b);
	});

	it('clear() disposes every texture, pinned or not', () => {
		const cache = new TextureCache(10);
		const pinned = makeTexture();
		const unpinned = makeTexture();
		cache.set('pinned', pinned);
		cache.pin(pinned);
		cache.set('unpinned', unpinned);
		const disposePinned = vi.spyOn(pinned, 'dispose');
		const disposeUnpinned = vi.spyOn(unpinned, 'dispose');

		cache.clear();

		expect(disposePinned).toHaveBeenCalledTimes(1);
		expect(disposeUnpinned).toHaveBeenCalledTimes(1);
		expect(cache.size).toBe(0);
	});
});
