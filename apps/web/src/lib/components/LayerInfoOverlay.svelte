<script lang="ts">
	import type { DataLayerCatalogEntry, LayerSource } from "$lib/tiles/data-layers-catalog";

	interface Props {
		layer: DataLayerCatalogEntry;
		onClose: () => void;
	}
	const { layer, onClose }: Props = $props();

	const SOURCE_LABEL: Record<LayerSource, string> = {
		postgis: "Database",
		api: "Connected API",
		upload: "Uploaded",
	};
</script>

<div class="info-overlay" role="presentation" onclick={onClose}>
	<div
		class="info-dialog"
		role="dialog"
		aria-modal="true"
		aria-label={`${layer.title} — layer information`}
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => {
			if (e.key === "Escape") onClose();
		}}
	>
		<div class="info-header">
			<span class="source-badge">{SOURCE_LABEL[layer.source]}</span>
			<button type="button" class="close-btn" onclick={onClose} aria-label="Close">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<h2>{layer.title}</h2>
		<p class="description">{layer.description}</p>

		<dl class="meta-grid">
			{#if layer.variable}
				<dt>Variable</dt>
				<dd>{layer.variable}</dd>
			{/if}
			{#if layer.units}
				<dt>Units</dt>
				<dd>{layer.units}</dd>
			{/if}
			<dt>Layer ID</dt>
			<dd class="mono">{layer.id}</dd>
			{#if layer.attribution}
				<dt>Attribution</dt>
				<dd>{layer.attribution}</dd>
			{/if}
		</dl>
	</div>
</div>

<style>
	.info-overlay {
		position: fixed;
		inset: 0;
		background: rgba(8, 9, 12, 0.72);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 60;
		padding: 1.5rem;
	}

	.info-dialog {
		width: min(420px, 100%);
		max-height: calc(100dvh - 3rem);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.65),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: #ffffff;
		font-family: inherit;
		padding: 1.4rem;
	}

	.info-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.source-badge {
		padding: 0.15rem 0.5rem;
		background: rgba(59, 130, 246, 0.25);
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(191, 219, 254, 0.95);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		flex-shrink: 0;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}
	.close-btn svg {
		width: 1rem;
		height: 1rem;
	}

	h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}

	.description {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.7);
	}

	.meta-grid {
		margin: 0.2rem 0 0;
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 1rem;
		row-gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.meta-grid dt {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.45);
	}
	.meta-grid dd {
		margin: 0;
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.85);
	}
	.meta-grid dd.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.76rem;
	}
</style>
