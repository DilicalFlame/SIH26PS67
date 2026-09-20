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
	verticalExaggeration: 3,
};

export const volumeControls = $state<VolumeControlsState>({ ...DEFAULTS });

export function resetVolumeControls(): void {
	Object.assign(volumeControls, DEFAULTS);
}
