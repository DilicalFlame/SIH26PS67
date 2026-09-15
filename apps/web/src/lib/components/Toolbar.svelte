<script lang="ts">
	import type { MeasureState } from "$lib/measure/path-measure-tool";
	import SidePanel from "$lib/components/SidePanel.svelte";

	interface Props {
		measureState: MeasureState;
		onTogglePathTool: () => void;
		onFinish: () => void;
		onClose: () => void;
		onUndo: () => void;
		onClearAll: () => void;
		onRemoveMeasurement: (id: string) => void;
		onZoomToMeasurement: (id: string) => void;
		onHighlightMeasurement: (id: string, highlighted: boolean) => void;
		layersOpen: boolean;
		onToggleLayers: () => void;
	}
	const {
		measureState,
		onTogglePathTool,
		onFinish,
		onClose,
		onUndo,
		onClearAll,
		onRemoveMeasurement,
		onZoomToMeasurement,
		onHighlightMeasurement,
		layersOpen,
		onToggleLayers,
	}: Props = $props();

	// "Advanced measurements" is a static disclosure for now — real content
	// (segment breakdown, coordinates, etc.) is future scope; this just
	// matches the reference panel's layout so it's a non-event to add later.
	let advancedOpen = $state(false);

	// Which finished-measurement rows are expanded — a plain Set so any
	// number of rows can be open at once (the list scrolls internally, see
	// .measurements-list, so there's no reason to force a single-open
	// accordion here).
	let expandedIds = $state(new Set<string>());
	function toggleExpanded(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}
</script>

<div class="toolbar-stack">
	<nav class="top-bar" aria-label="Map tools">
		<div class="tool-cluster">
			<button
				type="button"
				class="tool-btn"
				class:active={measureState.active}
				onclick={onTogglePathTool}
				aria-pressed={measureState.active}
			>
				<svg
					class="tool-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 17 L10 8 L14 14 L19 6" />
					<circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none" />
					<circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none" />
					<circle cx="14" cy="14" r="1.6" fill="currentColor" stroke="none" />
					<circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
				</svg>
				<span class="tool-tooltip">Add path or polygon</span>
			</button>

			<div class="tool-divider"></div>

			<button
				type="button"
				class="tool-btn"
				class:active={layersOpen}
				onclick={onToggleLayers}
				aria-pressed={layersOpen}
			>
				<svg
					class="tool-icon"
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
				<span class="tool-tooltip">Layers</span>
			</button>
		</div>
	</nav>
</div>

