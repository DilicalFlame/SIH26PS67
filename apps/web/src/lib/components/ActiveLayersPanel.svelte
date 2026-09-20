<script lang="ts">
	import type { ActiveLayerState } from "$lib/layers/data-layer-manager";
	import { isTimeCapable, resolveIsoTimeForEntry, type TimeCapableLayerEntry } from "$lib/tiles/data-layers-catalog";
	import { findLayerEntry } from "$lib/tiles/data-layer-registry.svelte";
	import { hoverPointState } from "$lib/state/hover-point.svelte";
	import { fetchFeatureInfo } from "$lib/copernicus/copernicus-feature-info";
	import { fetchLegend } from "$lib/copernicus/copernicus-legend";
	import { formatMeasurement } from "$lib/format/value-format";
	import ContextMenu, { type ContextMenuItem } from "$lib/components/ContextMenu.svelte";
	import LayerInfoOverlay from "$lib/components/LayerInfoOverlay.svelte";
	import LayerColorbar from "$lib/components/LayerColorbar.svelte";
	import TimeSlider from "$lib/components/analysis/TimeSlider.svelte";

	interface Props {
		/** Top-of-stack first (see DataLayerManager.emitState) - the row at
		 *  the top of this list is the layer rendered on top. */
		layers: ActiveLayerState[];
		collapsed: boolean;
		onToggleCollapsed: () => void;
		/** Opens the same <DataLayersCatalog> picker the old Toolbar "Layers"
		 *  button used to (see +page.svelte/CesiumCanvas.svelte) - this panel
		 *  is now the one place that button lives, always visible in the
		 *  header regardless of collapsed state. */
		onAddLayer: () => void;
		onToggleVisible: (id: string, visible: boolean) => void;
		/** newIndex is a position within DataLayerManager's own bottom-to-top
		 *  array - the caller converts from this panel's top-first display
		 *  order before invoking this. */
		onReorder: (id: string, newIndex: number) => void;
		onRemove: (id: string) => void;
		/** Flies the camera to the layer's own coverage (its real bbox for a
		 *  regional live-search layer, whole-earth for a curated global one). */
		onZoomTo: (id: string) => void;
		/** One shared slider for every active time-capable layer, not
		 *  per-layer - see DataLayerManager.setGlobalTime. */
		layerTimeIso: string;
		onLayerTimeChange: (isoDate: string) => void;
		/** True while the "Visualise Data" 3D popout is active - the basemap/
		 *  imagery layers this panel manages aren't rendered in that mode
		 *  (see CesiumCanvas's enterVolumeView), so its "add layer"/opacity/
		 *  reorder affordances have nothing to act on. */
		hidden?: boolean;
	}
	const {
		layers,
		collapsed,
		onToggleCollapsed,
		onAddLayer,
		onToggleVisible,
		onReorder,
		onRemove,
		onZoomTo,
		layerTimeIso,
		onLayerTimeChange,
		hidden = false,
	}: Props = $props();

	// The bounds shown are whichever active layer declares them first - a
	// second time-capable layer with different bounds (e.g. the forecast's
	// shorter window) just gets its own values clamped into by the caller
	// (CesiumCanvas.setGlobalTime doesn't clamp; a per-layer TIME outside its
	// own range would 400 - out of scope for this shared control today,
	// since both current catalog entries' windows overlap heavily).
	const timeCapableEntry = $derived(layers.map((l) => findLayerEntry(l.id)).find(isTimeCapable));

	// Per-point hover sampling - while the cursor is over the globe, each
	// visible layer's row shows the real value at that point instead of its
	// title (see the template's layer-title-btn). Debounced on settle (not
	// throttled during movement) and cancelled on every new position: a
	// GetFeatureInfo per visible layer per settled point is a fair budget,
	// the same request shape every mouse-move firing one would not be.
	//
	// This can never be as fast as the cursor itself: each value is a live
	// network round trip to Copernicus (~150-400ms measured), and that floor
	// doesn't move regardless of debounce length - the debounce only decides
	// how long after the cursor *stops* that round trip starts. 80ms (down
	// from an earlier 200ms) trims perceived latency without meaningfully
	// raising request volume, since a fast-moving cursor still never
	// triggers a request until it actually settles. The last resolved value
	// stays on screen while a new one is in flight (hoverValues is only ever
	// cleared when the cursor leaves the globe entirely, never mid-sample),
	// so a settle-then-wait never reads as "blank" - just as "still this
	// value, for a moment longer."
	const HOVER_DEBOUNCE_MS = 80;
	let hoverValues = $state<Record<string, number | null>>({});
	let hoverSampleTimer: ReturnType<typeof setTimeout> | undefined;
	let hoverSampleAbort: AbortController | null = null;

	$effect(() => {
		const point = hoverPointState.point;
		// Re-run (and re-sample) on a visibility or time change too, not just
		// a cursor move - otherwise the badge would show a value sampled at
		// a since-hidden layer, or at a date the map no longer displays.
		const visibleIds = layers.filter((l) => l.visible).map((l) => l.id);
		const sharedIsoTime = layerTimeIso;

		clearTimeout(hoverSampleTimer);
		hoverSampleAbort?.abort();

		if (!point) {
			hoverValues = {};
			return;
		}

		hoverSampleTimer = setTimeout(() => {
			const controller = new AbortController();
			hoverSampleAbort = controller;
			for (const id of visibleIds) {
				const entry = findLayerEntry(id);
				if (!entry?.wmts) continue;
				// A layer with no time dimension at all has nothing to clamp
				// against - sharedIsoTime passes through unchanged, same as
				// before isTimeCapable/resolveIsoTimeForEntry existed.
				const isoTime = isTimeCapable(entry) ? resolveIsoTimeForEntry(sharedIsoTime, entry) : sharedIsoTime;
				fetchFeatureInfo(
					entry.wmts,
					point.lon,
					point.lat,
					isoTime,
					entry.wmts.defaultElevation || undefined,
					controller.signal,
				)
					.then((value) => {
						if (controller.signal.aborted) return;
						hoverValues = { ...hoverValues, [id]: value };
					})
					.catch(() => {
						// Transport failure - copernicus-feature-info.ts's own
						// contract is to throw only on that (null means genuine
						// no-data, a real, already-handled response shape).
						// Leave whatever was last shown rather than blanking it.
					});
			}
		}, HOVER_DEBOUNCE_MS);

		return () => clearTimeout(hoverSampleTimer);
	});

	// Units for the hover badge above - a curated entry already has `units`
	// (e.g. "°C"), but a dynamically-added (live-search) layer never does
	// (wmts-catalog-client.ts's copernicusWmtsLayerToEntry has no server-side
	// units source to set it from). Falls back to the live GetLegend fetch's
	// own units string, the same source LayerColorbar's label already uses -
	// fetched once per layer (fetchLegend is itself memoized per layer+style,
	// so this is a cache hit whenever that layer's colorbar has been opened)
	// and independent of hover timing, since units don't change per sample.
	let legendUnitsFallback = $state<Record<string, string>>({});
	$effect(() => {
		for (const layer of layers) {
			if (legendUnitsFallback[layer.id] !== undefined) continue;
			const entry = findLayerEntry(layer.id);
			if (!entry?.wmts || entry.units) continue;
			fetchLegend(entry.wmts).then((legend) => {
				if (legend?.units) legendUnitsFallback = { ...legendUnitsFallback, [layer.id]: legend.units };
			});
		}
	});
	function unitsFor(id: string): string | undefined {
		return findLayerEntry(id)?.units ?? legendUnitsFallback[id];
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

	// Per-row accordion - toggled by clicking the title area (not the drag
	// handle or the visibility button, both siblings with their own
	// onclick), revealing a colour-scale legend for that layer below its row.
	let expandedIds = $state(new Set<string>());
	function toggleExpanded(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	// Right-click context menu (Info / Delete) - replaces the old
	// click-to-expand row, which held an opacity slider, description, and a
	// Remove button all at once. Hovering a (now single-line, possibly
	// truncated) row title shows the full name instead - see .row-tooltip.
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
			{ id: "zoom", label: "Zoom to", icon: "compass", onSelect: () => onZoomTo(id) },
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
	const infoEntry = $derived(infoLayerId ? (findLayerEntry(infoLayerId) ?? null) : null);

	// Tooltip is `position: fixed` and positioned from the hovered row's own
	// rect (not plain CSS :hover + absolute) because it needs to escape
	// .layer-list's `overflow-y: auto` - an element can't overflow visibly
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

	// Same reasoning as hoveredRow above - LayerColorbar reports hover info
	// via callback instead of rendering its own tooltip, specifically so it
	// can be positioned here as a `position: fixed` sibling of the whole
	// panel, not a descendant of .layer-list's scrolling box.
	let colorbarHover = $state<{ label: string; top: number; left: number } | null>(null);
	function handleColorbarHover(info: { label: string; x: number; y: number } | null): void {
		colorbarHover = info ? { label: info.label, top: info.y, left: info.x } : null;
	}
</script>

{#snippet layersIcon()}
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
{/snippet}

<!-- Always rendered, even with zero active layers - this is now the only
     way to open <DataLayersCatalog> (see onAddLayer's doc comment above),
     so it can't disappear the moment the last layer is removed the way the
     old `{#if layers.length > 0}` gate would have left it. -->
<div class="active-layers-panel" class:collapsed class:hidden>
	<div class="panel-header-row">
		<button type="button" class="panel-toggle" onclick={onToggleCollapsed} aria-expanded={!collapsed}>
			{@render layersIcon()}
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
		<button type="button" class="add-layer-btn" onclick={onAddLayer}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 5v14M5 12h14" />
			</svg>
			Add Layer
		</button>
	</div>

		{#if !collapsed}
			<div class="layer-list">
				{#each layers as layer (layer.id)}
					{@const entry = findLayerEntry(layer.id)}
					{@const expanded = expandedIds.has(layer.id)}
					<div class="layer-item">
						<div
							class="layer-row"
							class:dragging={draggingId === layer.id}
							class:drag-over={dragOverId === layer.id}
							role="group"
							ondragover={(e) => handleDragOver(e, layer.id)}
							ondragleave={() => handleDragLeave(layer.id)}
							ondrop={(e) => handleDrop(e, layer.id)}
							oncontextmenu={(e) => openContextMenu(e, layer.id)}
							onmouseenter={(e) => showTooltip(e, layer.title)}
							onmouseleave={hideTooltip}
						>
							<span
								class="drag-handle"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, layer.id)}
								ondragend={handleDragEnd}
								role="button"
								tabindex="-1"
								aria-label="Drag to reorder"
								title="Drag to reorder"
							>
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
								<span class="layer-title-stack">
									<span class="layer-title">{layer.title}</span>
									{#if hoverPointState.point && layer.visible && hoverValues[layer.id] !== undefined}
										{@const value = hoverValues[layer.id]}
										{@const unit = unitsFor(layer.id)}
										<span class="layer-value-row">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M3 12h4l2 7 4-14 2 7h6" />
											</svg>
											{value === null ? "No data" : `${formatMeasurement(value)}${unit ? ` ${unit}` : ""}`}
										</span>
									{/if}
								</span>
								<svg
									class="row-chevron"
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
								<LayerColorbar
									wmts={entry?.wmts}
									valueMin={entry?.valueMin}
									valueMax={entry?.valueMax}
									units={entry?.units}
									onHoverChange={handleColorbarHover}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if timeCapableEntry}
				<div class="time-slider-row">
					<TimeSlider
						timeStart={"timeStart" in timeCapableEntry ? timeCapableEntry.timeStart : undefined}
						timeEnd={"timeStart" in timeCapableEntry ? timeCapableEntry.timeEnd : undefined}
						timeStepSeconds={"timeStart" in timeCapableEntry ? timeCapableEntry.timeStepSeconds : undefined}
						values={"timeValues" in timeCapableEntry ? timeCapableEntry.timeValues : undefined}
						value={layerTimeIso}
						onChange={onLayerTimeChange}
					/>
				</div>
			{/if}
		{/if}
	</div>

{#if hoveredRow}
	<div class="row-tooltip" role="tooltip" style:top="{hoveredRow.top}px" style:left="{hoveredRow.left}px">
		{hoveredRow.title}
	</div>
{/if}

{#if colorbarHover}
	<div
		class="colorbar-tooltip"
		role="tooltip"
		style:top="{colorbarHover.top}px"
		style:left="{colorbarHover.left}px"
	>
		{colorbarHover.label}
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
	.active-layers-panel.hidden {
		display: none;
	}
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

	/* Deliberately no width override here anymore - the panel stays 280px
	   whether collapsed or not (the user's own ask), so the header row
	   (title toggle + "Add Layer") doesn't jump width when it's the only
	   thing showing. */

	.panel-header-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 0.6rem 0.6rem 0.85rem;
	}

	.panel-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		padding: 0.1rem 0;
		background: transparent;
		border: none;
		color: #ffffff;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}

	.add-layer-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		padding: 0.4rem 0.7rem;
		background: rgba(59, 130, 246, 0.5);
		border: none;
		border-radius: 999px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.add-layer-btn:hover {
		background: rgba(59, 130, 246, 0.7);
	}
	.add-layer-btn svg {
		width: 0.9rem;
		height: 0.9rem;
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

	.layer-item {
		display: flex;
		flex-direction: column;
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

	.layer-detail {
		padding: 0.1rem 0.5rem 0.5rem 2.4rem;
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
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		padding: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.layer-title-stack {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.layer-title {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* A live sample at the cursor's position on the globe, shown below the
	   title rather than replacing it (see the hover-sampling $effect) - the
	   name stays put, so a data value appearing/disappearing as the cursor
	   moves on/off the globe never makes the row's own identity flicker.
	   Tabular numerals so the row doesn't visibly reflow digit-by-digit as
	   the value updates while the mouse moves. */
	.layer-value-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.74rem;
		color: rgba(191, 219, 254, 0.95);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.layer-value-row svg {
		width: 0.75rem;
		height: 0.75rem;
		flex-shrink: 0;
		color: rgba(191, 219, 254, 0.75);
	}

	.row-chevron {
		width: 0.8rem;
		height: 0.8rem;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.4);
		transition: transform 150ms ease;
	}
	.row-chevron.rotated {
		transform: rotate(180deg);
	}

	/* Custom tooltip (not the native `title` attribute) to match this app's
	   own bespoke tooltip look elsewhere (see Toolbar's .tool-tooltip).
	   `position: fixed` and positioned in JS (see showTooltip) rather than
	   CSS `:hover` + `position: absolute` anchored to the row, because it
	   needs to escape .layer-list's `overflow-y: auto` clipping - a
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

	/* Same fixed-and-lifted-out-of-the-scroll-box reasoning as .row-tooltip
	   above - see LayerColorbar's ColorbarHoverInfo doc comment for why this
	   used to live inside LayerColorbar itself and force a horizontal
	   scrollbar on .layer-list. Positioned above the cursor (colorbarHover.top
	   is the track's own top edge, not the cursor Y) rather than beside it,
	   since the track is a thin horizontal strip, not a row. */
	.colorbar-tooltip {
		position: fixed;
		z-index: 25;
		transform: translate(-50%, -100%) translateY(-8px);
		background: rgba(10, 10, 12, 0.96);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #ffffff;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		padding: 0.2rem 0.5rem;
		border-radius: 5px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}
</style>
