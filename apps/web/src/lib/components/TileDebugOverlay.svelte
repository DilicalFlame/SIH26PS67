<script lang="ts">
	// TEMPORARY diagnostic overlay - shows which tile zoom/coordinate is
	// actually rendering under the cursor, to debug tile-selection issues.
	// Safe to delete this file (and its two call sites in GlobeCanvas.svelte)
	// once no longer needed.

	// Direct DOM write, not $state - updates on every hover move, same
	// reasoning as StatusBar's coordinate readout.
	let textEl: HTMLPreElement | undefined = $state();

	export function setInfo(text: string): void {
		if (textEl) textEl.textContent = text;
	}
</script>

<pre class="tile-debug" bind:this={textEl}>-</pre>

<style>
	.tile-debug {
		position: fixed;
		top: 1.25rem;
		left: 1.25rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 100, 100, 0.4);
		border-radius: 0.35rem;
		color: #ffb3b3;
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 0.68rem;
		line-height: 1.5;
		white-space: pre;
		pointer-events: none;
		user-select: none;
		z-index: 10;
	}
</style>
