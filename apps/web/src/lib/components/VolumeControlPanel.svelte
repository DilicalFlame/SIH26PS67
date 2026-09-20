<script lang="ts">
	/**
	 * VolumeControlPanel.svelte
	 *
	 * Right-side floating panel shown only while the "Visualise Data" 3D
	 * popout is active (see volumetric-mode.svelte.ts) - mirrors
	 * HeadingControl's fixed bottom/right positioning convention. Writes
	 * into volume-controls.svelte.ts rather than taking callback props, so
	 * VolumetricScene.svelte (the reader) needs no direct reference to this
	 * component.
	 */
	import { volumetricMode } from "$lib/state/volumetric-mode.svelte";
	import { volumeControls } from "$lib/state/volume-controls.svelte";
	import { COLORMAPS } from "$lib/render/colormaps";
	import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";

	interface Props {
		layerEntry: DataLayerCatalogEntry | undefined;
		onExit: () => void;
	}
	const { layerEntry, onExit }: Props = $props();

	const colormapNames = Object.keys(COLORMAPS);
</script>

<div class="volume-panel">
	<header>
		<div class="title">
			<span class="eyebrow">Visualising</span>
			<h2>{layerEntry?.title ?? "Data layer"}</h2>
		</div>
		<button type="button" class="exit" onclick={onExit}>Exit 3D View</button>
	</header>

	{#if volumetricMode.grid}
		<section class="meta">
			<div class="row"><span>Depth levels</span><span>{volumetricMode.grid.depthCount}</span></div>
			<div class="row"><span>Range</span><span>{volumetricMode.grid.valueMin.toFixed(2)} – {volumetricMode.grid.valueMax.toFixed(2)} {layerEntry?.units ?? ""}</span></div>
		</section>
	{/if}

	<section class="controls">
		<h3>Visualization</h3>

		<label class="field">
			<span>Color scale</span>
			<select bind:value={volumeControls.colormap}>
				{#each colormapNames as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>Opacity <em>{volumeControls.opacity.toFixed(2)}</em></span>
			<input type="range" min="0.05" max="1" step="0.01" bind:value={volumeControls.opacity} />
		</label>

		<label class="field">
			<span>Vertical exaggeration <em>{volumeControls.verticalExaggeration.toFixed(1)}x</em></span>
			<input type="range" min="1" max="8" step="0.5" bind:value={volumeControls.verticalExaggeration} />
		</label>
	</section>
</div>

<style>
	.volume-panel {
		position: fixed;
		top: 1.25rem;
		right: 1.25rem;
		bottom: 3.25rem;
		width: 19rem;
		z-index: 45;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		background: rgba(10, 14, 20, 0.72);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
		color: #e6ecf3;
		font-size: 0.85rem;
		overflow-y: auto;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.65rem;
		color: rgba(230, 236, 243, 0.6);
	}
	h2 {
		margin: 0.15rem 0 0;
		font-size: 1rem;
	}
	.exit {
		align-self: flex-start;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		cursor: pointer;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.65rem 0.75rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
	}
	.meta .row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		color: rgba(230, 236, 243, 0.85);
	}
	.controls h3 {
		margin: 0 0 0.6rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(230, 236, 243, 0.6);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.85rem;
	}
	.field span {
		display: flex;
		justify-content: space-between;
	}
	.field select,
	.field input[type="range"] {
		width: 100%;
	}
</style>
