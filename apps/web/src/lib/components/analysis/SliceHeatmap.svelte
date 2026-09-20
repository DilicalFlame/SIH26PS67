<script lang="ts">
	/**
	 * SliceHeatmap.svelte
	 *
	 * The "depth slider moves a 2D slice plane through the data" control,
	 * built as a re-sampled 2D heatmap rather than a dragged 3D plane
	 * (Plotly's 3D scenes don't support in-viewport drag manipulation, and
	 * the request was itself phrased as slider-driven).
	 *
	 * Path measurements: a transect - evenly-spaced points along the drawn
	 * line (x = distance) sampled across a coarse set of depths (y = depth).
	 * Everything else (polygon, rectangle, ellipse - any closed shape, see
	 * path-measure-tool.ts's header comment) gets an areal slice instead: a
	 * lon/lat grid over the shape's bounding box (x = lon, y = lat), sampled
	 * at ONE depth, chosen by this component's own depth slider.
	 *
	 * Both cases share the same request-budget discipline: the depth slider
	 * commits on release (not on every drag tick), an in-flight grid is
	 * cancelled via AbortController the moment a new one starts, and
	 * completed grids are cached by (isoTime, depth) so scrubbing back to an
	 * already-seen depth is instant, not a refetch.
	 */
	import type { Data } from "plotly.js";
	import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";
	import { fetchGrid, STANDARD_DEPTHS_M, type GridSample } from "$lib/copernicus/copernicus-feature-info";
	import { bboxOf, gridWithinBBox, pointsAlongLine } from "$lib/geo/sample-grid";
	import { computeStats } from "$lib/copernicus/stats";
	import PlotlyChart from "./PlotlyChart.svelte";

	interface Props {
		wmts: CopernicusWmtsInfo;
		positions: [number, number][];
		measurementType: "path" | "polygon" | "rectangle" | "ellipse";
		isoTime: string;
		units?: string;
		onPointClick?: (lon: number, lat: number) => void;
	}
	const { wmts, positions, measurementType, isoTime, units, onPointClick }: Props = $props();

	// A coarser subset of the 50 standard depths for the transect's y-axis
	// and the polygon slider's steps - 12 evenly-spaced indices from
	// surface to the deepest level.
	const SLICE_DEPTH_INDICES = Array.from({ length: 12 }, (_, i) =>
		Math.round((i * (STANDARD_DEPTHS_M.length - 1)) / 11),
	);
	const SLICE_DEPTHS = SLICE_DEPTH_INDICES.map((i) => STANDARD_DEPTHS_M[i]);

	let chart: PlotlyChart | undefined;
	let loading = $state(false);
	let progress = $state(0);
	let progressTotal = $state(0);

	// Polygon mode only: which of SLICE_DEPTHS is currently shown.
	let depthIndex = $state(0);

	let grid = $state<{ x: number[]; y: number[]; z: (number | null)[][] } | null>(null);
	const gridCache = new Map<string, { x: number[]; y: number[]; z: (number | null)[][] }>();
	let abortController: AbortController | undefined;

	$effect(() => {
		// Re-run when the measurement, time, or (polygon mode) chosen depth
		// changes. Referencing depthIndex here even in path mode is harmless -
		// path mode just never changes it.
		void positions;
		void isoTime;
		void depthIndex;
		void measurementType;
		load();
	});

	async function load(): Promise<void> {
		abortController?.abort();
		const controller = new AbortController();
		abortController = controller;

		const cacheKey =
			measurementType !== "path" ? `${isoTime}:${SLICE_DEPTHS[depthIndex]}` : isoTime;
		const cached = gridCache.get(cacheKey);
		if (cached) {
			grid = cached;
			return;
		}

		loading = true;
		progress = 0;

		if (measurementType === "path") {
			const transect = pointsAlongLine(positions, 30);
			// fetchGrid samples one time/depth per call, so depth is threaded
			// through by calling it once per depth level (a row of the
			// heatmap) rather than in one big call - same total request
			// count, just organized so progress reflects whole rows completing.
			progressTotal = transect.length * SLICE_DEPTHS.length;
			const z: (number | null)[][] = [];
			for (const depth of SLICE_DEPTHS) {
				if (controller.signal.aborted) return;
				const rowBase = z.length * transect.length;
				const samples = await fetchGrid(
					wmts,
					transect.map((p) => ({ lon: p.lon, lat: p.lat })),
					isoTime,
					String(depth),
					{
						signal: controller.signal,
						onProgress: (completed) => {
							progress = rowBase + completed;
						},
					},
				);
				if (controller.signal.aborted) return;
				z.push(samples.map((s) => s.value));
			}
			const result = {
				x: transect.map((p) => p.distanceDeg),
				y: SLICE_DEPTHS.map((d) => Math.abs(d)),
				z,
			};
			gridCache.set(cacheKey, result);
			grid = result;
		} else {
			const bbox = bboxOf(positions);
			// Lower than the plan's original 12x12 budget - live testing under
			// this session's sustained request volume showed Copernicus's WMTS
			// effectively serializing concurrent requests at roughly one every
			// ~0.25-1s regardless of client-side concurrency, and this panel
			// competes with the depth-profile and point-cloud panels' own
			// simultaneous fetches on the same page. 8x8 keeps total load (and
			// therefore wait time) down while still giving a real areal grid.
			const nx = 8;
			const ny = 8;
			const points = gridWithinBBox(bbox, nx, ny).map(([lon, lat]) => ({ lon, lat }));
			progressTotal = points.length;
			const samples = await fetchGrid(wmts, points, isoTime, String(SLICE_DEPTHS[depthIndex]), {
				signal: controller.signal,
				onProgress: (completed) => {
					progress = completed;
				},
			});
			if (controller.signal.aborted) return;

			const lons = Array.from(new Set(points.map((p) => p.lon))).sort((a, b) => a - b);
			const lats = Array.from(new Set(points.map((p) => p.lat))).sort((a, b) => a - b);
			const z: (number | null)[][] = lats.map(() => new Array(lons.length).fill(null));
			const byKey = new Map<string, GridSample>(samples.map((s) => [`${s.lon}:${s.lat}`, s]));
			lats.forEach((lat, row) => {
				lons.forEach((lon, col) => {
					z[row][col] = byKey.get(`${lon}:${lat}`)?.value ?? null;
				});
			});
			const result = { x: lons, y: lats, z };
			gridCache.set(cacheKey, result);
			grid = result;
		}

		loading = false;
	}

	const trace = $derived.by((): Data[] => {
		if (!grid) return [];
		return [
			{
				type: "heatmap",
				x: grid.x,
				y: grid.y,
				z: grid.z,
				colorscale: "Portland",
				colorbar: { title: { text: units ?? "" } },
				hovertemplate: "%{z}<extra></extra>",
			},
		];
	});

	function handleClick(point: { x: unknown; y: unknown }): void {
		if (measurementType === "path" || !onPointClick) return;
		if (typeof point.x === "number" && typeof point.y === "number") {
			onPointClick(point.x, point.y);
		}
	}

	function commitDepth(next: number): void {
		depthIndex = next;
	}

	const stats = $derived(grid ? computeStats(grid.z.flat()) : null);

	export function exportImage(): void {
		chart?.exportImage();
	}
