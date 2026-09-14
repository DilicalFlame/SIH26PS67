// apps/web/src/tests/scalar-field.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ScalarFieldRenderer } from '$lib/render/scalar-field';
import { MAX_TILE_ZOOM, TILE_LAYERS, type ScalarFieldLayerConfig } from '$lib/tiles/layers.config';

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

describe('ScalarFieldRenderer', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockImplementation(() =>
			Promise.resolve(gridResponse([10, 20, 15, 25, 5, 30, 12, 18]))
		);
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('is hidden until setLayer resolves, and mounts into the scene', () => {
		const renderer = new ScalarFieldRenderer();
		expect(renderer.mesh.visible).toBe(false);

		const scene = new THREE.Scene();
		renderer.mount(scene);
		expect(scene.children).toContain(renderer.mesh);
	});

	it('defaults renderOrder above every coastline tile (#47)', () => {
		const renderer = new ScalarFieldRenderer();
		expect(renderer.mesh.renderOrder).toBeGreaterThan(maxCoastlineRenderOrder());
	});

	it('setRenderOrder lets two stacked fields draw in a configured order', () => {
		const back = new ScalarFieldRenderer();
		const front = new ScalarFieldRenderer();

		back.setRenderOrder(10000);
		front.setRenderOrder(10001);

		expect(front.mesh.renderOrder).toBeGreaterThan(back.mesh.renderOrder);
		expect(back.mesh.material).toMatchObject({ transparent: true, depthWrite: false });
	});

	it('fetches the grid substituting {d}/{t} with array indices, not values', async () => {
		const renderer = new ScalarFieldRenderer();
		const config = makeConfig({ depthIndex: 2, timeIndex: 5 });

		await renderer.setLayer(config);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d2_t5.f32'
		);
		expect(renderer.mesh.visible).toBe(true);
	});

	it('setValueRange / setOpacity / setColormap / setVisible never touch the network', async () => {
		const renderer = new ScalarFieldRenderer();
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
		const renderer = new ScalarFieldRenderer();
		await renderer.setLayer(makeConfig());
		fetchMock.mockClear();

		await renderer.setTimeIndex(3);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/fields/glorys_thetao/temperature/d0_t3.f32'
		);
	});

	it('sampleAt bilinearly interpolates the bound grid and returns null outside the bbox', async () => {
		const renderer = new ScalarFieldRenderer();
		// 2x2 grid over [-10,-10,10,10]: row 0 (north) = [10, 20], row 1 (south) = [15, 25].
		fetchMock.mockImplementation(() => Promise.resolve(gridResponse([10, 20, 15, 25])));
		await renderer.setLayer(
			makeConfig({ meta: { ...makeConfig().meta, width: 2, height: 2 } })
		);

		expect(renderer.sampleAt(0, 0)).not.toBeNull();
		expect(renderer.sampleAt(180, 80)).toBeNull(); // well outside the bbox
	});

	it('sampleAt renormalizes over valid taps instead of failing on a single NaN neighbour', async () => {
		const renderer = new ScalarFieldRenderer();
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
		const renderer = new ScalarFieldRenderer();
		const scene = new THREE.Scene();
		renderer.mount(scene);
		await renderer.setLayer(makeConfig());

		renderer.dispose();

		expect(scene.children).not.toContain(renderer.mesh);
	});
});
