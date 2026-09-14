// apps/web/src/tests/ui-actions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UiAction } from '$lib/types/ui-action';

// flush() batches to requestAnimationFrame — capture and drive callbacks by
// hand instead of waiting on a real frame. Each test re-imports the module
// fresh (vi.resetModules) so module-level `pendingActions`/`flushScheduled`
// from one test can't leak into the next.
let rafCallbacks: FrameRequestCallback[];

function stubRaf() {
	rafCallbacks = [];
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn((cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		})
	);
}

function runRaf() {
	const callbacks = rafCallbacks;
	rafCallbacks = [];
	for (const cb of callbacks) cb(0);
}

async function freshModule() {
	vi.resetModules();
	return import('$lib/state/ui-actions.svelte');
}

const setMapLayer: UiAction = { type: 'set_map_layer', layerId: 'glorys_thetao' };
const flyTo: UiAction = { type: 'fly_to', bbox: [-10, -10, 10, 10] };
const openProfile: UiAction = { type: 'open_profile', profileId: 'argo-1234' };

describe('ui-actions bus', () => {
	beforeEach(() => {
		stubRaf();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('dispatches and delivers all three UiAction variants', async () => {
		const { dispatchUiAction, onUiAction } = await freshModule();
		const received: UiAction[] = [];
		onUiAction((a) => received.push(a));

		dispatchUiAction(setMapLayer);
		dispatchUiAction(flyTo);
		dispatchUiAction(openProfile);
		runRaf();

		expect(received).toEqual([setMapLayer, flyTo, openProfile]);
	});

	it('delivers to multiple simultaneous subscribers', async () => {
		const { dispatchUiAction, onUiAction } = await freshModule();
		const a: UiAction[] = [];
		const b: UiAction[] = [];
		onUiAction((action) => a.push(action));
		onUiAction((action) => b.push(action));

		dispatchUiAction(flyTo);
		runRaf();

		expect(a).toEqual([flyTo]);
		expect(b).toEqual([flyTo]);
	});

	it('unsubscribe stops delivery without affecting other subscribers', async () => {
		const { dispatchUiAction, onUiAction } = await freshModule();
		const kept: UiAction[] = [];
		const dropped: UiAction[] = [];
		onUiAction((action) => kept.push(action));
		const unsubscribe = onUiAction((action) => dropped.push(action));

		unsubscribe();
		dispatchUiAction(flyTo);
		runRaf();

		expect(kept).toEqual([flyTo]);
		expect(dropped).toEqual([]);
	});

	it('batches same-tick dispatches into one requestAnimationFrame flush', async () => {
		const { dispatchUiAction, onUiAction } = await freshModule();
		const received: UiAction[] = [];
		onUiAction((a) => received.push(a));

		dispatchUiAction(setMapLayer);
		dispatchUiAction(flyTo);
		expect(rafCallbacks).toHaveLength(1); // one flush scheduled, not two
		expect(received).toHaveLength(0); // nothing delivered until the frame runs

		runRaf();
		expect(received).toEqual([setMapLayer, flyTo]);
	});

	it('warns and drops an action with an unrecognized type, instead of throwing or delivering it', async () => {
		const { dispatchUiAction, onUiAction } = await freshModule();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const received: UiAction[] = [];
		onUiAction((a) => received.push(a));

		expect(() =>
			dispatchUiAction({ type: 'delete_everything' } as unknown as UiAction)
		).not.toThrow();
		runRaf();

		expect(received).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('warns and drops a malformed (non-object) action rather than throwing', async () => {
		const { dispatchUiAction } = await freshModule();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(() => dispatchUiAction(null as unknown as UiAction)).not.toThrow();
		expect(() => dispatchUiAction(undefined as unknown as UiAction)).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});
});
