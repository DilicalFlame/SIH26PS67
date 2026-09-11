<script lang="ts">
	import { viewStatus } from "$lib/state/view-status.svelte";

	// Plain `let`, not `$state` — setCoords writes to it imperatively via
	// innerText, bypassing Svelte reactivity entirely so per-pixel pointermove
	// events never trigger a re-render.
	let coordsEl: HTMLSpanElement;

	/** Called directly from GlobeCanvas's pointermove handler on every event. */
	export function setCoords(text: string): void {
		if (coordsEl) coordsEl.innerText = text;
	}

	/** Called when the cursor leaves the canvas or unprojects to nothing
	 *  (off-silhouette), so stale coordinates don't linger. */
	export function clearCoords(): void {
		if (coordsEl) coordsEl.innerText = "—";
	}
</script>

<div class="status-bar">
	<div class="status-section coords" title="Cursor position: latitude, longitude">
		<span class="status-label">Location</span>
		<span class="status-value" bind:this={coordsEl}>—</span>
	</div>

	<div class="status-section altitude" title="Camera altitude above sea level">
		<span class="status-label">Altitude</span>
		<span class="status-value">{viewStatus.altitudeKm.toFixed(0)} km</span>
	</div>

	<div class="status-section scale-bar-group" title="Scale bar for the current view">
		<span class="scale-bar" style:width="{viewStatus.scaleBarWidthPx}px"
		></span>
		<span class="status-value">{viewStatus.scaleBarLabel}</span>
	</div>
</div>

<style>
	.status-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2.25rem;
		display: grid;
		/* Equal flanking columns keep the center column's midpoint pinned to
		 * the bar's midpoint no matter how wide the coords text or the scale
		 * bar get — only a `justify-content: space-between` flex row would
		 * let the altitude readout drift sideways as its neighbors resize. */
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1.5rem;
		padding: 0 1.25rem;
		/* Dark gradient anchored to the bottom edge guarantees a minimum
		 * contrast floor behind the text, independent of the glass tint —
		 * without it, bright terrain (e.g. sand-colored landmass) showing
		 * through the blur can wash the white text out entirely. Darker and
		 * taller than before so text stays legible without relying much on
		 * the (heavier, per-frame) blur underneath it. */
		background: linear-gradient(
				to top,
				rgba(0, 0, 0, 0.75) 0%,
				rgba(0, 0, 0, 0.45) 60%,
				rgba(0, 0, 0, 0.15) 100%
			),
			rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		/* Lighter shadow than the projection-bar's — the darker background
		 * above now does the contrast work, so the shadow only needs to
		 * separate the bar from the canvas, not fight for legibility too. */
		box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.3);
		font-family: "Noto Sans", system-ui, sans-serif;
		font-size: 0.72rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		color: rgba(255, 255, 255, 0.6);
		z-index: 10;
		/* Never intercept drag/wheel input meant for the canvas underneath. */
		pointer-events: none;
		user-select: none;
	}

	.status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
		/* Re-enable hover just over this small hitbox (for the title-attribute
		 * tooltip) without undoing the bar's own pointer-events:none — most of
		 * the strip, including the gaps between sections, still passes drag
		 * and wheel input straight through to the canvas. */
		pointer-events: auto;
	}

	/* Solid white everywhere, differentiated by weight/size/opacity rather
	 * than hue — one small shadow is enough for contrast now that the bar's
	 * own background is dark, and it's cheap to paint (unlike the layered
	 * shadow + filter this replaced). */
	.status-label,
	.status-value {
		color: #fff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
	}

	.status-label {
		font-weight: 500;
		text-transform: uppercase;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		opacity: 0.65;
	}

	.status-value {
		font-variant-numeric: tabular-nums;
	}

	.coords {
		justify-self: start;
	}

	.altitude {
		justify-self: center;
	}

	.scale-bar-group {
		justify-self: end;
	}

	.scale-bar {
		display: inline-block;
		height: 4px;
		border-left: 1px solid #fff;
		border-right: 1px solid #fff;
		border-bottom: 1px solid #fff;
		transition: width 150ms ease;
		/* box-shadow instead of filter:drop-shadow — this element's width is
		 * rewritten by the animate() loop at ~15fps while zooming, and
		 * box-shadow is the cheaper of the two to repaint on a plain
		 * rectangle (drop-shadow rebuilds an alpha mask every time). */
		box-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
	}

	@media (max-width: 480px) {
		.status-bar {
			gap: 0.75rem;
			padding: 0 0.75rem;
		}
		.status-label {
			display: none;
		}
	}
</style>
