// apps/web/src/tests/prefetch-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PrefetchManager } from '$lib/tiles/prefetch-manager';
import { TextureCache } from '$lib/tiles/texture-cache';

function gridResponse(values: number[]): Response {
	return new Response(new Float32Array(values).buffer, { status: 200 });
}

function makeTexture(): THREE.DataTexture {
	return new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
}

/** Flushes the .then()/.catch()/.finally() chain prefetchOne() builds on top
 * of an already-resolved fetch mock. */
async function flushMicrotasks(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PrefetchManager', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	let cache: TextureCache;

	beforeEach(() => {
		fetchMock = vi.fn().mockImplementation(() => Promise.resolve(gridResponse([1, 2, 3, 4])));
		vi.stubGlobal('fetch', fetchMock);
		cache = new TextureCache();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches every time step for the given depth (#45)', () => {
		const manager = new PrefetchManager(cache);

		manager.prefetchTimeSeries({
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			depthIndex: 0,
			totalTimeSteps: 3,
			width: 2,
			height: 2,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/layer/d0_t0.f32',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(fetchMock).toHaveBeenCalledWith('https://example.test/layer/d0_t2.f32', expect.anything());
	});

	it('populates the cache once each prefetch resolves', async () => {
		const manager = new PrefetchManager(cache);

		manager.prefetchTimeSeries({
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			depthIndex: 0,
			totalTimeSteps: 2,
			width: 2,
			height: 2,
		});
		await flushMicrotasks();

		expect(cache.get('https://example.test/layer/d0_t0.f32')).toBeDefined();
		expect(cache.get('https://example.test/layer/d0_t1.f32')).toBeDefined();
	});

	it('skips a url already in the cache', () => {
		const manager = new PrefetchManager(cache);
		cache.set('https://example.test/layer/d0_t0.f32', makeTexture());

		manager.prefetchTimeSeries({
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			depthIndex: 0,
			totalTimeSteps: 1,
			width: 2,
			height: 2,
		});

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('skips a url whose prefetch is already in flight instead of double-fetching', () => {
		const manager = new PrefetchManager(cache);
		const options = {
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			depthIndex: 0,
			totalTimeSteps: 1,
			width: 2,
			height: 2,
		};

		manager.prefetchTimeSeries(options);
		manager.prefetchTimeSeries(options); // same url, first fetch hasn't resolved yet

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('prefetches depth neighbors at a given time index', () => {
		const manager = new PrefetchManager(cache);

		manager.prefetchDepthNeighbors({
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			timeIndex: 0,
			depthIndices: [1, 2],
			width: 2,
			height: 2,
		});

		expect(fetchMock).toHaveBeenCalledWith('https://example.test/layer/d1_t0.f32', expect.anything());
		expect(fetchMock).toHaveBeenCalledWith('https://example.test/layer/d2_t0.f32', expect.anything());
	});

	it('cancelAll aborts every in-flight prefetch', () => {
		const manager = new PrefetchManager(cache);
		manager.prefetchTimeSeries({
			resolvedGridUrlTemplate: 'https://example.test/layer/d{d}_t{t}.f32',
			depthIndex: 0,
			totalTimeSteps: 1,
			width: 2,
			height: 2,
		});

		const [, options] = fetchMock.mock.calls[0] as [string, { signal: AbortSignal }];
		expect(options.signal.aborted).toBe(false);

		manager.cancelAll();

		expect(options.signal.aborted).toBe(true);
	});
});
