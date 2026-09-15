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
				>
					<span class="skin-icon" aria-hidden="true">{basemap.icon}</span>
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
		<span aria-hidden="true">{active?.icon ?? "🗺️"}</span>
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

	.toggle-btn {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		cursor: pointer;
		font-size: 1.3rem;
		line-height: 1;
		transition:
			background 200ms ease,
			transform 120ms ease;
	}

	.toggle-btn:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.toggle-btn.open {
		background: rgba(255, 255, 255, 0.18);
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.15) inset;
	}

	.toggle-btn:active {
		transform: scale(0.94);
	}

	.skin-panel {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.4rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		min-width: 140px;
	}

	.skin-option {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.skin-option:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.95);
	}

	.skin-option.active {
		background: rgba(59, 130, 246, 0.25);
		color: #ffffff;
	}

	.skin-icon {
		font-size: 1rem;
		line-height: 1;
		width: 1.2rem;
		text-align: center;
	}
</style>
