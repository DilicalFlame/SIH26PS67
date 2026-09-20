<script lang="ts">
	import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";
	import { fetchLegend, type LegendData } from "$lib/copernicus/copernicus-legend";
	import { formatMeasurement } from "$lib/format/value-format";

	export interface ColorbarHoverInfo {
		label: string;
		/** Viewport coordinates (clientX/clientY-based) - the caller renders
		 *  the actual tooltip as a `position: fixed` element of its own,
		 *  outside whatever scrolling container this component sits inside
		 *  (see ActiveLayersPanel.svelte). Rendering the tooltip locally, even
		 *  as `position: fixed`, still had it contribute to `.layer-list`'s
		 *  overflow box (the panel's own `backdrop-filter` establishes a
		 *  containing block for its fixed-position descendants) and forced a
		 *  horizontal scrollbar whenever the readout's width pushed past the
		 *  panel's edge - lifting it out entirely sidesteps that. */
		x: number;
		y: number;
	}

	interface Props {
		wmts?: CopernicusWmtsInfo;
		/** Catalog-declared bounds, shown immediately (no fetch latency) and
		 *  used as the fallback if the live GetLegend fetch fails. */
		valueMin?: number;
		valueMax?: number;
		units?: string;
		onHoverChange?: (info: ColorbarHoverInfo | null) => void;
	}
	const { wmts, valueMin, valueMax, units, onHoverChange }: Props = $props();

	let legend = $state<LegendData | null>(null);
	let legendFailed = $state(false);

	$effect(() => {
		legend = null;
		legendFailed = false;
		if (!wmts) return;
		let cancelled = false;
		fetchLegend(wmts).then((result) => {
			if (cancelled) return;
			if (result) legend = result;
			else legendFailed = true;
		});
		return () => {
			cancelled = true;
		};
	});

	const min = $derived(legend?.valueMin ?? valueMin);
	const max = $derived(legend?.valueMax ?? valueMax);
	// Prefer the catalog's curated unit string ("°C", "mg/m³") over the raw
	// CMEMS one the live legend fetch returns ("degrees_C", "mg m-3").
	const unitLabel = $derived(units ?? legend?.units ?? "");
	const gradient = $derived(
		legend && legend.colors.length > 0 ? `linear-gradient(to right, ${legend.colors.join(", ")})` : null,
	);

	let hoverFraction = $state<number | null>(null);
	let trackEl = $state<HTMLDivElement | undefined>();

	function handlePointerMove(e: PointerEvent): void {
		if (!trackEl || min === undefined || max === undefined) return;
		const rect = trackEl.getBoundingClientRect();
		const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		hoverFraction = fraction;
		const value = min + fraction * (max - min);
		onHoverChange?.({
			label: `${formatMeasurement(value)}${unitLabel ? ` ${unitLabel}` : ""}`,
			x: e.clientX,
			y: rect.top,
		});
	}
	function handlePointerLeave(): void {
		hoverFraction = null;
		onHoverChange?.(null);
	}
</script>

<div class="layer-colorbar">
	{#if !wmts}
		<p class="empty-note">No legend available for this layer.</p>
	{:else if min === undefined || max === undefined}
		<div class="track skeleton"></div>
	{:else}
		<div
			bind:this={trackEl}
			class="track"
			class:skeleton={!gradient && !legendFailed}
			style:background={gradient ?? undefined}
			onpointermove={handlePointerMove}
			onpointerleave={handlePointerLeave}
			role="img"
			aria-label={`Colour scale from ${formatMeasurement(min)} to ${formatMeasurement(max)}${unitLabel ? ` ${unitLabel}` : ""}`}
		>
			{#if hoverFraction !== null}
				<div class="hover-indicator" style:left="{hoverFraction * 100}%"></div>
			{/if}
		</div>
		<div class="scale-labels">
			<span>{formatMeasurement(min)}{unitLabel ? ` ${unitLabel}` : ""}</span>
			<span>{formatMeasurement(max)}{unitLabel ? ` ${unitLabel}` : ""}</span>
		</div>
	{/if}
</div>

<style>
	.layer-colorbar {
		padding: 0.15rem 0.2rem 0.3rem;
	}

	.empty-note {
		margin: 0;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.45);
		font-style: italic;
	}

	.track {
		position: relative;
		height: 10px;
		border-radius: 5px;
		cursor: crosshair;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
	}

	.track.skeleton {
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.06) 25%,
			rgba(255, 255, 255, 0.14) 50%,
			rgba(255, 255, 255, 0.06) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
		cursor: default;
	}
	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.hover-indicator {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
		background: #ffffff;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.scale-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.3rem;
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.55);
		font-variant-numeric: tabular-nums;
	}
</style>
