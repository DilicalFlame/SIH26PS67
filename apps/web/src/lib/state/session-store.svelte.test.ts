import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Named *.svelte.test.ts (even though nothing here renders a component) so
// it runs under the "client" vitest project — real Chromium, real
// localStorage — since $app/environment's `browser` flag (and therefore
// every code path in session-store.ts) is false under the Node test
// project, making this module untestable there.
import {
	loadSession,
	dispatchSessionAction,
	SessionActionType,
	__resetSessionCacheForTests
} from './session-store';

const KEY = 'sih-viewer-session:v1';

const validCamera = {
	longitude: 12.5,
	latitude: -3.2,
	height: 25000,
	heading: 0.1,
	pitch: -1.2,
	roll: 0
};

const validPath = {
	id: 'm-1',
	type: 'path' as const,
	label: 'Path 1',
	positions: [
		[0, 0],
		[1, 1]
	] as [number, number][]
};

const validPolygon = {
	id: 'm-2',
	type: 'polygon' as const,
	label: 'Polygon 1',
	positions: [
		[0, 0],
		[1, 0],
		[1, 1]
	] as [number, number][]
};

beforeEach(() => {
	localStorage.clear();
	// dispatchSessionAction merges onto a module-private in-memory cache
	// that outlives any single test (it's meant to persist for the page's
	// whole real lifetime) — without this, clearing localStorage alone
	// still leaves state leaking between test cases.
	__resetSessionCacheForTests();
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
			layersOpen: true,
			measurements: [validPath, validPolygon]
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

	it('filters out an individually malformed measurement without dropping the rest', () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({ measurements: [validPath, { id: 'bad' }, validPolygon] })
		);
		expect(loadSession().measurements).toEqual([validPath, validPolygon]);
	});

	it('rejects a measurement with fewer than 2 positions', () => {
		localStorage.setItem(
			KEY,
			JSON.stringify({ measurements: [{ ...validPath, positions: [[0, 0]] }] })
		);
		expect(loadSession().measurements).toEqual([]);
	});
});

describe('dispatchSessionAction: immediate (non-debounced) actions', () => {
	it('writes immediately and merges across calls', () => {
		dispatchSessionAction({ type: SessionActionType.BasemapChanged, payload: 'osm' });
		dispatchSessionAction({ type: SessionActionType.GraticuleToggled, payload: false });

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.basemapId).toBe('osm');
		expect(stored.graticuleOn).toBe(false);
	});

	it('MeasurementAdded appends without clobbering an existing list', () => {
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: validPath });
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: validPolygon });

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.measurements).toEqual([validPath, validPolygon]);
	});

	it('MeasurementRemoved removes only the matching id', () => {
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: validPath });
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: validPolygon });
		dispatchSessionAction({ type: SessionActionType.MeasurementRemoved, payload: validPath.id });

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.measurements).toEqual([validPolygon]);
	});

	it('MeasurementsCleared empties the list', () => {
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: validPath });
		dispatchSessionAction({ type: SessionActionType.MeasurementsCleared });

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.measurements).toEqual([]);
	});

	it('an immediate action flushes a still-pending debounced action from a different type', () => {
		vi.useFakeTimers();
		dispatchSessionAction({ type: SessionActionType.CameraChanged, payload: validCamera });
		expect(localStorage.getItem(KEY)).toBeNull(); // still debouncing

		dispatchSessionAction({ type: SessionActionType.BasemapChanged, payload: 'osm' });
		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.camera).toEqual(validCamera); // merged in even though its own timer hadn't fired
		expect(stored.basemapId).toBe('osm');
	});
});

describe('dispatchSessionAction: CameraChanged (debounced)', () => {
	it('coalesces rapid calls into a single write after the delay', () => {
		vi.useFakeTimers();

		dispatchSessionAction({ type: SessionActionType.CameraChanged, payload: validCamera });
		dispatchSessionAction({
			type: SessionActionType.CameraChanged,
			payload: { ...validCamera, height: 9999 }
		});
		dispatchSessionAction({
			type: SessionActionType.CameraChanged,
			payload: { ...validCamera, height: 5000 }
		});

		// Nothing written yet — still within the debounce window.
		expect(localStorage.getItem(KEY)).toBeNull();

		vi.advanceTimersByTime(500);

		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		expect(stored.camera.height).toBe(5000);
	});

	it('does not write at all if nothing dispatches long enough to clear the debounce', () => {
		vi.useFakeTimers();
		dispatchSessionAction({ type: SessionActionType.CameraChanged, payload: validCamera });
		vi.advanceTimersByTime(499);
		expect(localStorage.getItem(KEY)).toBeNull();
		vi.advanceTimersByTime(1);
		expect(localStorage.getItem(KEY)).not.toBeNull();
	});
});
