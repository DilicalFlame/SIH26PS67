<script lang="ts">
	import type { BasemapConfig } from "$lib/tiles/basemaps";
	import { ProjectionType, PROJECTIONS } from "$lib/types/projection";

	interface Props {
		basemaps: BasemapConfig[];
		activeId: string;
		onSelect: (id: string) => void;
		currentProjection: ProjectionType;
		onProjectionChange: (p: ProjectionType) => void;
		graticuleOn: boolean;
		onGraticuleToggle: () => void;
	}
	const {
		basemaps,
		activeId,
		onSelect,
		currentProjection,
		onProjectionChange,
		graticuleOn,
		onGraticuleToggle,
	}: Props = $props();

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
		<div class="panel">
			<!-- View controls: projection morph + graticule, grouped above the
			     basemap skins since both are "how the map looks" settings, same
			     as the skins below. Previously two separate floating controls
			     (a bottom-center pill bar and a bottom-right button) — folded in
			     here so there's one control cluster instead of three. -->
			<div class="view-section">
				<div class="segmented" role="group" aria-label="Map projection">
					{#each PROJECTIONS as proj (proj.type)}
						<button
							type="button"
							class="segment"
							class:active={currentProjection === proj.type}
							aria-pressed={currentProjection === proj.type}
							onclick={() => onProjectionChange(proj.type)}
							title={proj.description}
						>
							{proj.label}
						</button>
					{/each}
				</div>

				<button
					type="button"
					class="grid-row"
					class:active={graticuleOn}
					aria-pressed={graticuleOn}
					onclick={onGraticuleToggle}
				>
					<span class="grid-icon" aria-hidden="true">⌗</span>
					<span class="grid-row-label">Grid</span>
					<span class="grid-row-state">{graticuleOn ? "On" : "Off"}</span>
				</button>
			</div>

			<div class="divider"></div>

			<div class="skin-list" role="listbox" aria-label="Basemap style">
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
		</div>
	{/if}

	<button
		type="button"
		class="toggle-btn"
		class:open
		onclick={toggle}
		aria-haspopup="listbox"
		aria-expanded={open}
		title="Map style and view settings"
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

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		max-height: 80vh;
		overflow-y: auto;
		width: 9.2rem;
	}

	.view-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.segmented {
		display: flex;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 0.15rem;
		gap: 0.15rem;
	}

	.segment {
		flex: 1;
		padding: 0.35rem 0;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.6);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.segment:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.segment.active {
		background: rgba(59, 130, 246, 0.35);
		color: #ffffff;
		font-weight: 600;
	}

	.grid-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition: background 150ms ease;
	}

	.grid-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.grid-row.active {
		background: rgba(59, 130, 246, 0.15);
	}

	.grid-icon {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1;
	}

	.grid-row.active .grid-icon {
		color: #ffffff;
	}

	.grid-row-label {
		flex: 1;
		text-align: left;
		font-size: 0.78rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
	}

	.grid-row.active .grid-row-label {
		color: #ffffff;
		font-weight: 600;
	}

	.grid-row-state {
		font-size: 0.66rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: rgba(255, 255, 255, 0.4);
	}

	.grid-row.active .grid-row-state {
		color: #7fb0ff;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0 0.1rem;
	}

	.skin-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.skin-option {
		position: relative;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.3rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition: background 150ms ease;
	}

	.skin-option:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.skin-option.active {
		background: rgba(59, 130, 246, 0.15);
	}

	.skin-option .thumb {
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 7px;
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
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
	}

	.skin-option.active .skin-label {
		color: #ffffff;
		font-weight: 600;
	}
</style>
