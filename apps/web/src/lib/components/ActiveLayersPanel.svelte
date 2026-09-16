<script lang="ts">
	import type { ActiveLayerState } from "$lib/layers/data-layer-manager";
	import { DATA_LAYERS } from "$lib/tiles/data-layers-catalog";
	import ContextMenu, { type ContextMenuItem } from "$lib/components/ContextMenu.svelte";
	import LayerInfoOverlay from "$lib/components/LayerInfoOverlay.svelte";
	import TimeSlider from "$lib/components/analysis/TimeSlider.svelte";

	interface Props {
		/** Top-of-stack first (see DataLayerManager.emitState) — the row at
		 *  the top of this list is the layer rendered on top. */
		layers: ActiveLayerState[];
		collapsed: boolean;
		onToggleCollapsed: () => void;
		onToggleVisible: (id: string, visible: boolean) => void;
		/** newIndex is a position within DataLayerManager's own bottom-to-top
		 *  array — the caller converts from this panel's top-first display
		 *  order before invoking this. */
		onReorder: (id: string, newIndex: number) => void;
		onRemove: (id: string) => void;
		/** One shared slider for every active time-capable layer, not
		 *  per-layer — see DataLayerManager.setGlobalTime. */
		layerTimeIso: string;
		onLayerTimeChange: (isoDate: string) => void;
	}
	const {
		layers,
		collapsed,
		onToggleCollapsed,
		onToggleVisible,
		onReorder,
		onRemove,
		layerTimeIso,
		onLayerTimeChange,
	}: Props = $props();

	// The bounds shown are whichever active layer declares them first — a
	// second time-capable layer with different bounds (e.g. the forecast's
	// shorter window) just gets its own values clamped into by the caller
	// (CesiumCanvas.setGlobalTime doesn't clamp; a per-layer TIME outside its
	// own range would 400 — out of scope for this shared control today,
	// since both current catalog entries' windows overlap heavily).
	const timeCapableEntry = $derived(
		layers
			.map((l) => DATA_LAYERS.find((d) => d.id === l.id))
			.find((entry) => entry?.timeStart),
	);

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

	// Right-click context menu (Info / Delete) — replaces the old
	// click-to-expand row, which held an opacity slider, description, and a
	// Remove button all at once. Hovering a (now single-line, possibly
	// truncated) row title shows the full name instead — see .row-tooltip.
	let contextMenuLayerId = $state<string | null>(null);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);

	function openContextMenu(e: MouseEvent, id: string): void {
		e.preventDefault();
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		contextMenuLayerId = id;
	}
	function closeContextMenu(): void {
		contextMenuLayerId = null;
	}

	function menuItemsFor(id: string): ContextMenuItem[] {
		return [
			{ id: "info", label: "Information", icon: "info", onSelect: () => (infoLayerId = id) },
			{
				id: "delete",
				label: "Delete",
				icon: "delete",
				danger: true,
				onSelect: () => onRemove(id),
			},
		];
	}

	let infoLayerId = $state<string | null>(null);
	const infoEntry = $derived(
		infoLayerId ? (DATA_LAYERS.find((d) => d.id === infoLayerId) ?? null) : null,
	);

	// Tooltip is `position: fixed` and positioned from the hovered row's own
	// rect (not plain CSS :hover + absolute) because it needs to escape
	// .layer-list's `overflow-y: auto` — an element can't overflow visibly
	// past an ancestor with overflow:auto on the *other* axis either (a
	// non-"visible" overflow-y forces overflow-x to clip too), so a
	// CSS-only tooltip anchored inside a scrolling row would get clipped
	// at the list's right edge instead of floating beside the panel.
	let hoveredRow = $state<{ title: string; top: number; left: number } | null>(null);
	function showTooltip(e: MouseEvent, title: string): void {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		hoveredRow = { title, top: rect.top + rect.height / 2, left: rect.right + 10 };
	}
	function hideTooltip(): void {
		hoveredRow = null;
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
						oncontextmenu={(e) => openContextMenu(e, layer.id)}
						onmouseenter={(e) => showTooltip(e, layer.title)}
						onmouseleave={hideTooltip}
					>
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
						<span class="layer-title">{layer.title}</span>
					</div>
				{/each}
			</div>
			{#if timeCapableEntry}
				<div class="time-slider-row">
					<TimeSlider
						timeStart={timeCapableEntry.timeStart}
						timeEnd={timeCapableEntry.timeEnd}
						timeStepSeconds={timeCapableEntry.timeStepSeconds}
						value={layerTimeIso}
						onChange={onLayerTimeChange}
					/>
				</div>
			{/if}
		{/if}
	</div>
{/if}

{#if hoveredRow}
	<div class="row-tooltip" role="tooltip" style:top="{hoveredRow.top}px" style:left="{hoveredRow.left}px">
		{hoveredRow.title}
	</div>
{/if}

{#if contextMenuLayerId}
	<ContextMenu
		x={contextMenuX}
		y={contextMenuY}
		items={menuItemsFor(contextMenuLayerId)}
		onClose={closeContextMenu}
	/>
{/if}

{#if infoEntry}
	<LayerInfoOverlay layer={infoEntry} onClose={() => (infoLayerId = null)} />
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

	.time-slider-row {
		flex: 0 0 auto;
		padding: 0.6rem 0.85rem 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
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
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.5rem;
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

	.layer-title {
		display: block;
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Custom tooltip (not the native `title` attribute) to match this app's
	   own bespoke tooltip look elsewhere (see Toolbar's .tool-tooltip).
	   `position: fixed` and positioned in JS (see showTooltip) rather than
	   CSS `:hover` + `position: absolute` anchored to the row, because it
	   needs to escape .layer-list's `overflow-y: auto` clipping — a
	   non-"visible" overflow on one axis clips the other axis too, so an
	   absolutely-positioned tooltip anchored inside a scrolling row would
	   get cut off at the list's edge instead of floating beside the panel. */
	.row-tooltip {
		position: fixed;
		z-index: 25;
		transform: translateY(-50%);
		background: rgba(20, 20, 25, 0.96);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #ffffff;
		font-size: 0.76rem;
		white-space: nowrap;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}
</style>
