import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Named *.svelte.test.ts (even though nothing here renders a component) so
// it runs under the "client" vitest project — real Chromium, real
// localStorage — since $app/environment's `browser` flag (and therefore
// every code path in session-store.ts) is false under the Node test
// project, making this module untestable there.
import { loadSession, patchSession, patchSessionDebounced } from './session-store';

const KEY = 'sih-viewer-session:v1';

const validCamera = {
	longitude: 12.5,
	latitude: -3.2,
	height: 25000,
	heading: 0.1,
	pitch: -1.2,
	roll: 0
};

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
});

describe('loadSession', () => {
	it('returns an empty session when nothing is stored', () => {
		expect(loadSession()).toEqual({});
	});

	it('returns an empty session for corrupt JSON rather than throwing', () => {
		localStorage.setItem(KEY, '{not json');
		expect(loadSession()).toEqual({});
	});

	it('returns an empty session for a JSON value that is not an object', () => {
		localStorage.setItem(KEY, '"just a string"');
		expect(loadSession()).toEqual({});
	});

	it('round-trips a fully valid session', () => {
		const session = {
			camera: validCamera,
			projection: 1,
			basemapId: 'osm',
			graticuleOn: false,
			layersOpen: true
		};
		localStorage.setItem(KEY, JSON.stringify(session));
		expect(loadSession()).toEqual(session);
	});

	it('drops a camera object missing a required field', () => {
		const { roll: _roll, ...incomplete } = validCamera;
		localStorage.setItem(KEY, JSON.stringify({ camera: incomplete, basemapId: 'osm' }));
		const loaded = loadSession();
		expect(loaded.camera).toBeUndefined();
		expect(loaded.basemapId).toBe('osm');
	});

	it('drops a camera object with a non-finite field', () => {
		localStorage.setItem(KEY, JSON.stringify({ camera: { ...validCamera, height: NaN } }));
		expect(loadSession().camera).toBeUndefined();
	});

	it('only accepts 0 or 1 for projection', () => {
		localStorage.setItem(KEY, JSON.stringify({ projection: 2 }));
		expect(loadSession().projection).toBeUndefined();

		localStorage.setItem(KEY, JSON.stringify({ projection: 1 }));
		expect(loadSession().projection).toBe(1);
	});

	it('ignores fields of the wrong type', () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({ basemapId: 42, graticuleOn: 'yes', layersOpen: null })
		);
		expect(loadSession()).toEqual({});
	});
});

describe('patchSession', () => {
	it('writes immediately and merges across calls', () => {
		patchSession({ basemapId: 'osm' });
		patchSession({ graticuleOn: false });

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.basemapId).toBe('osm');
		expect(stored.graticuleOn).toBe(false);
	});
});

describe('patchSessionDebounced', () => {
	it('coalesces rapid calls into a single write after the delay', () => {
		vi.useFakeTimers();

		patchSessionDebounced({ camera: validCamera }, 500);
		patchSessionDebounced({ camera: { ...validCamera, height: 9999 } }, 500);
		patchSessionDebounced({ camera: { ...validCamera, height: 5000 } }, 500);

		// Nothing written yet — still within the debounce window.
		expect(localStorage.getItem(KEY)).toBeNull();

		vi.advanceTimersByTime(500);

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.camera.height).toBe(5000);
	});
});
