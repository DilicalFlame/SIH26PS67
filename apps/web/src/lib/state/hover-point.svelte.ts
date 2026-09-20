/**
 * hover-point.svelte.ts
 *
 * The lon/lat under the cursor while it's over the globe, or `null` when
 * it isn't - published by CesiumCanvas's existing MOUSE_MOVE handler (it
 * already computes this every move for the status bar's coordinate
 * readout), consumed by ActiveLayersPanel to sample each visible layer's
 * value at that point (see its hover-sampling $effect).
 *
 * A `$state`-wrapped object, not a bare exported `let` - same reasoning as
 * lib/state/view-status.svelte.ts: importing modules can only mutate a
 * property on an imported binding, not reassign the binding itself.
 */
export interface HoverLonLat {
	lon: number;
	lat: number;
}

export const hoverPointState = $state<{ point: HoverLonLat | null }>({ point: null });
