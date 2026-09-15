<script lang="ts">
	import type { MeasureState } from "$lib/measure/path-measure-tool";

	interface Props {
		measureState: MeasureState;
		onTogglePathTool: () => void;
		onFinish: () => void;
		onCancel: () => void;
		onUndo: () => void;
		onClearAll: () => void;
		layersOpen: boolean;
		onToggleLayers: () => void;
	}
	const {
		measureState,
		onTogglePathTool,
		onFinish,
		onCancel,
		onUndo,
		onClearAll,
		layersOpen,
		onToggleLayers,
	}: Props = $props();
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

	{#if measureState.active}
		<div class="measure-panel">
			{#if measureState.drawing}
				<span class="measure-readout">{measureState.liveLabel}</span>
				<div class="measure-actions">
					<button type="button" onclick={onUndo} title="Undo last point (Backspace)">Undo</button>
					<button type="button" class="primary" onclick={onFinish} title="Finish (Enter or right-click)">
						Finish
					</button>
					<button type="button" onclick={onCancel} title="Cancel (Esc)">Cancel</button>
				</div>
			{:else}
				<span class="measure-hint">Click the map to start a path or polygon</span>
			{/if}
			{#if measureState.finishedCount > 0}
				<button type="button" class="clear-all-btn" onclick={onClearAll}>
					Clear {measureState.finishedCount} measurement{measureState.finishedCount > 1 ? "s" : ""}
				</button>
			{/if}
		</div>
	{/if}
</div>

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

	.measure-panel {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.85rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
		font-size: 0.78rem;
	}

	.measure-readout {
		color: #ffffff;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.measure-hint {
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
	}

	.measure-actions {
		display: flex;
		gap: 0.35rem;
	}

	.measure-actions button,
	.clear-all-btn {
		padding: 0.3rem 0.65rem;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background 150ms ease;
	}

	.measure-actions button:hover,
	.clear-all-btn:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.measure-actions button.primary {
		background: rgba(59, 130, 246, 0.5);
		color: #ffffff;
	}

	.measure-actions button.primary:hover {
		background: rgba(59, 130, 246, 0.7);
	}

	.clear-all-btn {
		color: rgba(255, 138, 138, 0.9);
		border-left: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0;
		padding-left: 0.75rem;
	}

	@media (max-width: 480px) {
		.measure-panel {
			flex-direction: column;
			align-items: stretch;
			gap: 0.4rem;
		}
		.clear-all-btn {
			border-left: none;
			border-top: 1px solid rgba(255, 255, 255, 0.12);
			padding-left: 0.65rem;
			padding-top: 0.4rem;
		}
	}
</style>
