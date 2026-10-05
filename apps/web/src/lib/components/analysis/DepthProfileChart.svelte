<script lang="ts">
	/**
	 * DepthProfileChart.svelte
	 *
	 * Value vs. depth at one point - ≤50 GetFeatureInfo requests (one per
	 * standard CMEMS/GLORYS depth level), cancelled and re-issued whenever
	 * `lon`/`lat`/`isoTime` change (a new point/time invalidates every
	 * in-flight sample from the previous one).
	 */
	import type { Data } from "plotly.js";
	import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";
	import { fetchFeatureInfo, STANDARD_DEPTHS_M } from "$lib/copernicus/copernicus-feature-info";
	import { computeStats } from "$lib/copernicus/stats";
	import PlotlyChart from "./PlotlyChart.svelte";

	interface Props {
		wmts: CopernicusWmtsInfo;
		lon: number;
		lat: number;
		isoTime: string;
		units?: string;
	}
	const { wmts, lon, lat, isoTime, units }: Props = $props();

	let chart: PlotlyChart | undefined;
	let loading = $state(false);
	let progress = $state(0);
	let samples = $state<{ depth: number; value: number | null }[]>([]);

	$effect(() => {
		const controller = new AbortController();
		void loadProfile(lon, lat, isoTime, controller.signal);
		return () => controller.abort();
	});

	async function loadProfile(
		pointLon: number,
		pointLat: number,
		time: string,
		signal: AbortSignal,
	): Promise<void> {
		loading = true;
		progress = 0;
		samples = [];
		const next: { depth: number; value: number | null }[] = [];
		for (const depth of STANDARD_DEPTHS_M) {
			if (signal.aborted) return;
			let value: number | null;
			try {
				value = await fetchFeatureInfo(wmts, pointLon, pointLat, time, String(depth), signal);
			} catch (err) {
				if (signal.aborted) return;
				console.warn("[DepthProfileChart] Sample failed:", depth, err);
				value = null;
			}
			next.push({ depth, value });
			samples = [...next];
			progress = next.length;
		}
		loading = false;
	}

	const trace = $derived.by((): Data[] => {
		const withValues = samples.filter((s) => s.value !== null);
		return [
			{
				type: "scatter",
				mode: "lines+markers",
				x: withValues.map((s) => s.value as number),
				// STANDARD_DEPTHS_M is negative-down (ELEVATION convention); flip
				// to positive metres so "reversed" below reads as an intuitive
				// depth axis - 0 (surface) at the top, deepest at the bottom.
				y: withValues.map((s) => Math.abs(s.depth)),
				line: { color: "#3b82f6" },
				marker: { size: 5, color: "#3b82f6" },
				hovertemplate: `%{x:.2f}${units ? " " + units : ""} at %{y:.0f} m<extra></extra>`,
			},
		];
	});

	const stats = $derived(computeStats(samples.map((s) => s.value)));

	export function exportImage(): void {
		chart?.exportImage();
	}
</script>

<div class="chart-wrap">
	{#if loading}
		<div class="progress-note">Sampling depth {progress}/{STANDARD_DEPTHS_M.length}…</div>
	{/if}
	{#if stats}
		<div class="stats-row">
			Min {stats.min.toFixed(2)} · Max {stats.max.toFixed(2)} · Avg {stats.avg.toFixed(2)}
			{units ?? ""}
		</div>
	{/if}
	<div class="plot-area">
		<PlotlyChart
			bind:this={chart}
			data={trace}
			filename="depth-profile"
			layout={{
				xaxis: { title: { text: units ?? "value" }, gridcolor: "rgba(255,255,255,0.08)" },
				yaxis: {
					title: { text: "Depth (m)" },
					autorange: "reversed",
					gridcolor: "rgba(255,255,255,0.08)",
				},
			}}
		/>
	</div>
</div>

<style>
	.chart-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 220px;
	}

	.plot-area {
		flex: 1 1 auto;
		min-height: 0;
	}

	.progress-note {
		position: absolute;
		top: 0.4rem;
		right: 0.6rem;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
		z-index: 1;
	}

	.stats-row {
		flex: 0 0 auto;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.55);
		padding-bottom: 0.3rem;
	}
</style>
