// apps/web/src/tests/scalar-field.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PUBLIC_TILES_BASE_URL } from '$env/static/public';
import { ScalarFieldRenderer } from '$lib/render/scalar-field';
import { MAX_TILE_ZOOM, TILE_LAYERS, type ScalarFieldLayerConfig } from '$lib/tiles/layers.config';
import { TextureCache } from '$lib/tiles/texture-cache';

/** A fetch mock whose response the test resolves/rejects on its own schedule,
 * so ordering between two overlapping loadGrid() calls is controllable. */
function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Mirrors tile-manager.ts's buildMeshes(): `style.order * 1000 + zoom`. */
function maxCoastlineRenderOrder(): number {
	const maxStyleOrder = Math.max(...TILE_LAYERS.flatMap((l) => l.styles.map((s) => s.order)));
	return maxStyleOrder * 1000 + MAX_TILE_ZOOM;
}

function makeConfig(overrides: Partial<ScalarFieldLayerConfig> = {}): ScalarFieldLayerConfig {
	return {
		kind: 'scalar_field',
		id: 'glorys_thetao',
		meta: {
			layerId: 'glorys_thetao',
			variable: 'temperature',
			units: 'degC',
			width: 4,
			height: 2,
			bbox: [-10, -10, 10, 10],
			depths: [0],
			times: ['2026-01-01T00:00:00Z'],
			valueMin: 0,
			valueMax: 30,
			noDataValue: 'NaN',
			gridUrlTemplate: 'https://example.test/fields/glorys_thetao/temperature/d{d}_t{t}.f32',
		},
		colormap: 'thermal',
		valueRange: [0, 30],
		opacity: 1,
		visible: true,
		depthIndex: 0,
		timeIndex: 0,
		...overrides,
	};
}

function gridResponse(values: number[]): Response {
	const buf = new Float32Array(values).buffer;
	return new Response(buf, { status: 200 });
}

/** Flushes the .then()/.catch()/.finally() chain a fire-and-forget prefetch
 * builds on top of an already-resolved fetch mock (#45). */
