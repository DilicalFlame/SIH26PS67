<script lang="ts">
	import type { BasemapConfig } from "$lib/tiles/basemaps";

	interface Props {
		basemaps: BasemapConfig[];
		activeId: string;
		onSelect: (id: string) => void;
	}
	const { basemaps, activeId, onSelect }: Props = $props();

	let open = $state(false);
	const active = $derived(basemaps.find((b) => b.id === activeId) ?? basemaps[0]);

	// Tracks thumbnails that failed to load (bad network, tile server down)
	// so those tiles fall back to a plain color swatch + label instead of a
	// broken-image icon.
	let failedIds = $state(new Set<string>());
	function onThumbError(id: string): void {
		failedIds = new Set(failedIds).add(id);
	}

	function toggle(): void {
		open = !open;
	}

	function pick(id: string): void {
		onSelect(id);
		open = false;
	}
</script>

<svelte:window onclick={() => { if (open) open = false; }} />

<div class="basemap-picker" onclick={(e) => e.stopPropagation()} role="presentation">
	{#if open}
		<div class="skin-panel" role="listbox" aria-label="Basemap style">
			{#each basemaps as basemap (basemap.id)}
				<button
					type="button"
					class="skin-option"
					class:active={basemap.id === activeId}
					role="option"
					aria-selected={basemap.id === activeId}
					onclick={() => pick(basemap.id)}
					title={basemap.label}
				>
					<span class="thumb">
						{#if failedIds.has(basemap.id)}
							<span class="thumb-fallback" aria-hidden="true"></span>
						{:else}
							<img
								src={basemap.thumbnail}
								alt=""
								loading="lazy"
								onerror={() => onThumbError(basemap.id)}
							/>
						{/if}
					</span>
					<span class="skin-label">{basemap.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		class="toggle-btn"
		class:open
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
		title="Basemap style"
	>
		<span class="thumb toggle-thumb">
			{#if active && failedIds.has(active.id)}
				<span class="thumb-fallback" aria-hidden="true"></span>
			{:else}
				<img src={active?.thumbnail} alt="" onerror={() => active && onThumbError(active.id)} />
			{/if}
		</span>
		<span class="toggle-label">{active?.label ?? "Map"}</span>
	</button>
</div>

<style>
	.basemap-picker {
		position: fixed;
		bottom: 3.25rem;
		left: 1.25rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.thumb {
		display: block;
		overflow: hidden;
		background: #1a2530;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
		user-select: none;
	}

	.thumb-fallback {
		display: block;
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #2a3a4a, #1a2530);
	}

	/* Collapsed control: a Google-Maps-style rounded square with the active
	   skin's own tile as the preview, and its label as a small overlay
	   caption along the bottom edge. */
	.toggle-btn {
		position: relative;
		width: 4.25rem;
		height: 4.25rem;
		padding: 0;
		border-radius: 10px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.35);
		border: 2px solid rgba(255, 255, 255, 0.8);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		cursor: pointer;
		transition: transform 120ms ease;
	}

	.toggle-thumb {
		width: 100%;
		height: 100%;
		border-radius: 8px;
	}

	.toggle-btn:hover {
		border-color: #ffffff;
	}

	.toggle-btn.open {
		border-color: #3b82f6;
	}

	.toggle-btn:active {
		transform: scale(0.96);
	}

	.toggle-label {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 0.2rem 0;
		background: rgba(0, 0, 0, 0.55);
		color: #ffffff;
		font-family: inherit;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
	}

	.skin-panel {
		display: flex;
		flex-direction: row;
		gap: 0.6rem;
		padding: 0.6rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
	}

	.skin-option {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 4.25rem;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.skin-option .thumb {
		width: 4.25rem;
		height: 4.25rem;
		border-radius: 8px;
		border: 2px solid rgba(255, 255, 255, 0.15);
		transition: border-color 150ms ease;
	}

	.skin-option:hover .thumb {
		border-color: rgba(255, 255, 255, 0.5);
	}

	.skin-option.active .thumb {
		border-color: #3b82f6;
	}

	.skin-label {
		margin-top: 0.3rem;
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
	}

	.skin-option.active .skin-label {
		color: #ffffff;
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.skin-panel {
			flex-wrap: wrap;
			max-width: 220px;
		}
	}
</style>
