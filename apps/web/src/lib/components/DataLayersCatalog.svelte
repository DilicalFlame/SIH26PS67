<script lang="ts">
	import { DATA_LAYERS, type LayerSource } from "$lib/tiles/data-layers-catalog";

	interface Props {
		open: boolean;
		activeIds: Set<string>;
		onAdd: (id: string) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}
	const { open, activeIds, onAdd, onRemove, onClose }: Props = $props();

	let query = $state("");

	const filtered = $derived(
		DATA_LAYERS.filter((entry) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return (
				entry.title.toLowerCase().includes(q) ||
				entry.description.toLowerCase().includes(q) ||
				(entry.variable?.toLowerCase().includes(q) ?? false)
			);
		}),
	);

	const SOURCE_LABEL: Record<LayerSource, string> = {
		postgis: "Database",
		api: "Connected API",
		upload: "Uploaded",
	};

	function handleCardAction(id: string): void {
		if (activeIds.has(id)) onRemove(id);
		else onAdd(id);
	}
</script>

{#if open}
	<div class="catalog-overlay" role="presentation" onclick={onClose}>
		<div
			class="catalog-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Data layers"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') onClose();
			}}
		>
			<div class="catalog-header">
				<div class="catalog-heading">
					<h2>Data layers</h2>
					<p>Choose data layers to add to the map.</p>
				</div>
				<label class="search-box">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4.35-4.35" />
					</svg>
					<input type="text" placeholder="Search all layers" bind:value={query} />
				</label>
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

			<div class="catalog-body">
				{#if filtered.length === 0}
					<p class="empty-state">No layers match "{query}".</p>
				{:else}
					<div class="card-grid">
						{#each filtered as entry (entry.id)}
							{@const active = activeIds.has(entry.id)}
							<div class="layer-card">
								<div class="card-thumb" aria-hidden="true">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M12 3v18M3 12h18" />
										<circle cx="12" cy="12" r="9" />
									</svg>
								</div>
								<div class="card-body">
									<span class="source-badge">{SOURCE_LABEL[entry.source]}</span>
									<h3>{entry.title}</h3>
									<p>{entry.description}</p>
									{#if entry.attribution}
										<p class="card-attribution">{entry.attribution}</p>
									{/if}
									<button
										type="button"
										class="add-btn"
										class:added={active}
										onclick={() => handleCardAction(entry.id)}
									>
										{active ? "Added" : "Add"}
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.catalog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(8, 9, 12, 0.72);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 40;
		padding: 2rem 1.25rem;
	}

	.catalog-modal {
		width: min(920px, 100%);
		max-height: calc(100dvh - 4rem);
		display: flex;
		flex-direction: column;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.65),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: #ffffff;
		font-family: inherit;
		overflow: hidden;
	}

	.catalog-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 0 0 auto;
		padding: 1.4rem 1.6rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.catalog-heading h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}
	.catalog-heading p {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.search-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
	}
	.search-box svg {
		width: 1rem;
		height: 1rem;
		color: rgba(255, 255, 255, 0.45);
		flex-shrink: 0;
	}
	.search-box input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.85rem;
	}
	.search-box input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.1rem;
		height: 2.1rem;
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
		width: 1.1rem;
		height: 1.1rem;
	}

	.catalog-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 1.4rem 1.6rem 1.8rem;
	}

	.empty-state {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}

	.layer-card {
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
	}

	.card-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 90px;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(20, 20, 25, 0.4));
		color: rgba(255, 255, 255, 0.5);
	}
	.card-thumb svg {
		width: 2rem;
		height: 2rem;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem;
	}

	.source-badge {
		align-self: flex-start;
		padding: 0.15rem 0.5rem;
		background: rgba(59, 130, 246, 0.25);
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(191, 219, 254, 0.95);
	}

	.card-body h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.card-body p {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.6);
	}
	.card-attribution {
		color: rgba(255, 255, 255, 0.4) !important;
		font-size: 0.7rem !important;
	}

	.add-btn {
		align-self: flex-start;
		margin-top: 0.4rem;
		padding: 0.35rem 0.9rem;
		background: rgba(59, 130, 246, 0.5);
		border: none;
		border-radius: 999px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.add-btn:hover {
		background: rgba(59, 130, 246, 0.7);
	}
	.add-btn.added {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}
	.add-btn.added:hover {
		background: rgba(255, 138, 138, 0.22);
		color: rgba(255, 138, 138, 0.95);
	}
</style>
