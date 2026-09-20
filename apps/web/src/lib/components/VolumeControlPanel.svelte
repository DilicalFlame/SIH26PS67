<script lang="ts">
	/**
	 * VolumeControlPanel.svelte
	 *
	 * Right-side floating panel shown only while the "Visualise Data" 3D
	 * popout is active (see volumetric-mode.svelte.ts). Built on SidePanel
	 * (the same shell Toolbar.svelte's "Path / Polygon" panel uses) rather
	 * than a bespoke card - SidePanel's own doc comment already calls this
	 * out as its intended second consumer. Titled with the shape's own
	 * label (e.g. "Polygon 1"), not the layer name - this panel is "the
	 * polygon, and everything about how it's being visualised", not a
	 * layer-properties dialog. Writes into volume-controls.svelte.ts rather
	 * than taking callback props, so VolumetricScene.svelte (the reader)
	 * needs no direct reference to this component.
	 */
	import SidePanel from "$lib/components/SidePanel.svelte";
	import { volumetricMode } from "$lib/state/volumetric-mode.svelte";
	import { volumeControls } from "$lib/state/volume-controls.svelte";
	import { COLORMAPS } from "$lib/render/colormaps";
	import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";

	interface Props {
		shapeLabel: string;
		layerEntry: DataLayerCatalogEntry | undefined;
		onExit: () => void;
	}
	const { shapeLabel, layerEntry, onExit }: Props = $props();

	const colormapNames = Object.keys(COLORMAPS);
</script>

{#snippet icon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M12 3 3 8l9 5 9-5-9-5Z" />
		<path d="M3 16l9 5 9-5" />
		<path d="M3 12l9 5 9-5" />
	</svg>
{/snippet}

{#snippet footer()}
	<button type="button" class="exit-pill" onclick={onExit}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M15 6 9 12l6 6" />
		</svg>
		Exit 3D View
	</button>
{/snippet}

<SidePanel title={shapeLabel} {icon} onClose={onExit} {footer}>
	{#snippet children()}
		{#if volumetricMode.grid}
			<div class="info-row">
				<span class="info-label">{layerEntry?.title ?? "Data layer"}</span>
				<span class="info-value">{volumetricMode.grid.depthCount} depth levels</span>
			</div>
			<div class="info-row">
				<span class="info-label">Range</span>
				<span class="info-value">
					{volumetricMode.grid.valueMin.toFixed(2)} – {volumetricMode.grid.valueMax.toFixed(2)}
					{layerEntry?.units ?? ""}
				</span>
			</div>
			<div class="divider"></div>
		{/if}

		<h3 class="section-heading">Visualization</h3>

		<label class="field">
			<span class="field-label">Color scale</span>
			<select bind:value={volumeControls.colormap}>
				{#each colormapNames as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span class="field-label">Opacity <em>{volumeControls.opacity.toFixed(2)}</em></span>
			<input type="range" min="0.05" max="1" step="0.01" bind:value={volumeControls.opacity} />
		</label>

		<label class="field">
			<span class="field-label">
				Vertical exaggeration <em>{volumeControls.verticalExaggeration.toFixed(1)}x</em>
			</span>
			<input type="range" min="1" max="60" step="1" bind:value={volumeControls.verticalExaggeration} />
		</label>
	{/snippet}
</SidePanel>

<style>
	.info-row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.info-label {
		color: rgba(255, 255, 255, 0.6);
	}
	.info-value {
		color: rgba(255, 255, 255, 0.92);
		text-align: right;
	}
	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 0.15rem 0 0.3rem;
	}
	.section-heading {
		margin: 0 0 0.2rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.55);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field-label {
		display: flex;
		justify-content: space-between;
		color: rgba(255, 255, 255, 0.85);
	}
	.field-label em {
		font-style: normal;
		color: rgba(255, 255, 255, 0.55);
	}
	.field select,
	.field input[type="range"] {
		width: 100%;
	}
	.field select {
		padding: 0.4rem 0.5rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
		font: inherit;
	}

	.exit-pill {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.7rem 1rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.85);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.exit-pill:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #ffffff;
	}
	.exit-pill svg {
		width: 1rem;
		height: 1rem;
	}
</style>
