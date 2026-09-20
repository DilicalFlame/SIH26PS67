<script lang="ts">
	/**
	 * /analysis - the "Visualise Data" page, opened in a new tab from a
	 * finished measurement's accordion row. Reads the SAME localStorage
	 * session the main tab writes (loadSession()) to find the measurement
	 * (by the `?measurement=` id) and the currently active data layers - a
	 * same-origin snapshot handoff, not a live link back to the main tab
	 * (see CesiumCanvas.svelte's openAnalysisTab for the other half of this).
	 *
	 * Every plotted value on this page comes from Copernicus Marine's WMTS
	 * GetFeatureInfo (copernicus-feature-info.ts) - real, live point samples,
	 * not a mock/synthetic dataset. See that module's header comment for why
	 * (a bulk raster path exists too but needs an unverified browser decode
	 * pipeline; this is the one that's actually built and verified).
	 */
	import { loadSession, type PersistedMeasurementRecord } from "$lib/state/session-store";
	import {
		DATA_LAYERS,
		isTimeCapable,
		resolveIsoTimeForEntry,
		type AnalysableLayerEntry,
	} from "$lib/tiles/data-layers-catalog";
	import { copernicusWmtsLayerToEntry } from "$lib/tiles/wmts-catalog-client";
	import { centroidOf } from "$lib/geo/sample-grid";
	import DepthProfileChart from "$lib/components/analysis/DepthProfileChart.svelte";
	import SliceHeatmap from "$lib/components/analysis/SliceHeatmap.svelte";
	import PointCloud3D from "$lib/components/analysis/PointCloud3D.svelte";
	import TimeSlider from "$lib/components/analysis/TimeSlider.svelte";

	const session = loadSession();
	const measurementId = new URLSearchParams(window.location.search).get("measurement");
	const measurement = session.measurements?.find((m) => m.id === measurementId);

	// A rectangle/ellipse is geometrically a closed ring, exactly like a
	// hand-drawn polygon (see path-measure-tool.ts's header comment) - every
	// "polygon vs. path" branch below (areal analysis vs. line transect)
	// really means "closed shape vs. open line", so rectangle/ellipse take
	// the same branch a polygon already does.
	const MEASUREMENT_TYPE_LABEL: Record<PersistedMeasurementRecord["type"], string> = {
		path: "Path",
		polygon: "Polygon",
		rectangle: "Rectangle",
		ellipse: "Ellipse",
	};

	// A layer added via the picker's live Copernicus search was never in the
	// static DATA_LAYERS array - this page opens in a separate tab/heap via
	// window.open, so the main tab's in-memory dynamic registry
	// (data-layer-registry.svelte.ts) isn't reachable here regardless. Its
	// persisted `descriptor` (see session-store.ts's PersistedActiveLayer)
	// is what makes it resolvable here too: reconstruct the same
	// DataLayerCatalogEntry from that JSON, the same way DataLayerManager's
	// own restoreLayers() does on a page reload of the main tab.
	// Any WMTS-backed layer is analysable, whether or not it has a time axis
	// at all - see AnalysableLayerEntry's doc comment. isTimeCapable only
	// gates whether the Time row/TimeSlider below is shown, never whether a
	// layer's plots exist in the first place.
	const activeEntries: AnalysableLayerEntry[] = (session.layers ?? [])
		.map((l) => (l.descriptor ? copernicusWmtsLayerToEntry(l.descriptor) : DATA_LAYERS.find((d) => d.id === l.id)))
		.filter((e): e is AnalysableLayerEntry => Boolean(e?.wmts));

	let selectedLayerId = $state(activeEntries[0]?.id);
	const selectedEntry = $derived(
		activeEntries.find((e) => e.id === selectedLayerId) ?? activeEntries[0],
	);

	// Computed synchronously (not via $derived/$effect) against
	// activeEntries[0] - a plain array read, not a reactive one - so isoTime
	// is a valid ISO string from its very first render. Feeding an empty
	// string through to TimeSlider even for one initial tick would throw
	// (new Date("").toISOString() is "Invalid time value"), since
	// $derived values recompute synchronously, ahead of any $effect that
	// might otherwise "fix it up after the fact." resolveIsoTimeForEntry
	// snaps whatever raw candidate it's given into a time the entry actually
	// has, continuous or discrete, so "now" is a safe universal starting
	// guess even though it's rarely a value any layer declares directly.
	let isoTime = $state(
		activeEntries[0] && isTimeCapable(activeEntries[0])
			? resolveIsoTimeForEntry(session.layerTimeIso ?? new Date().toISOString(), activeEntries[0])
			: new Date().toISOString(),
	);
	// Re-resolve whenever the selected layer changes (e.g. switching to a
	// forecast-style layer with a shorter time window than the one isoTime
	// was picked against, or from a continuous layer to a discrete one). A
	// genuinely static layer (no time dimension at all) has nothing to
	// resolve into - isoTime just carries over unchanged, and is never read
	// by GetFeatureInfo in any way that matters for such a layer anyway.
	$effect(() => {
		if (selectedEntry && isTimeCapable(selectedEntry)) isoTime = resolveIsoTimeForEntry(isoTime, selectedEntry);
	});

	const initialCentroid = measurement ? centroidOf(measurement.positions) : ([0, 0] as const);
	let selectedPoint = $state({ lon: initialCentroid[0], lat: initialCentroid[1] });
	function handlePointClick(lon: number, lat: number): void {
		selectedPoint = { lon, lat };
	}

	let depthChart = $state<DepthProfileChart | undefined>();
	let sliceChart = $state<SliceHeatmap | undefined>();
	let volumeChart = $state<PointCloud3D | undefined>();