async function flushMicrotasks(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ScalarFieldRenderer', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	// #45: a fresh cache per test — ScalarFieldRenderer defaults to a module-
	// level shared cache in production, but sharing that same instance across
	// tests would let one test's cached texture answer another test's fetch,
	// since every test here reuses the same gridUrlTemplate/depth/time.
	let cache: TextureCache;

	beforeEach(() => {
		fetchMock = vi.fn().mockImplementation(() =>
			Promise.resolve(gridResponse([10, 20, 15, 25, 5, 30, 12, 18]))
		);
		vi.stubGlobal('fetch', fetchMock);
		cache = new TextureCache();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function makeRenderer(): ScalarFieldRenderer {
		return new ScalarFieldRenderer(cache);
	}

	it('is hidden until setLayer resolves, and mounts into the scene', () => {
		const renderer = makeRenderer();
		expect(renderer.mesh.visible).toBe(false);

		const scene = new THREE.Scene();
		renderer.mount(scene);
		expect(scene.children).toContain(renderer.mesh);
	});

	it('defaults renderOrder above every coastline tile (#47)', () => {
		const renderer = makeRenderer();
		expect(renderer.mesh.renderOrder).toBeGreaterThan(maxCoastlineRenderOrder());
	});

	it('setRenderOrder lets two stacked fields draw in a configured order', () => {
		const back = makeRenderer();
		const front = makeRenderer();

		back.setRenderOrder(10000);
		front.setRenderOrder(10001);

		expect(front.mesh.renderOrder).toBeGreaterThan(back.mesh.renderOrder);
		expect(back.mesh.material).toMatchObject({ transparent: true, depthWrite: false });
	});

	it('fetches the grid substituting {d}/{t} with array indices, not values', async () => {
		const renderer = makeRenderer();
		const config = makeConfig({ depthIndex: 2, timeIndex: 5 });

		await renderer.setLayer(config);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d2_t5.f32',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(renderer.mesh.visible).toBe(true);
	});

	it('setValueRange / setOpacity / setColormap / setVisible never touch the network', async () => {
		const renderer = makeRenderer();
		await renderer.setLayer(makeConfig());
		fetchMock.mockClear();

		renderer.setValueRange(-2, 2);
		renderer.setOpacity(0.4);
		renderer.setColormap('balance');
		renderer.setVisible(false);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(renderer.mesh.visible).toBe(false);
	});

	it('setDepthIndex / setTimeIndex refetch the grid at the new indices', async () => {
		const renderer = makeRenderer();
		await renderer.setLayer(makeConfig());
		fetchMock.mockClear();

		await renderer.setTimeIndex(3);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d0_t3.f32',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('sampleAt bilinearly interpolates the bound grid and returns null outside the bbox', async () => {
		const renderer = makeRenderer();
		// 2x2 grid over [-10,-10,10,10]: row 0 (north) = [10, 20], row 1 (south) = [15, 25].
		fetchMock.mockImplementation(() => Promise.resolve(gridResponse([10, 20, 15, 25])));
		await renderer.setLayer(
			makeConfig({ meta: { ...makeConfig().meta, width: 2, height: 2 } })
		);

		expect(renderer.sampleAt(0, 0)).not.toBeNull();
		expect(renderer.sampleAt(180, 80)).toBeNull(); // well outside the bbox
	});

	it('sampleAt renormalizes over valid taps instead of failing on a single NaN neighbour', async () => {
		const renderer = makeRenderer();
		// row 0 (north) = [10, NaN], row 1 (south) = [15, 25].
		fetchMock.mockImplementation(() => Promise.resolve(gridResponse([10, NaN, 15, 25])));
		await renderer.setLayer(
			makeConfig({ meta: { ...makeConfig().meta, width: 2, height: 2 } })
		);

		// Grid center: equidistant from all four texels, one of which is NaN —
		// should renormalize over the remaining three rather than discarding.
		const value = renderer.sampleAt(0, 0);
		expect(value).not.toBeNull();
		expect(Number.isNaN(value)).toBe(false);
		expect(value).toBeCloseTo((10 + 15 + 25) / 3, 5);
	});

	it('dispose removes the mesh from the scene', async () => {
		const renderer = makeRenderer();
		const scene = new THREE.Scene();
		renderer.mount(scene);
		await renderer.setLayer(makeConfig());

		renderer.dispose();

		expect(scene.children).not.toContain(renderer.mesh);
	});

	it('substitutes {tilesBase} from PUBLIC_TILES_BASE_URL, ahead of {d}/{t} (#48)', async () => {
		const renderer = makeRenderer();
		await renderer.setLayer(
			makeConfig({
				meta: {
					...makeConfig().meta,
					gridUrlTemplate: '{tilesBase}/fields/glorys_thetao/temperature/d{d}_t{t}.f32',
				},
				depthIndex: 1,
				timeIndex: 4,
			})
		);

		const base = PUBLIC_TILES_BASE_URL.replace(/\/$/, '');
		expect(fetchMock).toHaveBeenCalledWith(
			`${base}/fields/glorys_thetao/temperature/d1_t4.f32`,
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('dispose aborts an in-flight fetch and never binds its (now stale) response (#48)', async () => {
		const pending = deferred<Response>();
		fetchMock.mockImplementation(() => pending.promise);

		const renderer = makeRenderer();
		const scene = new THREE.Scene();
		renderer.mount(scene);
		const setLayerPromise = renderer.setLayer(makeConfig());

		renderer.dispose();
		pending.resolve(gridResponse([10, 20, 15, 25, 5, 30, 12, 18]));

		await expect(setLayerPromise).resolves.toBeUndefined();
		expect(scene.children).not.toContain(renderer.mesh);
		// No grid was ever bound, so there is nothing to sample.
		expect(renderer.sampleAt(0, 0)).toBeNull();
	});

	it('a request superseded by a newer one never binds, even if it resolves last (#48)', async () => {
		const renderer = makeRenderer();
		await renderer.setLayer(makeConfig()); // binds the default fetchMock response first

		const older = deferred<Response>();
		const newer = deferred<Response>();
		fetchMock.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);

		const p1 = renderer.setTimeIndex(1); // superseded before it resolves
		const p2 = renderer.setTimeIndex(2);

		// The newer request settles first, then the older, stale one resolves after —
		// the guard must key off supersession, not arrival order.
		newer.resolve(gridResponse([222, 222, 222, 222, 222, 222, 222, 222]));
		await p2;
		older.resolve(gridResponse([111, 111, 111, 111, 111, 111, 111, 111]));
		await p1;

		expect(renderer.sampleAt(0, 0)).toBeCloseTo(222, 5);
	});

	it('a failed fetch rejects, and a later retry succeeds without recreating the renderer (#48)', async () => {
		const renderer = makeRenderer();
		fetchMock.mockImplementationOnce(() => Promise.reject(new Error('network down')));

		await expect(renderer.setLayer(makeConfig())).rejects.toThrow('network down');
		expect(renderer.sampleAt(0, 0)).toBeNull(); // no grid was ever bound

		// Retry: caller just calls the same method again (§5.2 has no retry() of its own).
		fetchMock.mockImplementationOnce(() => Promise.resolve(gridResponse([1, 2, 3, 4, 5, 6, 7, 8])));
		await renderer.setLayer(makeConfig());

		expect(renderer.sampleAt(0, 0)).not.toBeNull();
	});

	it('setLayer prefetches the full time series for the active depth (#45)', async () => {
		const renderer = makeRenderer();
		const config = makeConfig({
			meta: {
				...makeConfig().meta,
				times: ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z'],
			},
		});

		await renderer.setLayer(config); // loads t0 directly; t1/t2 should prefetch in the background

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d0_t1.f32',
			expect.anything()
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d0_t2.f32',
			expect.anything()
		);
	});

	it('a time change to an already-prefetched index hits the cache with no network request (#45)', async () => {
		const renderer = makeRenderer();
		const config = makeConfig({
			meta: {
				...makeConfig().meta,
				times: ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'],
			},
		});

		await renderer.setLayer(config); // loads t0, prefetches t1
		await flushMicrotasks(); // let the prefetch's fetch->texture chain land in the cache
		fetchMock.mockClear();

		await renderer.setTimeIndex(1);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(renderer.sampleAt(0, 0)).not.toBeNull();
	});

	it('dispose unpins the bound texture instead of disposing it — the cache still owns it (#45)', async () => {
		const renderer = makeRenderer();
		await renderer.setLayer(makeConfig());
		const url = 'https://example.test/fields/glorys_thetao/temperature/d0_t0.f32';
		const cachedTexture = cache.get(url);
		expect(cachedTexture).toBeDefined();
		const disposeSpy = vi.spyOn(cachedTexture as THREE.DataTexture, 'dispose');

		renderer.dispose();

		expect(disposeSpy).not.toHaveBeenCalled();
		expect(cache.get(url)).toBe(cachedTexture); // still retrievable — not evicted or disposed
	});
});
