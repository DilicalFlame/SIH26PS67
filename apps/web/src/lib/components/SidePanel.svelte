<script lang="ts">
	/**
	 * SidePanel.svelte
	 *
	 * Reusable top-right floating panel shell — dark rounded card with a
	 * header (leading icon, title, optional help/undo actions, close button),
	 * a scrollable body, and an optional footer. Modeled on Google Earth's
	 * "Path or polygon" panel; the path/polygon tool (Toolbar.svelte) is its
	 * first consumer, but the shell itself carries no measure-tool-specific
	 * content — it's meant to be reused as-is for the future data-layers
	 * panel and the 3D/terrain/elevation plots panel (minimaps, expand to
	 * fullscreen, export) without changes to this file.
	 */
	import type { Snippet } from "svelte";

	interface Props {
		title: string;
		icon?: Snippet;
		onHelp?: () => void;
		onUndo?: () => void;
		undoDisabled?: boolean;
		onClose: () => void;
		children: Snippet;
		footer?: Snippet;
	}
	const { title, icon, onHelp, onUndo, undoDisabled = false, onClose, children, footer }: Props =
		$props();
</script>

<div class="side-panel">
	<header class="side-panel-header">
		{#if icon}
			<span class="side-panel-icon">{@render icon()}</span>
		{/if}
		<h2 class="side-panel-title">{title}</h2>
		<div class="side-panel-actions">
			{#if onHelp}
				<button type="button" class="icon-btn" onclick={onHelp} title="Help" aria-label="Help">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="9" />
						<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2.2" />
						<circle cx="12" cy="17.2" r="0.4" fill="currentColor" stroke="none" />
					</svg>
				</button>
			{/if}
			{#if onUndo}
				<button
					type="button"
					class="icon-btn"
					onclick={onUndo}
					disabled={undoDisabled}
					title="Undo (Backspace)"
					aria-label="Undo"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M9 7 4 12l5 5" />
						<path d="M4 12h11a5 5 0 0 1 0 10h-1" />
					</svg>
				</button>
			{/if}
			<button type="button" class="icon-btn" onclick={onClose} title="Close" aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6 6 18" />
				</svg>
			</button>
		</div>
	</header>

	<div class="side-panel-body">
		{@render children()}
	</div>

	{#if footer}
		<footer class="side-panel-footer">
			{@render footer()}
		</footer>
	{/if}
</div>

<style>
	.side-panel {
		position: fixed;
		top: 1.25rem;
		right: 1.25rem;
		z-index: 20;
		width: 21rem;
		max-width: calc(100vw - 1.5rem);
		/* Bounded to the viewport so a long measurement list scrolls inside
		   .side-panel-body instead of pushing the footer (Done) off-screen or
		   growing the panel past the window — see .side-panel-body below. */
		max-height: calc(100dvh - 2.5rem);
		display: flex;
		flex-direction: column;
		background: rgba(24, 24, 28, 0.92);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: rgba(255, 255, 255, 0.92);
		font-size: 0.82rem;
	}

	.side-panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.85rem 0.6rem 0.85rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.side-panel-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		color: rgba(255, 255, 255, 0.75);
		flex-shrink: 0;
	}
	.side-panel-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.side-panel-title {
		flex: 1;
		font-size: 0.88rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.side-panel-actions {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.icon-btn svg {
		width: 1.05rem;
		height: 1.05rem;
	}
	.icon-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}
	.icon-btn:disabled {
		color: rgba(255, 255, 255, 0.25);
		cursor: default;
	}

	.side-panel-body {
		padding: 0.9rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		/* Natural-height content (hint/fields) plus a scrollable list both
		   live in here via `children` — min-height: 0 is what lets this flex
		   child actually shrink below its content height so the inner list
		   region (flex: 1; min-height: 0; overflow-y: auto) is the thing that
		   scrolls, rather than the whole panel growing past the viewport. */
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	.side-panel-footer {
		padding: 0.7rem 1rem 0.9rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
</style>
