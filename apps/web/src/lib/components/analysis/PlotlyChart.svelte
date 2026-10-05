<script lang="ts">
	/**
	 * PlotlyChart.svelte
	 *
	 * Shared base for every plot on the analysis page (2D line, 2D heatmap,
	 * 3D scatter) - one place that owns the dynamic import (Plotly touches
	 * `document` at import time, so it can't be a static import in an SSR'd
	 * SvelteKit app - this route disables SSR, but a static import would
	 * still break `pnpm run check`/any tooling that evaluates modules), the
	 * resize wiring, and the export-to-image call, so every chart component
	 * gets identical export behavior for free instead of three parallel
	 * implementations that could drift.
	 *
	 * Uses `plotly.js-dist-min` (the full bundle), not a partial one - see
	 * src/lib/types/plotly-dist-min.d.ts for why: the "gl3d" partial bundle
	 * silently failed to draw `heatmap` traces at all (accepted the trace
	 * with no error, drew zero pixels), caught only by inspecting the
	 * rendered SVG directly, not by a newPlot()-resolves spike test.
	 */
	import type { Data, Layout, Config, PlotlyHTMLElement, PlotMouseEvent } from "plotly.js";

	interface Props {
		data: Data[];
		layout?: Partial<Layout>;
		/** Base filename Plotly's export uses (no extension). */
		filename: string;
		/** Fired once Plotly has drawn at least one frame - lets a parent know
		 *  it's safe to call exportImage() or bind click handlers. */
		onReady?: () => void;
		/** Plotly `plotly_click` payload's first point, simplified to what
		 *  every consumer on this page actually needs. */
		onPointClick?: (point: { x: unknown; y: unknown; z: unknown; pointIndex: number }) => void;
	}
	const { data, layout = {}, filename, onReady, onPointClick }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let PlotlyLib: typeof import("plotly.js") | undefined;
	let plotEl: PlotlyHTMLElement | undefined;
	let ready = $state(false);

	const BASE_LAYOUT: Partial<Layout> = {
		paper_bgcolor: "rgba(0,0,0,0)",
		plot_bgcolor: "rgba(0,0,0,0)",
		font: { color: "rgba(255,255,255,0.85)", family: "inherit", size: 11 },
		margin: { l: 48, r: 16, t: 16, b: 40 },
		autosize: true,
	};

	const CONFIG: Partial<Config> = {
		responsive: true,
		displaylogo: false,
		// The default modebar (Plotly's own camera icon) looks foreign next to
		// this app's own UI - export is exposed instead via exportImage(),
		// called from a button styled to match everything else on this page.
		displayModeBar: false,
	};

	async function mount(): Promise<(() => void) | undefined> {
		if (!containerEl) return undefined;
		const mod = await import("plotly.js-dist-min");
		// UMD interop: Vite may hand back { default: Plotly } or the module
		// namespace itself, depending on how the bundle assigns module.exports.
		PlotlyLib = ((mod as { default?: unknown }).default ?? mod) as typeof import("plotly.js");

		plotEl = await PlotlyLib.newPlot(containerEl, data, { ...BASE_LAYOUT, ...layout }, CONFIG);
		ready = true;
		onReady?.();

		plotEl.on("plotly_click", (event: PlotMouseEvent) => {
			const point = event.points?.[0];
			if (point && onPointClick) {
				// @types/plotly.js's PlotDatum doesn't declare `z` even though
				// scatter3d/heatmap click payloads carry one at runtime.
				onPointClick({
					x: point.x,
					y: point.y,
					z: (point as unknown as { z?: unknown }).z,
					pointIndex: point.pointIndex,
				});
			}
		});

		const resizeObserver = new ResizeObserver(() => {
			if (PlotlyLib && containerEl) void PlotlyLib.Plots.resize(containerEl);
		});
		resizeObserver.observe(containerEl);
		return () => resizeObserver.disconnect();
	}

	$effect(() => {
		let cleanup: (() => void) | undefined;
		mount().then((c) => {
			cleanup = c;
		});
		return () => cleanup?.();
	});

	// Re-render in place when the caller's data/layout change (e.g. a new
	// grid of samples arriving, or the depth-slice slider picking a new
	// depth) - Plotly.react diffs against the previous frame instead of a
	// full rebuild, which is what keeps this cheap enough to call on every
	// progressive-fetch batch.
	$effect(() => {
		if (!ready || !PlotlyLib || !containerEl) return;
		void PlotlyLib.react(containerEl, data, { ...BASE_LAYOUT, ...layout }, CONFIG);
	});

	export function exportImage(): void {
		if (!PlotlyLib || !containerEl) return;
		void PlotlyLib.downloadImage(containerEl, {
			format: "png",
			filename,
			width: null,
			height: null,
		});
	}
</script>

<div class="plotly-chart" bind:this={containerEl}></div>

<style>
	.plotly-chart {
		width: 100%;
		height: 100%;
		min-height: 0;
	}
</style>