</script>

<div class="chart-wrap">
	{#if loading}
		<div class="progress-note">Sampling {progress}/{progressTotal}…</div>
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
			filename={measurementType === "path" ? "transect-slice" : "areal-slice"}
			onPointClick={handleClick}
			layout={{
				xaxis: {
					title: { text: measurementType === "path" ? "Distance along line" : "Longitude" },
					gridcolor: "rgba(255,255,255,0.08)",
				},
				yaxis: {
					title: { text: measurementType === "path" ? "Depth (m)" : "Latitude" },
					autorange: measurementType === "path" ? "reversed" : true,
					gridcolor: "rgba(255,255,255,0.08)",
				},
			}}
		/>
	</div>
	{#if measurementType !== "path"}
		<div class="depth-slider-row">
			<span>Depth</span>
			<input
				type="range"
				min="0"
				max={SLICE_DEPTHS.length - 1}
				value={depthIndex}
				onchange={(e) => commitDepth(parseInt(e.currentTarget.value, 10))}
				aria-label="Slice depth"
			/>
			<span class="depth-value">{Math.abs(SLICE_DEPTHS[depthIndex]).toFixed(0)} m</span>
		</div>
	{/if}
</div>

<style>
	.chart-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 260px;
		display: flex;
		flex-direction: column;
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

	.depth-slider-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.2rem 0;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.7);
		flex: 0 0 auto;
	}
	.depth-slider-row input[type="range"] {
		flex: 1;
	}
	.depth-value {
		font-variant-numeric: tabular-nums;
		min-width: 4.5rem;
		text-align: right;
	}
</style>
