<script lang="ts">
	/**
	 * PointCloud3D.svelte
	 *
	 * A 3D scatter of samples across the polygon's bounding box at a coarse
	 * set of depths — ~8x8 spatial x ~6 depths, fetched with bounded
	 * concurrency and rendered progressively as batches resolve (the full
	 * grid can take tens of seconds; showing points as they arrive is what
	 * keeps that from reading as a frozen tab). Null samples (below
	 * seafloor / no coverage) are filtered out before plotting — scatter3d
	 * doesn't handle a null z predictably the way heatmap/scatter do.
	 */
	import type { Data } from "plotly.js";
	import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";
	import { fetchGrid, STANDARD_DEPTHS_M, type GridSample } from "$lib/copernicus/copernicus-feature-info";
	import { bboxOf, gridWithinBBox } from "$lib/geo/sample-grid";
	import { computeStats } from "$lib/copernicus/stats";
	import PlotlyChart from "./PlotlyChart.svelte";

	interface Props {
		wmts: CopernicusWmtsInfo;
		positions: [number, number][];
		isoTime: string;
		units?: string;
		valueMin?: number;
		valueMax?: number;
		onPointClick?: (lon: number, lat: number) => void;
	}
	const { wmts, positions, isoTime, units, valueMin, valueMax, onPointClick }: Props = $props();

	// Lower than the plan's original 8x8x6 (=384) budget — live testing under
	// this session's sustained request volume showed Copernicus's WMTS
	// effectively serializing concurrent requests, and this panel competes
	// with the depth-profile and 2D-slice panels' own simultaneous fetches
	// on the same page. 6x6x5 (=180) keeps total load down.
	const DEPTH_INDICES = Array.from({ length: 5 }, (_, i) =>
		Math.round((i * (STANDARD_DEPTHS_M.length - 1)) / 4),
	);
	const DEPTHS = DEPTH_INDICES.map((i) => STANDARD_DEPTHS_M[i]);
	const GRID_NX = 6;
	const GRID_NY = 6;

	let chart: PlotlyChart | undefined;
	let loading = $state(false);
	let progress = $state(0);
	let progressTotal = $state(0);
	let points = $state<{ lon: number; lat: number; depth: number; value: number }[]>([]);

	$effect(() => {
		const controller = new AbortController();
		void load(positions, isoTime, controller.signal);
		return () => controller.abort();
	});

	async function load(measurementPositions: [number, number][], time: string, signal: AbortSignal): Promise<void> {
		loading = true;
		points = [];
		const bbox = bboxOf(measurementPositions);
		const grid = gridWithinBBox(bbox, GRID_NX, GRID_NY).map(([lon, lat]) => ({ lon, lat }));
		progressTotal = grid.length * DEPTHS.length;
		progress = 0;

		const collected: { lon: number; lat: number; depth: number; value: number }[] = [];
		for (const depth of DEPTHS) {
			if (signal.aborted) return;
			await fetchGrid(wmts, grid, time, String(depth), {
				signal,
				onProgress: () => {
					progress++;
				},
				onSample: (sample: GridSample) => {
					if (sample.value === null) return;
					collected.push({ lon: sample.lon, lat: sample.lat, depth, value: sample.value });
					// Progressive render: reassigning `points` on every sample
					// would be excessive re-render churn for ~380 points, so
					// this batches by depth level instead — one redraw per
					// completed depth "layer", which is still visibly
					// incremental without hammering Plotly.react.
				},
			});
			if (signal.aborted) return;
			points = [...collected];
		}
		loading = false;
	}

	const trace = $derived.by((): Data[] => {
		return [
			{
				type: "scatter3d",
				mode: "markers",
				x: points.map((p) => p.lon),
				y: points.map((p) => p.lat),
				// Depths are negative-down already — using them directly as z
				// puts the surface near 0 and deep water below it, matching
				// the natural reading of a 3D ocean scene.
				z: points.map((p) => p.depth),
				marker: {
					size: 3,
					color: points.map((p) => p.value),
					colorscale: "Portland",
					cmin: valueMin,
					cmax: valueMax,
					colorbar: { title: { text: units ?? "" } },
				},
				hovertemplate: `%{marker.color:.2f}${units ? " " + units : ""}<extra></extra>`,
			},
		];
	});

	export function exportImage(): void {
		chart?.exportImage();
	}

	function handleClick(point: { x: unknown; y: unknown }): void {
		if (typeof point.x === "number" && typeof point.y === "number") {
			onPointClick?.(point.x, point.y);
		}
	}

	const stats = $derived(computeStats(points.map((p) => p.value)));
</script>

<div class="chart-wrap">
	{#if loading}
		<div class="progress-note">Sampling {progress}/{progressTotal}…</div>
	{/if}
	{#if stats}
		<div class="stats-row">
			Min {stats.min.toFixed(2)} · Max {stats.max.toFixed(2)} · Avg {stats.avg.toFixed(2)}
			{units ?? ""} ({stats.count} points)
		</div>
	{/if}
	<div class="plot-area">
		<PlotlyChart
			bind:this={chart}
			data={trace}
			filename="point-cloud-3d"
			onPointClick={handleClick}
			layout={{
				scene: {
					xaxis: { title: { text: "Longitude" }, gridcolor: "rgba(255,255,255,0.08)" },
					yaxis: { title: { text: "Latitude" }, gridcolor: "rgba(255,255,255,0.08)" },
					zaxis: { title: { text: "Depth (m)" }, gridcolor: "rgba(255,255,255,0.08)" },
				},
				margin: { l: 0, r: 0, t: 0, b: 0 },
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
		min-height: 320px;
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
