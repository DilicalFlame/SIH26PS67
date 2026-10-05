<script lang="ts">
	/**
	 * DataLayersCatalog.svelte
	 *
	 * The "Data layers" picker modal. Two independent sections below the
	 * search box:
	 *  - "Featured": the ten hand-curated layers in data-layers-catalog.ts -
	 *    filtered only by the text query, unaffected by facet selections
	 *    (unchanged behavior from before the facet redesign).
	 *  - The full live Copernicus catalog (~9,628 layers), browsable via
	 *    CatalogFacetFilters (region/domain/variable/product-type checkboxes
	 *    with live counts) and CatalogResultGrid (the actual paginated
	 *    results) - no longer gated behind typing a search term first; text
	 *    query and facet selections are just two more filters passed to the
	 *    same backend endpoint.
	 *
	 * `open` only ever toggles CSS visibility (`.hidden`) on the overlay, not
	 * whether it's in the DOM: the whole subtree (once first opened) stays
	 * mounted for the rest of the page session. It used to be gated by
	 * `{#if open}` directly, which meant Svelte destroyed and recreated
	 * CatalogFacetFilters/CatalogResultGrid - and every bit of their own
	 * internal state (which facet groups were expanded, the fetched results,
	 * scroll position) - every single time the picker was closed and
	 * reopened. Selected facet values/expanded groups are also persisted to
	 * session-store so they survive an actual page reload too, not just a
	 * close/reopen within the same session.
	 */
	import { DATA_LAYERS } from "$lib/tiles/data-layers-catalog";
	import {
		encodeCandidatePolygon,
		fetchWmtsCatalogFacets,
		buildCatalogLabelMaps,
		type WmtsCatalogFilters,
		type WmtsFacetDimension,
		type WmtsFacetGroup,
		type WmtsSortOrder,
	} from "$lib/tiles/wmts-catalog-client";
	import { loadSession, dispatchSessionAction, SessionActionType } from "$lib/state/session-store";
	import { bboxOf, centroidOf } from "$lib/geo/sample-grid";
	import type { FinishedMeasurement } from "$lib/measure/path-measure-tool";
	import CatalogFacetFilters from "$lib/components/CatalogFacetFilters.svelte";
	import CatalogResultGrid from "$lib/components/CatalogResultGrid.svelte";
	import CatalogLayerCard from "$lib/components/CatalogLayerCard.svelte";

	interface Props {
		open: boolean;
		activeIds: Set<string>;
		/** Finished polygon measurements only (not open paths) - see
		 *  +page.svelte's polygonMeasurements derived - for the "Area of
		 *  Interest" facet. */
		polygons: FinishedMeasurement[];
		onAdd: (id: string) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}
	const { open, activeIds, polygons, onAdd, onRemove, onClose }: Props = $props();

	const persisted = loadSession().catalogFilters;

	let query = $state("");
	let regions = $state<Set<string>>(new Set(persisted?.regions));
	let categories = $state<Set<string>>(new Set(persisted?.categories));
	let collections = $state<Set<string>>(new Set(persisted?.collections));
	let friendlyVariableGroups = $state<Set<string>>(new Set(persisted?.friendlyVariableGroups));
	let selectedPolygonIds = $state<Set<string>>(new Set(persisted?.selectedPolygons));
	// Region/Domain are the two dimensions anyone would recognize without
	// Copernicus-specific knowledge - expanded by default the very first
	// time, before anything's been persisted yet.
	let expandedDimensions = $state<Set<WmtsFacetDimension>>(
		new Set((persisted?.expandedDimensions as WmtsFacetDimension[] | undefined) ?? ["region", "category"]),
	);

	// Mirrors CatalogResultGrid's own coverage-check progress purely so the
	// bar can be pinned to the header's divider (always visible) instead of
	// scrolling away with the results it's describing - see the header
	// comment on CatalogResultGrid's onCoverageProgress prop.
	let coverageProgress = $state<{ pending: number; fraction: number } | null>(null);

	// Has the picker been opened at least once yet - see the header comment:
	// nothing in this modal mounts (and CatalogFacetFilters/CatalogResultGrid
	// don't start fetching) until the user actually opens it the first time.
	let hasOpenedOnce = $state(false);
	$effect(() => {
		if (open) hasOpenedOnce = true;
	});

	// Always sent in full (not just the selected ones) - the facets endpoint
	// needs every candidate to compute a per-polygon count, selected or not
	// (see wmts-catalog-client.ts's WmtsCatalogFilters doc comment).
	const candidatePolygons = $derived(polygons.map((p) => encodeCandidatePolygon(p.id, bboxOf(p.positions))));

	// One representative point per SELECTED polygon (not every candidate) -
	// feeds CatalogResultGrid/CatalogLayerCard's lazy per-card coverage
	// check, which catches products whose declared bbox is far wider than
	// their real data (see copernicus-coverage-check.ts). Empty whenever no
	// polygon filter is active, which is also the check's own off-switch.
	const selectedPolygonSamplePoints = $derived(
		polygons
			.filter((p) => selectedPolygonIds.has(p.id))
			.map((p) => {
				const [lon, lat] = centroidOf(p.positions);
				return { lon, lat };
			}),
	);

	const filters = $derived<WmtsCatalogFilters>({
		query: query.trim() || undefined,
		regions: regions.size > 0 ? [...regions] : undefined,
		categories: categories.size > 0 ? [...categories] : undefined,
		collections: collections.size > 0 ? [...collections] : undefined,
		friendlyVariableGroups: friendlyVariableGroups.size > 0 ? [...friendlyVariableGroups] : undefined,
		candidatePolygons: candidatePolygons.length > 0 ? candidatePolygons : undefined,
		selectedPolygons: selectedPolygonIds.size > 0 ? [...selectedPolygonIds] : undefined,
	});

	// One effect, one owner of the whole persisted shape - see the header
	// comment on why this must never be split across two dispatch sites.
	// Skips the very first run (mount) so opening the picker with nothing
	// changed yet doesn't immediately rewrite localStorage with the same data.
	let isFirstPersistRun = true;
	$effect(() => {
		const snapshot = {
			expandedDimensions: [...expandedDimensions],
			regions: [...regions],
			categories: [...categories],
			collections: [...collections],
			friendlyVariableGroups: [...friendlyVariableGroups],
			selectedPolygons: [...selectedPolygonIds],
		};
		if (isFirstPersistRun) {
			isFirstPersistRun = false;
			return;
		}
		dispatchSessionAction({ type: SessionActionType.CatalogFiltersChanged, payload: snapshot });
	});

	function toggleFacetValue(dimension: WmtsFacetDimension, value: string): void {
		const current =
			dimension === "region"
				? regions
				: dimension === "category"
					? categories
					: dimension === "collection"
						? collections
						: dimension === "polygon"
							? selectedPolygonIds
							: friendlyVariableGroups;
		const next = new Set(current);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		if (dimension === "region") regions = next;
		else if (dimension === "category") categories = next;
		else if (dimension === "collection") collections = next;
		else if (dimension === "polygon") selectedPolygonIds = next;
		else friendlyVariableGroups = next;
	}

	function toggleExpandedDimension(dimension: WmtsFacetDimension): void {
		const next = new Set(expandedDimensions);
		if (next.has(dimension)) next.delete(dimension);
		else next.add(dimension);
		expandedDimensions = next;
	}

	function clearAllFacets(): void {
		regions = new Set();
		categories = new Set();
		collections = new Set();
		friendlyVariableGroups = new Set();
		selectedPolygonIds = new Set();
	}

	const filteredFeatured = $derived(
		DATA_LAYERS.filter((entry) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return (
				entry.title.toLowerCase().includes(q) ||
				entry.description.toLowerCase().includes(q) ||
				(entry.variable?.toLowerCase().includes(q) ?? false)
			);
		}),
	);
	// The curated Featured set has no domain classification of its own (see
	// data-layers-catalog.ts - it's a flat hand-picked ten, never faceted),
	// so it can't honor a category selection at all. Pinning all ten above
	// the results while "Sea Ice" is the active tab would look broken (a
	// pile of unrelated layers the tab claims not to be showing) - hiding
	// the section outright while any domain filter is active is the
	// honest behavior instead of a section that silently ignores the filter.
	const showFeatured = $derived(filteredFeatured.length > 0 && categories.size === 0);

	function handleCardAction(id: string): void {
		if (activeIds.has(id)) onRemove(id);
		else onAdd(id);
	}

	// Live facet counts for CatalogFacetFilters' sidebar checkboxes - lives
	// here (not inside that component) so a future consumer of the same
	// counts doesn't need its own independent fetch. Same debounce and
	// "keep stale counts on a transient failure" behavior the fetch had
	// before it moved.
	const FACET_FETCH_DEBOUNCE_MS = 350;
	let facetGroups = $state<WmtsFacetGroup[]>([]);
	let facetsLoading = $state(false);
	$effect(() => {
		const snapshot: WmtsCatalogFilters = {
			query: filters.query,
			collections: filters.collections,
			regions: filters.regions,
			categories: filters.categories,
			friendlyVariableGroups: filters.friendlyVariableGroups,
			candidatePolygons: filters.candidatePolygons,
			selectedPolygons: filters.selectedPolygons,
		};
		const controller = new AbortController();
		facetsLoading = true;
		const timer = setTimeout(async () => {
			try {
				const { facets } = await fetchWmtsCatalogFacets(snapshot, { signal: controller.signal });
				facetGroups = facets;
			} catch {
				// Leave whatever counts were last shown rather than blanking
				// the sidebar/tabs on a transient failure.
			} finally {
				if (!controller.signal.aborted) facetsLoading = false;
			}
		}, FACET_FETCH_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
	const catalogLabelMaps = $derived(buildCatalogLabelMaps(facetGroups));

	// Grid vs. list layout for both the Featured section and the full
	// catalog's result cards - purely a display preference, not persisted
	// (unlike the facet selections above): a leftover "list" view silently
	// changing how the very next session's picker looks is more surprising
	// than a fresh session just defaulting back to grid.
	let viewMode = $state<"grid" | "list">("grid");

	// Ordering for the full catalog's results only - the curated Featured
	// section is a fixed ten, never re-ordered. "Relevance" is the backend's
	// own default order (grouped by product/dataset/variable - see
	// wmts_catalog.py); the other two ask it to sort by title instead. Not
	// persisted, for the same reason viewMode above isn't.
	let sortOrder = $state<WmtsSortOrder>("relevance");
</script>

{#if hasOpenedOnce}
	<div class="catalog-overlay" class:hidden={!open} role="presentation" onclick={onClose}>
		<div
			class="catalog-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Data layers"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') onClose();
			}}
		>
			<div class="catalog-header">
				<div class="catalog-heading">
					<h2>Data layers</h2>
					<p>Choose data layers to add to the map.</p>
				</div>
				<label class="search-box">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4.35-4.35" />
					</svg>
					<input
						type="text"
						placeholder="Search curated layers, or the full Copernicus catalog"
						bind:value={query}
					/>
				</label>
				<button type="button" class="close-btn" onclick={onClose} aria-label="Close">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
				{#if coverageProgress}
					<div
						class="header-progress-track"
						role="progressbar"
						aria-valuenow={Math.round(coverageProgress.fraction * 100)}
						aria-label="Checking layers for data in your selected area"
					>
						<div class="header-progress-fill" style="width: {Math.round(coverageProgress.fraction * 100)}%"></div>
					</div>
				{/if}
			</div>

			<div class="catalog-content">
				<CatalogFacetFilters
					{filters}
					{expandedDimensions}
					{facetGroups}
					loading={facetsLoading}
					{polygons}
					onToggleValue={toggleFacetValue}
					onToggleExpanded={toggleExpandedDimension}
					onClearAll={clearAllFacets}
				/>

				<div class="catalog-main">
					<div class="browse-row">
						<label class="sort-control">
							<span>Sort by</span>
							<select bind:value={sortOrder}>
								<option value="relevance">Relevance</option>
								<option value="titleAsc">Name (A–Z)</option>
								<option value="titleDesc">Name (Z–A)</option>
							</select>
						</label>
						<div class="view-toggle" role="group" aria-label="Layout">
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === "grid"}
								onclick={() => (viewMode = "grid")}
								aria-pressed={viewMode === "grid"}
								aria-label="Grid view"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect x="3" y="3" width="7" height="7" rx="1.5" />
									<rect x="14" y="3" width="7" height="7" rx="1.5" />
									<rect x="3" y="14" width="7" height="7" rx="1.5" />
									<rect x="14" y="14" width="7" height="7" rx="1.5" />
								</svg>
								Grid
							</button>
							<button
								type="button"
								class="view-btn"
								class:active={viewMode === "list"}
								onclick={() => (viewMode = "list")}
								aria-pressed={viewMode === "list"}
								aria-label="List view"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
								</svg>
								List
							</button>
						</div>
					</div>

					{#if showFeatured}
						<div class="featured-section">
							<h4 class="section-heading">Featured</h4>
							<div class="card-grid" class:list={viewMode === "list"}>
								{#each filteredFeatured as entry (entry.id)}
									<CatalogLayerCard
										{entry}
										active={activeIds.has(entry.id)}
										view={viewMode}
										labelMaps={catalogLabelMaps}
										onToggle={() => handleCardAction(entry.id)}
									/>
								{/each}
							</div>
						</div>
					{/if}

					<CatalogResultGrid
						{filters}
						{activeIds}
						view={viewMode}
						sort={sortOrder}
						labelMaps={catalogLabelMaps}
						samplePoints={selectedPolygonSamplePoints}
						onCoverageProgress={(p) => (coverageProgress = p)}
						onToggle={handleCardAction}
					/>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.catalog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(8, 9, 12, 0.72);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 40;
		padding: 2rem 1.25rem;
	}
	.catalog-overlay.hidden {
		display: none;
	}

	.catalog-modal {
		width: min(1140px, 100%);
		max-height: calc(100dvh - 4rem);
		display: flex;
		flex-direction: column;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.65),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: #ffffff;
		font-family: inherit;
		overflow: hidden;
	}

	.catalog-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 0 0 auto;
		padding: 1.4rem 1.6rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	/* The header never scrolls away (unlike CatalogResultGrid's own content),
	   so a coverage-check's progress lives here - sitting exactly on the
	   header's own bottom border, becoming a visible fill instead of a
	   separate element that would shift layout or need its own home. */
	.header-progress-track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		overflow: hidden;
	}
	.header-progress-fill {
		height: 100%;
		background: rgba(59, 130, 246, 0.85);
		transition: width 200ms ease;
	}

	.catalog-heading h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}
	.catalog-heading p {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.search-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
	}
	.search-box svg {
		width: 1rem;
		height: 1rem;
		color: rgba(255, 255, 255, 0.45);
		flex-shrink: 0;
	}
	.search-box input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.85rem;
	}
	.search-box input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.1rem;
		height: 2.1rem;
		flex-shrink: 0;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}
	.close-btn svg {
		width: 1.1rem;
		height: 1.1rem;
	}

	.catalog-content {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
	}

	.catalog-main {
		flex: 1 1 auto;
		min-width: 0;
		overflow-y: auto;
		padding: 1.4rem 1.6rem 1.8rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}
	.catalog-main::-webkit-scrollbar {
		width: 6px;
	}
	.catalog-main::-webkit-scrollbar-track {
		background: transparent;
	}
	.catalog-main::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.browse-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.1rem;
	}

	.sort-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.55);
	}
	.sort-control select {
		padding: 0.35rem 1.9rem 0.35rem 0.75rem;
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.55)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
				right 0.5rem center / 0.9rem no-repeat,
			rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		appearance: none;
		-webkit-appearance: none;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.sort-control select:hover {
		border-color: rgba(255, 255, 255, 0.25);
	}
	.sort-control select:focus-visible {
		outline: 2px solid rgba(59, 130, 246, 0.6);
		outline-offset: 1px;
	}
	/* Dark option rows - selects render these with the OS's own light theme
	   otherwise, since the color-scheme most browsers assume by default is
	   light unless told otherwise. */
	.sort-control select option {
		background: #16171c;
		color: #ffffff;
	}

	.view-toggle {
		display: flex;
		flex-shrink: 0;
		gap: 0.15rem;
		padding: 0.2rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
	}
	.view-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.55);
		font-family: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 130ms ease,
			color 130ms ease;
	}
	.view-btn svg {
		width: 0.95rem;
		height: 0.95rem;
	}
	.view-btn:hover {
		color: rgba(255, 255, 255, 0.85);
	}
	.view-btn.active {
		background: rgba(59, 130, 246, 0.28);
		color: #ffffff;
	}

	.featured-section {
		margin-bottom: 1rem;
	}

	.section-heading {
		margin: 0 0 0.8rem;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.45);
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}
	/* List mode: one column of full-width row cards instead of a tiled grid
	   - CatalogLayerCard itself switches to a horizontal thumbnail+body
	   layout when it receives view="list" (see that component), this just
	   stops the grid from also tiling multiple such rows side by side. */
	.card-grid.list {
		display: flex;
		flex-direction: column;
	}
</style>
