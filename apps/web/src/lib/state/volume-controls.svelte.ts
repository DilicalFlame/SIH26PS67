/**
 * volume-controls.svelte.ts
 *
 * Display parameters for the volumetric popout - read by VolumetricScene's
 * raymarch material (see volume-raymarch.ts) and written by
 * VolumeControlPanel. A second store, not props, so the two components
 * don't need a direct reference to each other (same reasoning as
 * volumetric-mode.svelte.ts).
 */
import { COLORMAPS } from "$lib/render/colormaps";

export interface VolumeControlsState {
	opacity: number;
	colormap: string;
	verticalExaggeration: number;
}

const DEFAULTS: VolumeControlsState = {
	opacity: 0.85,
	colormap: "turbo" in COLORMAPS ? "turbo" : "thermal",
	// Ocean depth is genuinely tiny next to a drawn shape's horizontal
	// extent (a few km deep vs. tens-to-hundreds of km wide) - even 3x
	// reads as visually flat. Defaulting much higher gets a recognizable
	// "block" shape out of the box; the slider still goes higher still for
	// a deliberately dramatic look.
	verticalExaggeration: 12,
};

export const volumeControls = $state<VolumeControlsState>({ ...DEFAULTS });

export function resetVolumeControls(): void {
	Object.assign(volumeControls, DEFAULTS);
}
