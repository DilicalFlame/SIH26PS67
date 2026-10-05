<script lang="ts">
	/**
	 * CatalogResultGrid.svelte
	 *
	 * The browsable/filterable view over the full ~9,628-layer live
	 * Copernicus catalog (as opposed to DataLayersCatalog.svelte's separate,
	 * always-shown "Featured" section of ten hand-curated layers, which this
	 * component has no involvement with).
	 *
	 * Never fetches or renders all 9,628 at once, even with zero filters
	 * applied - `searchWmtsLayers` pages 40 at a time; scrolling near the
	 * bottom sentinel loads the next page (see scrollSentinel), appending
	 * rather than replacing so scroll position and already-rendered cards
	 * don't jump. Growing the number of *cards* this way is cheap (they're
	 * mostly text) - what actually costs something over a long scroll
	 * session is each card's thumbnail `GetTile` request, which is why
	 * CatalogLayerCard owns its own visibility-based mount/unmount for the
	 * `<img>` specifically, independent of this component's own pagination.
	 */
	import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";
	import {
		searchWmtsLayers,
		copernicusWmtsLayerToEntry,
		type WmtsCatalogFilters,
		type CatalogLabelMaps,
		type WmtsSortOrder,
	} from "$lib/tiles/wmts-catalog-client";
	import { registerDynamicLayer } from "$lib/tiles/data-layer-registry.svelte";
	import CatalogLayerCard from "$lib/components/CatalogLayerCard.svelte";
	import type { SamplePoint } from "$lib/copernicus/copernicus-coverage-check";

	interface Props {
		filters: WmtsCatalogFilters;
		activeIds: Set<string>;
		/** Grid (tiled cards) vs. list (full-width rows) - see
		 *  DataLayersCatalog.svelte's view-mode toggle. */
		view: "grid" | "list";
		/** See wmts-catalog-client.ts's WmtsSortOrder doc comment - drives
		 *  both the backend order and whether results below are grouped by
		 *  product (only coherent under "relevance"). */
		sort: WmtsSortOrder;
		/** Human labels for each card's domain/region/product-type tags -
		 *  see wmts-catalog-client.ts's buildCatalogLabelMaps doc comment. */
		labelMaps: CatalogLabelMaps;
		/** Selected polygons' sample points, forwarded to each card's own
		 *  lazy coverage check - see CatalogLayerCard.svelte. Empty when no
		 *  "Area of Interest" polygon is selected. */
		samplePoints: SamplePoint[];
		/** Fires on every change to the aggregate check progress - `null`
		 *  once there's nothing pending (or no polygon filter is active) so
		 *  the parent can hide its indicator entirely. The parent
		 *  (DataLayersCatalog.svelte) renders the actual progress bar itself,
		 *  pinned to the modal header rather than scrolling away with this
		 *  component's own content - see that component's doc comment. */
		onCoverageProgress?: (progress: { pending: number; fraction: number } | null) => void;
		onToggle: (id: string) => void;
	}
	const { filters, activeIds, view, sort, labelMaps, samplePoints, onCoverageProgress, onToggle }: Props = $props();

	const PAGE_SIZE = 40;
	const SEARCH_DEBOUNCE_MS = 350;

	let results = $state<DataLayerCatalogEntry[]>([]);
	let totalCount = $state(0);
	let loading = $state(false); // a filter changed - replaces `results`
	let loadingMore = $state(false); // pagination - appends to `results`
	let errored = $state(false);

	// Each card reports its own lazy coverage-check start/result here purely
	// for the aggregate progress bar and "N hidden" banner below - neither is
	// ever read by the cards themselves, so a card's own render decision
	// never depends on another card's result. Reset whenever the sample
	// points change (a different area) or a fresh search replaces `results`,
	// since a stale id->result entry from a prior area/search would
	// otherwise inflate the counts for entries that either no longer apply
	// or haven't been re-checked yet.
	let startedIds = $state<Set<string>>(new Set());
	let coverageResults = $state<Map<string, boolean>>(new Map());
	function handleCoverageStarted(id: string): void {
		if (startedIds.has(id)) return;
		startedIds = new Set(startedIds).add(id);
	}
	function handleCoverageChecked(id: string, hasData: boolean): void {
		coverageResults = new Map(coverageResults).set(id, hasData);
	}
	const hiddenCount = $derived(
		samplePoints.length === 0 ? 0 : [...coverageResults.values()].filter((hasData) => !hasData).length,
	);
	// How many checks have been kicked off but haven't resolved yet - drives
	// the "Checking…" progress bar. Only ever non-zero while a polygon
	// filter is active and there are visible cards still mid-request.
	const pendingCheckCount = $derived(startedIds.size - coverageResults.size);
	const checkProgress = $derived(startedIds.size === 0 ? 0 : coverageResults.size / startedIds.size);
	$effect(() => {
		onCoverageProgress?.(
			samplePoints.length > 0 && pendingCheckCount > 0 ? { pending: pendingCheckCount, fraction: checkProgress } : null,
		);
	});
	// Hide flagged results by default - a bbox-only filter false-positive
	// (see copernicus-coverage-check.ts) is the common case for a small,
	// deliberately drawn area of interest, so showing a wall of dimmed
	// "no data here" cards by default would bury the layers that actually
	// matter. "Show anyway" (below) always remains one click away.
	let hideFlagged = $state(true);
	$effect(() => {
		samplePoints;
		coverageResults = new Map();
		startedIds = new Set();
	});

	// Backend sorts by (productId, datasetId, variable) before slicing (see
	// apps/api/app/api/v1/wmts_catalog.py) ONLY when `sort` is "relevance" -
	// that's the one order where every page's results for a given product
	// are contiguous with the previous page's, so a linear scan grouping by
	// "does this entry continue the last group" is correct even after
	// several appended pages. A title sort interleaves products instead, so
	// grouping/labeling by product there would produce a near-arbitrary
	// scatter of single-entry "groups" - the template renders `results`
	// flat, without groups, whenever `sort !== "relevance"` (see below).
	interface ResultGroup {
		productId: string;
		entries: DataLayerCatalogEntry[];
	}
	const groups = $derived.by((): ResultGroup[] => {
		const out: ResultGroup[] = [];
		for (const entry of results) {
			const productId = entry.productId ?? "";
			const last = out[out.length - 1];
			if (last && last.productId === productId) last.entries.push(entry);
			else out.push({ productId, entries: [entry] });
		}
		return out;
	});

	$effect(() => {
		// Read every field explicitly so this effect re-runs on any of them
		// (a plain object prop only triggers dependent effects via the
		// fields actually read during the last run).
		const snapshot: WmtsCatalogFilters = {
			query: filters.query,
			collections: filters.collections,
			regions: filters.regions,
			categories: filters.categories,
			friendlyVariableGroups: filters.friendlyVariableGroups,
			candidatePolygons: filters.candidatePolygons,
			selectedPolygons: filters.selectedPolygons,
		};
		const sortSnapshot = sort;
		const controller = new AbortController();
		loading = true;
		errored = false;
		const timer = setTimeout(async () => {
			try {
				const { layers, totalCount: count } = await searchWmtsLayers(snapshot, {
					limit: PAGE_SIZE,
					sort: sortSnapshot,
					signal: controller.signal,
				});
				const entries = layers.map(copernicusWmtsLayerToEntry);
				entries.forEach(registerDynamicLayer);
				results = entries;
				totalCount = count;
				coverageResults = new Map();
				startedIds = new Set();
			} catch {
				if (!controller.signal.aborted) errored = true;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function loadMore(): Promise<void> {
		if (loading || loadingMore) return;
		if (results.length >= totalCount) return;
		loadingMore = true;
		try {
			const { layers } = await searchWmtsLayers(filters, { limit: PAGE_SIZE, offset: results.length, sort });
			const entries = layers.map(copernicusWmtsLayerToEntry);
			entries.forEach(registerDynamicLayer);
			results = [...results, ...entries];
		} catch {
			// Leave what's already loaded in place - the sentinel is still in
			// the DOM (results.length < totalCount still holds), so scrolling
			// near it again just retries.
		} finally {
			loadingMore = false;
		}
	}

	/** Observes against `.catalog-main` (the modal's actual scrolling
	 *  element, owned by DataLayersCatalog.svelte - the default viewport
	 *  root wouldn't fire inside this modal). */
	function scrollSentinel(node: HTMLElement) {
		const root = node.closest(".catalog-main");
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void loadMore();
			},
			{ root, rootMargin: "300px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

<div class="result-grid">
	<h4 class="section-heading">
		Full Copernicus catalog
		{#if totalCount > 0}({results.length} of {totalCount}){/if}
	</h4>
	{#if samplePoints.length > 0 && hiddenCount > 0}
		<p class="coverage-banner">
			{hiddenCount} layer{hiddenCount === 1 ? "" : "s"}
			{hideFlagged ? "hidden" : "flagged"} - no data found at your selected area.
			<button type="button" class="coverage-toggle" onclick={() => (hideFlagged = !hideFlagged)}>
				{hideFlagged ? "Show anyway" : "Hide these"}
			</button>
		</p>
	{/if}
	{#if loading}
		<p class="status-text">Searching the live Copernicus Marine catalog…</p>
	{:else if errored}
		<p class="status-text status-error">Couldn't reach the Copernicus catalog service.</p>
	{:else if results.length === 0}
		<p class="status-text">No layers match these filters.</p>
	{:else if sort === "relevance"}
		{#each groups as group (group.productId)}
			<div class="product-group">
				<span class="product-group-label">{group.productId}</span>
				<div class="card-grid" class:list={view === "list"}>
					{#each group.entries as entry (entry.id)}
						<CatalogLayerCard
							{entry}
							active={activeIds.has(entry.id)}
							{view}
							{labelMaps}
							{samplePoints}
							hideIfFlagged={hideFlagged}
							onCoverageStarted={handleCoverageStarted}
							onCoverageChecked={handleCoverageChecked}
							onToggle={() => onToggle(entry.id)}
						/>
					{/each}
				</div>
			</div>
		{/each}
		{#if results.length < totalCount}
			<div class="scroll-sentinel" use:scrollSentinel>
				{#if loadingMore}
					<span class="status-text">Loading more…</span>
				{/if}
			</div>
		{/if}
	{:else}
		<!-- A title sort interleaves products, so no product grouping/label
		     here - see the `groups` derivation's doc comment above. -->
		<div class="card-grid" class:list={view === "list"}>
			{#each results as entry (entry.id)}
				<CatalogLayerCard
					{entry}
					active={activeIds.has(entry.id)}
					{view}
					{labelMaps}
					{samplePoints}
					hideIfFlagged={hideFlagged}
					onCoverageStarted={handleCoverageStarted}
					onCoverageChecked={handleCoverageChecked}
					onToggle={() => onToggle(entry.id)}
				/>
			{/each}
		</div>
		{#if results.length < totalCount}
			<div class="scroll-sentinel" use:scrollSentinel>
				{#if loadingMore}
					<span class="status-text">Loading more…</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.result-grid {
		margin-top: 1.4rem;
		padding-top: 1.2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.section-heading {
		margin: 0 0 0.8rem;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.45);
	}
	.status-text {
		margin: 0;
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.5);
	}
	.status-error {
		color: rgba(255, 138, 138, 0.85);
	}

	.coverage-banner {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.8rem;
		background: rgba(250, 204, 21, 0.08);
		border: 1px solid rgba(250, 204, 21, 0.25);
		border-radius: 8px;
		font-size: 0.78rem;
		color: rgba(250, 204, 21, 0.9);
	}
	.coverage-toggle {
		flex-shrink: 0;
		margin-left: auto;
		padding: 0.2rem 0.7rem;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}
	.coverage-toggle:hover {
		background: rgba(255, 255, 255, 0.16);
	}

	.product-group {
		margin-bottom: 1.2rem;
	}
	.product-group-label {
		display: inline-block;
		margin-bottom: 0.6rem;
		padding: 0.15rem 0.55rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.55);
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}
	.card-grid.list {
		display: flex;
		flex-direction: column;
	}

	.scroll-sentinel {
		display: flex;
		justify-content: center;
		padding: 1rem 0 0.2rem;
		min-height: 1.5rem;
	}
</style>
