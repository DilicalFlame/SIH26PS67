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
		layersOpen,
		onToggleLayers,
	}: Props = $props();

	// "Advanced measurements" is a static disclosure for now — real content
	// (segment breakdown, coordinates, etc.) is future scope; this just
	// matches the reference panel's layout so it's a non-event to add later.
	let advancedOpen = $state(false);
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

			{#if measureState.finishedCount > 0}
				<button type="button" class="clear-all-btn" onclick={onClearAll}>
					Clear {measureState.finishedCount} measurement{measureState.finishedCount > 1 ? "s" : ""}
				</button>
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

	.clear-all-btn {
		align-self: flex-start;
		padding: 0.3rem 0;
		background: transparent;
		border: none;
		color: rgba(255, 138, 138, 0.9);
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}
	.clear-all-btn:hover {
		color: rgba(255, 138, 138, 1);
		text-decoration: underline;
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
