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

	// A native <select>'s dropdown list is unstyleable cross-browser (it
	// renders as unthemed browser chrome - a jarring white block over this
	// otherwise all-dark panel). Same custom listbox pattern Toolbar.svelte
	// already uses for its own dropdowns (.tool-dropdown/.dropdown-item).
	let colormapMenuOpen = $state(false);
	function toggleColormapMenu(): void {
		colormapMenuOpen = !colormapMenuOpen;
	}
	function selectColormap(name: string): void {
		volumeControls.colormap = name;
		colormapMenuOpen = false;
	}
	function closeColormapMenu(): void {
		colormapMenuOpen = false;
	}
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

<svelte:window onclick={closeColormapMenu} />

<SidePanel title={shapeLabel} {icon} onClose={onExit} {footer} bodyOverflowVisible>
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

		<div class="field">
			<span class="field-label">Color scale</span>
			<div class="custom-select">
				<button
					type="button"
					class="select-trigger"
					onclick={(e) => {
						e.stopPropagation();
						toggleColormapMenu();
					}}
					aria-haspopup="listbox"
					aria-expanded={colormapMenuOpen}
				>
					<span>{volumeControls.colormap}</span>
					<svg class="caret" class:open={colormapMenuOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
				{#if colormapMenuOpen}
					<ul class="select-options" role="listbox">
						{#each colormapNames as name (name)}
							<li role="presentation">
								<button
									type="button"
									class="select-option"
									class:active={volumeControls.colormap === name}
									onclick={() => selectColormap(name)}
									role="option"
									aria-selected={volumeControls.colormap === name}
								>
									{name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

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
	.field input[type="range"] {
		width: 100%;
	}

	.custom-select {
		position: relative;
	}
	.select-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.7rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.92);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.select-trigger:hover {
		background: rgba(255, 255, 255, 0.09);
	}
	.select-trigger .caret {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.55);
		transition: transform 120ms ease;
	}
	.select-trigger .caret.open {
		transform: rotate(180deg);
	}
	.select-options {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		right: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0.3rem;
		list-style: none;
		max-height: 14rem;
		overflow-y: auto;
		background: rgba(20, 20, 25, 0.97);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	}
	.select-option {
		display: block;
		width: 100%;
		padding: 0.45rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.85);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.select-option:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.select-option.active {
		background: rgba(59, 130, 246, 0.25);
		color: #ffffff;
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
