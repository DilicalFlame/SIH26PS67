<script lang="ts">
	import type { ActiveLayerState } from "$lib/layers/data-layer-manager";

	interface Props {
		/** Top-of-stack first (see DataLayerManager.emitState) — the row at
		 *  the top of this list is the layer rendered on top. */
		layers: ActiveLayerState[];
		collapsed: boolean;
		onToggleCollapsed: () => void;
		onToggleVisible: (id: string, visible: boolean) => void;
		onSetOpacity: (id: string, opacity: number) => void;
		/** newIndex is a position within DataLayerManager's own bottom-to-top
		 *  array — the caller converts from this panel's top-first display
		 *  order before invoking this. */
		onReorder: (id: string, newIndex: number) => void;
		onRemove: (id: string) => void;
	}
	const {
		layers,
		collapsed,
		onToggleCollapsed,
		onToggleVisible,
		onSetOpacity,
		onReorder,
		onRemove,
	}: Props = $props();

	let expandedIds = $state(new Set<string>());
	function toggleExpanded(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	let draggingId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);

	function handleDragStart(e: DragEvent, id: string): void {
		draggingId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", id);
		}
	}
	function handleDragOver(e: DragEvent, id: string): void {
		e.preventDefault();
		if (id !== draggingId) dragOverId = id;
	}
	function handleDragLeave(id: string): void {
		if (dragOverId === id) dragOverId = null;
	}
	function handleDrop(e: DragEvent, targetId: string): void {
		e.preventDefault();
		if (draggingId && draggingId !== targetId) {
			const displayIndex = layers.findIndex((l) => l.id === targetId);
			if (displayIndex !== -1) {
				// This panel displays top-of-stack first; DataLayerManager's
				// own array (and reorder()'s newIndex) is bottom-to-top.
				onReorder(draggingId, layers.length - 1 - displayIndex);
			}
		}
		draggingId = null;
		dragOverId = null;
	}
	function handleDragEnd(): void {
		draggingId = null;
		dragOverId = null;
	}
</script>

{#if layers.length > 0}
	<div class="active-layers-panel" class:collapsed>
		<button
			type="button"
			class="panel-header"
			onclick={onToggleCollapsed}
			aria-expanded={!collapsed}
		>
			<svg
				class="header-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polygon points="12,3 21,8.5 12,14 3,8.5" />
				<polyline points="3,13.5 12,19 21,13.5" />
			</svg>
			<span class="header-title">Layers ({layers.length})</span>
			<svg
				class="chevron"
				class:rotated={!collapsed}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>

		{#if !collapsed}
			<div class="layer-list">
				{#each layers as layer (layer.id)}
					{@const expanded = expandedIds.has(layer.id)}
					<div
						class="layer-row"
						class:dragging={draggingId === layer.id}
						class:drag-over={dragOverId === layer.id}
						draggable="true"
						role="group"
						ondragstart={(e) => handleDragStart(e, layer.id)}
						ondragover={(e) => handleDragOver(e, layer.id)}
						ondragleave={() => handleDragLeave(layer.id)}
						ondrop={(e) => handleDrop(e, layer.id)}
						ondragend={handleDragEnd}
					>
						<div class="layer-row-main">
							<span class="drag-handle" aria-hidden="true" title="Drag to reorder">
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
									<circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
									<circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
								</svg>
							</span>
							<button
								type="button"
								class="visibility-btn"
								onclick={() => onToggleVisible(layer.id, !layer.visible)}
								aria-pressed={layer.visible}
								aria-label={layer.visible ? `Hide ${layer.title}` : `Show ${layer.title}`}
							>
								{#if layer.visible}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								{:else}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path
											d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.66 3.44M6.5 6.53C3.9 8.24 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 3.87-.72"
										/>
										<path d="M10.58 10.58a3 3 0 1 0 4.24 4.24" />
										<path d="M3 3l18 18" />
									</svg>
								{/if}
							</button>
							<button
								type="button"
								class="layer-title-btn"
								onclick={() => toggleExpanded(layer.id)}
								aria-expanded={expanded}
							>
								<span class="layer-title">{layer.title}</span>
								<svg
									class="chevron"
									class:rotated={expanded}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>
						</div>
						{#if expanded}
							<div class="layer-detail">
								<p class="layer-description">{layer.description}</p>
								{#if layer.attribution}
									<p class="layer-attribution">{layer.attribution}</p>
								{/if}
								<label class="opacity-row">
									<span>Opacity</span>
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										value={layer.opacity}
										oninput={(e) =>
											onSetOpacity(layer.id, parseFloat(e.currentTarget.value))}
										aria-label={`${layer.title} opacity`}
									/>
								</label>
								<button type="button" class="remove-btn" onclick={() => onRemove(layer.id)}>
									Remove
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.active-layers-panel {
		position: fixed;
		top: 1.25rem;
		left: 1.25rem;
		width: 280px;
		max-height: calc(100dvh - 2.5rem);
		display: flex;
		flex-direction: column;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: #ffffff;
		font-family: inherit;
		z-index: 20;
	}

	.active-layers-panel.collapsed {
		width: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.7rem 0.85rem;
		background: transparent;
		border: none;
		color: #ffffff;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}

	.header-icon {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.75);
	}

	.header-title {
		flex: 1;
		font-size: 0.76rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
	}

	.chevron {
		width: 0.9rem;
		height: 0.9rem;
		color: rgba(255, 255, 255, 0.5);
		transition: transform 150ms ease;
		flex-shrink: 0;
	}
	.chevron.rotated {
		transform: rotate(180deg);
	}
	/* Collapsed state points the chevron the other way (panel folds up, so
	   "expand" points down like every other disclosure in this app). */
	.active-layers-panel.collapsed .chevron {
		transform: rotate(-90deg);
	}

	.layer-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0 0.5rem 0.6rem;
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}
	.layer-list::-webkit-scrollbar {
		width: 6px;
	}
	.layer-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.layer-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.layer-row {
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		transition:
			background 150ms ease,
			opacity 150ms ease;
	}
	.layer-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.layer-row.dragging {
		opacity: 0.4;
	}
	.layer-row.drag-over {
		background: rgba(59, 130, 246, 0.25);
	}

	.layer-row-main {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.5rem;
	}

	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		color: rgba(255, 255, 255, 0.35);
		cursor: grab;
		flex-shrink: 0;
	}
	.drag-handle svg {
		width: 1rem;
		height: 1rem;
	}

	.visibility-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		flex-shrink: 0;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.75);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.visibility-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}
	.visibility-btn svg {
		width: 1.05rem;
		height: 1.05rem;
	}

	.layer-title-btn {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: transparent;
		border: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
		padding: 0.1rem 0;
	}

	.layer-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.layer-detail {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 0.55rem 0.6rem 2.35rem;
		font-size: 0.78rem;
	}

	.layer-description {
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.4;
	}

	.layer-attribution {
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.7rem;
	}

	.opacity-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.6);
	}
	.opacity-row input[type="range"] {
		flex: 1;
		height: 4px;
		appearance: none;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}
	.opacity-row input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		background: #ffffff;
		border-radius: 50%;
		transition: transform 100ms ease;
	}
	.opacity-row input[type="range"]::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.remove-btn {
		align-self: flex-start;
		padding: 0.28rem 0.6rem;
		background: rgba(255, 138, 138, 0.12);
		border: none;
		border-radius: 999px;
		color: rgba(255, 138, 138, 0.95);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.remove-btn:hover {
		background: rgba(255, 138, 138, 0.22);
	}
</style>
