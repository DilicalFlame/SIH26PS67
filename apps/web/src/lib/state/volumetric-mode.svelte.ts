/**
 * volumetric-mode.svelte.ts
 *
 * "Which shape is popped out into the 3D volumetric view" - read by
 * CesiumCanvas (to drive the modal takeover), VolumetricScene (what to
 * render), and VolumeControlPanel/VolumeBottomToolbar (when to show, and
 * what to show loading/error state for). Module-level $state, same pattern
 * as hover-point.svelte.ts / data-layer-registry.svelte.ts.
 */
import type { VolumeGrid } from "$lib/render/volume-field";

export interface VolumetricModeState {
	active: boolean;
	measurementId: string | null;
	layerId: string | null;
	grid: VolumeGrid | null;
	loading: boolean;
	error: string | null;
}

export const volumetricMode = $state<VolumetricModeState>({
	active: false,
	measurementId: null,
	layerId: null,
	grid: null,
	loading: false,
	error: null,
});

export function enterVolumetricMode(measurementId: string, layerId: string): void {
	volumetricMode.active = true;
	volumetricMode.measurementId = measurementId;
	volumetricMode.layerId = layerId;
	volumetricMode.grid = null;
	volumetricMode.loading = true;
	volumetricMode.error = null;
}

export function setVolumetricGrid(grid: VolumeGrid): void {
	volumetricMode.grid = grid;
	volumetricMode.loading = false;
}

export function setVolumetricError(message: string): void {
	volumetricMode.error = message;
	volumetricMode.loading = false;
}

export function exitVolumetricMode(): void {
	volumetricMode.active = false;
	volumetricMode.measurementId = null;
	volumetricMode.layerId = null;
	volumetricMode.grid = null;
	volumetricMode.loading = false;
	volumetricMode.error = null;
}