</script>

<svelte:head>
	<title>{measurement ? `Visualise - ${measurement.label}` : "Visualise Data"}</title>
</svelte:head>

<div class="analysis-page">
	{#if !measurement || activeEntries.length === 0}
		<div class="empty-state">
			<h1>Nothing to visualise</h1>
			<p>
				{#if !measurement}
					No measurement was found for this link - open this page from the "Visualise Data"
					button on a finished path or polygon instead.
				{:else}
					No active data layer was found - add one from the layers panel first.
				{/if}
			</p>
		</div>
	{:else if selectedEntry}
		<header class="page-header">
			<div class="title-block">
				<span class="measurement-type">{MEASUREMENT_TYPE_LABEL[measurement.type]}</span>
				<h1>{measurement.label}</h1>
			</div>

			{#if activeEntries.length > 1}
				<div class="layer-tabs" role="tablist">
					{#each activeEntries as entry (entry.id)}
						<button
							type="button"
							role="tab"
							class:active={entry.id === selectedEntry.id}
							aria-selected={entry.id === selectedEntry.id}
							onclick={() => (selectedLayerId = entry.id)}
						>
							{entry.title}
						</button>
					{/each}
				</div>
			{/if}

			<div class="dataset-info">
				<span class="source-badge">{selectedEntry.source === "api" ? "Connected API" : selectedEntry.source}</span>
				<span>{selectedEntry.variable ?? selectedEntry.title}</span>
				{#if selectedEntry.attribution}<span class="attribution">{selectedEntry.attribution}</span>{/if}
			</div>

			{#if isTimeCapable(selectedEntry)}
				<div class="time-row">
					<span class="time-label">Time</span>
					<TimeSlider
						timeStart={"timeStart" in selectedEntry ? selectedEntry.timeStart : undefined}
						timeEnd={"timeStart" in selectedEntry ? selectedEntry.timeEnd : undefined}
						timeStepSeconds={"timeStart" in selectedEntry ? selectedEntry.timeStepSeconds : undefined}
						values={"timeValues" in selectedEntry ? selectedEntry.timeValues : undefined}
						value={isoTime}
						onChange={(next) => (isoTime = next)}
					/>
				</div>
			{:else}
				<p class="time-row static-note">This layer has no time dimension - it's a single static field.</p>
			{/if}
		</header>

		<div class="panel-grid" class:has-volume={measurement.type !== "path"}>
			<section class="panel">
				<div class="panel-header">
					<h2>Depth profile</h2>
					<button type="button" class="export-btn" onclick={() => depthChart?.exportImage()}>
						Export
					</button>
				</div>
				<p class="panel-subtitle">
					{selectedPoint.lon.toFixed(3)}°, {selectedPoint.lat.toFixed(3)}° - click the slice{measurement.type !==
					"path"
						? " or point cloud"
						: ""} to resample elsewhere.
				</p>
				<DepthProfileChart
					bind:this={depthChart}
					wmts={selectedEntry.wmts}
					lon={selectedPoint.lon}
					lat={selectedPoint.lat}
					{isoTime}
					units={selectedEntry.units}
				/>
			</section>

			<section class="panel">
				<div class="panel-header">
					<h2>2D slice</h2>
					<button type="button" class="export-btn" onclick={() => sliceChart?.exportImage()}>
						Export
					</button>
				</div>
				<p class="panel-subtitle">
					{#if measurement.type === "path"}
						Cross-section along the drawn line - distance vs. depth.
					{:else}
						Areal slice at a single depth within the drawn area.
					{/if}
				</p>
				<SliceHeatmap
					bind:this={sliceChart}
					wmts={selectedEntry.wmts}
					positions={measurement.positions}
					measurementType={measurement.type}
					{isoTime}
					units={selectedEntry.units}
					onPointClick={handlePointClick}
				/>
			</section>

			{#if measurement.type !== "path"}
				<section class="panel">
					<div class="panel-header">
						<h2>3D point cloud</h2>
						<button type="button" class="export-btn" onclick={() => volumeChart?.exportImage()}>
							Export
						</button>
					</div>
					<p class="panel-subtitle">Drag to orbit. Points colour by value; z is depth.</p>
					<PointCloud3D
						bind:this={volumeChart}
						wmts={selectedEntry.wmts}
						positions={measurement.positions}
						{isoTime}
						units={selectedEntry.units}
						valueMin={selectedEntry.valueMin}
						valueMax={selectedEntry.valueMax}
						onPointClick={handlePointClick}
					/>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background: #0d0d0f;
	}

	.analysis-page {
		min-height: 100dvh;
		padding: 1.5rem;
		color: #ffffff;
		font-family: "Noto Sans", system-ui, sans-serif;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.empty-state {
		max-width: 480px;
		margin: 3rem auto;
		text-align: center;
	}
	.empty-state h1 {
		font-size: 1.3rem;
		margin-bottom: 0.6rem;
	}
	.empty-state p {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		padding: 1rem 1.25rem;
	}

	.title-block {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.measurement-type {
		padding: 0.15rem 0.5rem;
		background: rgba(59, 130, 246, 0.25);
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(191, 219, 254, 0.95);
	}
	.title-block h1 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}

	.layer-tabs {
		display: flex;
		gap: 0.3rem;
	}
	.layer-tabs button {
		padding: 0.35rem 0.8rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.7);
		font-family: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.layer-tabs button.active {
		background: rgba(59, 130, 246, 0.35);
		border-color: transparent;
		color: #ffffff;
	}

	.dataset-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.6);
	}
	.source-badge {
		padding: 0.1rem 0.45rem;
		background: rgba(59, 130, 246, 0.2);
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(191, 219, 254, 0.9);
	}
	.attribution {
		color: rgba(255, 255, 255, 0.4);
	}

	.time-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.time-row.static-note {
		margin: 0;
		font-size: 0.78rem;
		font-style: italic;
		color: rgba(255, 255, 255, 0.45);
	}
	.time-label {
		flex-shrink: 0;
		font-size: 0.76rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.45);
	}

	.panel-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		flex: 1;
		min-height: 0;
	}
	.panel-grid.has-volume {
		grid-template-columns: 1fr 1fr 1fr;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		padding: 1rem;
		min-height: 340px;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.panel-header h2 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.export-btn {
		padding: 0.3rem 0.7rem;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
	}
	.export-btn:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.panel-subtitle {
		margin: 0;
		font-size: 0.74rem;
		color: rgba(255, 255, 255, 0.5);
	}

	@media (max-width: 900px) {
		.panel-grid,
		.panel-grid.has-volume {
			grid-template-columns: 1fr;
		}
	}
</style>