{#if measureState.active}
	<SidePanel
		title="Path or polygon"
		onHelp={() => {}}
		onUndo={measureState.drawing ? onUndo : undefined}
		{onClose}
	>
		{#snippet icon()}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 17 L10 8 L14 14 L19 6" />
				<circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none" />
				<circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none" />
				<circle cx="14" cy="14" r="1.6" fill="currentColor" stroke="none" />
				<circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
			</svg>
		{/snippet}

		{#snippet children()}
			<div class="panel-draw-section">
				{#if !measureState.drawing}
					<p class="hint">Click points on the map to draw a path or polygon</p>
				{:else if measureState.closed}
					<div class="field-row">
						<span class="field-label">Area</span>
						<span class="field-value">{measureState.area}</span>
					</div>
					<div class="field-row">
						<span class="field-label">Perimeter</span>
						<span class="field-value">{measureState.perimeter}</span>
					</div>
				{:else}
					<div class="field-row">
						<span class="field-label">Length</span>
						<span class="field-value">
							{measureState.length}
							<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M6 9l6 6 6-6" />
							</svg>
						</span>
					</div>
					<div class="field-row">
						<span class="field-label">Heading</span>
						<span class="field-value">{measureState.heading}</span>
					</div>
				{/if}

				{#if measureState.drawing}
					<div class="panel-divider"></div>
					<button
						type="button"
						class="advanced-row"
						onclick={() => (advancedOpen = !advancedOpen)}
						aria-expanded={advancedOpen}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 11v5M12 8v.01" />
						</svg>
						<span>Advanced measurements</span>
						<svg class="chevron" class:rotated={advancedOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M6 9l6 6 6-6" />
						</svg>
					</button>
					{#if advancedOpen}
						<div class="field-row advanced-detail">
							<span class="field-label">Points</span>
							<span class="field-value">{measureState.vertexCount}</span>
						</div>
					{/if}
				{/if}
			</div>

			{#if measureState.finished.length > 0}
				<div class="panel-divider"></div>
				<div class="measurements-section">
					<div class="measurements-header">
						<span>Measurements ({measureState.finished.length})</span>
						<button
							type="button"
							class="measurements-clear-btn"
							onclick={onClearAll}
							title="Clear all measurements"
							aria-label="Clear all measurements"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M4 7h16" />
								<path d="M9 7V4h6v3" />
								<path d="M6 7l1 13h10l1-13" />
							</svg>
						</button>
					</div>

					<div class="measurements-list">
						{#each measureState.finished as m (m.id)}
							{@const expanded = expandedIds.has(m.id)}
							<div
								class="measurement-row"
								role="group"
								onmouseenter={() => onHighlightMeasurement(m.id, true)}
								onmouseleave={() => onHighlightMeasurement(m.id, false)}
							>
								<button
									type="button"
									class="measurement-row-main"
									onclick={() => toggleExpanded(m.id)}
									aria-expanded={expanded}
								>
									<svg class="measurement-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										{#if m.type === "path"}
											<path d="M5 17 L10 8 L14 14 L19 6" />
										{:else}
											<path d="M12 4 20 19 4 19Z" />
										{/if}
									</svg>
									<span class="measurement-label">{m.label}</span>
									<span class="measurement-primary">{m.primary}</span>
									<svg class="chevron" class:rotated={expanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M6 9l6 6 6-6" />
									</svg>
								</button>
								{#if expanded}
									<div class="measurement-detail">
										<div class="field-row">
											<span class="field-label">{m.type === "polygon" ? "Perimeter" : "Heading"}</span>
											<span class="field-value">{m.secondary}</span>
										</div>
										<div class="field-row">
											<span class="field-label">Points</span>
											<span class="field-value">{m.vertexCount}</span>
										</div>
										<div class="measurement-actions">
											<button type="button" onclick={() => onZoomToMeasurement(m.id)}>Zoom to</button>
											<button type="button" class="danger" onclick={() => onRemoveMeasurement(m.id)}>Delete</button>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet footer()}
			<button type="button" class="done-btn" disabled={!measureState.drawing} onclick={onFinish}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 13l4 4L19 7" />
				</svg>
				Done
			</button>
		{/snippet}
	</SidePanel>
{/if}

<style>
	.toolbar-stack {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.tool-cluster {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.3rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	}

	.tool-divider {
		width: 1px;
		height: 1.4rem;
		background: rgba(255, 255, 255, 0.15);
		margin: 0 0.1rem;
	}

	.tool-btn {
		position: relative;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.75);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
		-webkit-tap-highlight-color: transparent;
	}

	.tool-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.tool-btn.active {
		background: rgba(59, 130, 246, 0.35);
		color: #ffffff;
	}

	.tool-icon {
		width: 1.3rem;
		height: 1.3rem;
	}

	/* Tooltip: light, matching Google Earth's own toolbar tooltip look —
	   a deliberate one-off departure from this app's usual dark tooltips,
	   since this control is explicitly modeled on that reference. */
	.tool-tooltip {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%) translateY(-4px);
		background: #f1f3f4;
		color: #202124;
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		white-space: nowrap;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 150ms ease,
			transform 150ms ease;
	}

	.tool-btn:hover .tool-tooltip {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}

	/* ---- Path/polygon panel content (rendered inside SidePanel) ---- */
	.hint {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.field-label {
		color: rgba(255, 255, 255, 0.6);
	}

	.field-value {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.chevron {
		width: 0.9rem;
		height: 0.9rem;
		color: rgba(255, 255, 255, 0.5);
		transition: transform 150ms ease;
	}
	.chevron.rotated {
		transform: rotate(180deg);
	}

	.panel-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 0.1rem 0;
	}

	.advanced-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.15rem 0;
	}
	.advanced-row svg:first-child {
		width: 1rem;
		height: 1rem;
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}
	.advanced-row span {
		flex: 1;
		text-align: left;
	}

	.advanced-detail {
		padding-left: 1.5rem;
		font-size: 0.78rem;
	}

	/* ---- Draw-in-progress content: natural height, never scrolls — the
	   measurements list below is the one flexible/scrollable region. ---- */
	.panel-draw-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 0 0 auto;
	}

	/* ---- Finished-measurements list ---- */
	.measurements-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		/* Shrinks (and its .measurements-list scrolls) once the panel hits
		   SidePanel's max-height, but never force-stretches past its own
		   content for a short list — see .measurements-list below. */
		flex: 0 1 auto;
		min-height: 0;
	}

	.measurements-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 0 0 auto;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.76rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.measurements-clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.measurements-clear-btn svg {
		width: 0.9rem;
		height: 0.9rem;
	}
	.measurements-clear-btn:hover {
		background: rgba(255, 138, 138, 0.18);
		color: rgba(255, 138, 138, 0.95);
	}

	.measurements-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		/* Thin, low-contrast scrollbar so a long list doesn't look like a
		   default browser scrollbar bolted onto a dark floating panel. */
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}
	.measurements-list::-webkit-scrollbar {
		width: 6px;
	}
	.measurements-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.measurements-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}
	.measurements-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	.measurement-row {
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		transition: background 150ms ease;
	}
	.measurement-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.measurement-row-main {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.55rem;
		background: transparent;
		border: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
	}

	.measurement-type-icon {
		width: 0.95rem;
		height: 0.95rem;
		color: rgba(255, 204, 51, 0.9);
		flex-shrink: 0;
	}

	.measurement-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.measurement-primary {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.measurement-detail {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0 0.55rem 0.55rem 2rem;
		font-size: 0.78rem;
	}

	.measurement-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.1rem;
	}
	.measurement-actions button {
		padding: 0.28rem 0.6rem;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.measurement-actions button:hover {
		background: rgba(255, 255, 255, 0.18);
	}
	.measurement-actions button.danger {
		color: rgba(255, 138, 138, 0.95);
	}
	.measurement-actions button.danger:hover {
		background: rgba(255, 138, 138, 0.18);
	}

	.done-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.55rem 0.75rem;
		background: rgba(59, 130, 246, 0.5);
		border: none;
		border-radius: 999px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.done-btn svg {
		width: 1rem;
		height: 1rem;
	}
	.done-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.7);
	}
	.done-btn:disabled {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.35);
		cursor: default;
	}

	@media (max-width: 480px) {
		:global(.side-panel) {
			right: 0.75rem;
			left: 0.75rem;
			width: auto;
		}
	}
</style>
