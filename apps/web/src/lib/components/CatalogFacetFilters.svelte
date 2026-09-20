<script lang="ts">
	/**
	 * CatalogFacetFilters.svelte
	 *
	 * The picker's facet sidebar - region/domain/variable-group/product-type
	 * checkboxes with live counts, backed by GET /api/v1/catalog/wmts-layers
	 * /facets (apps/api/app/api/v1/wmts_catalog.py). Each dimension's own
	 * option counts are computed server-side with every *other* active
	 * filter applied but not that dimension's own selections - real
	 * faceted-search semantics, so picking one region doesn't make every
	 * other region's count (and thus the ability to switch to it) disappear.
	 *
	 * Per-dimension expand/collapse state is owned by the parent
	 * (DataLayersCatalog.svelte), not here - a single owner for every piece
	 * of "what the user set up in this picker" is what makes persisting it
	 * as one PersistedCatalogFilters object (session-store.ts) safe; if this
	 * component and the parent each owned/dispatched a different slice, one
	 * write could clobber the other's fields since dispatchSessionAction's
	 * CatalogFiltersChanged action replaces the whole object, not merges it.
	 *
	 * The facet fetch itself (debounced GET .../facets) lives in the parent
	 * instead of here, so a future consumer of the same counts (elsewhere in
	 * the picker) can share this one fetch rather than duplicating it.
	 */
	import type { WmtsCatalogFilters, WmtsFacetDimension, WmtsFacetGroup } from "$lib/tiles/wmts-catalog-client";
	import type { FinishedMeasurement } from "$lib/measure/path-measure-tool";

	interface Props {
		filters: WmtsCatalogFilters;
		expandedDimensions: Set<WmtsFacetDimension>;
		facetGroups: WmtsFacetGroup[];
		loading: boolean;
		/** For displaying each polygon's real name ("Polygon 2") - the
		 *  backend only knows these shapes' ids and bboxes, never their
		 *  labels (see _polygon_facet_group's doc comment), so this
		 *  component substitutes the real label in locally. */
		polygons: FinishedMeasurement[];
		onToggleValue: (dimension: WmtsFacetDimension, value: string) => void;
		onToggleExpanded: (dimension: WmtsFacetDimension) => void;
		onClearAll: () => void;
	}
	const {
		filters,
		expandedDimensions,
		facetGroups,
		loading,
		polygons,
		onToggleValue,
		onToggleExpanded,
		onClearAll,
	}: Props = $props();

	const DIMENSION_LABELS: Record<WmtsFacetDimension, string> = {
		region: "Region",
		polygon: "Area of Interest",
		category: "Domain",
		friendlyVariableGroup: "Variable",
		collection: "Product Type",
	};
	const DIMENSION_ORDER: WmtsFacetDimension[] = [
		"region",
		"polygon",
		"category",
		"friendlyVariableGroup",
		"collection",
	];

	const polygonLabelById = $derived(new Map(polygons.map((p) => [p.id, p.label])));

	function groupFor(dimension: WmtsFacetDimension): WmtsFacetGroup | undefined {
		return facetGroups.find((g) => g.dimension === dimension);
	}

	function selectedValues(dimension: WmtsFacetDimension): string[] {
		if (dimension === "region") return filters.regions ?? [];
		if (dimension === "category") return filters.categories ?? [];
		if (dimension === "collection") return filters.collections ?? [];
		if (dimension === "polygon") return filters.selectedPolygons ?? [];
		return filters.friendlyVariableGroups ?? [];
	}

	function optionLabel(dimension: WmtsFacetDimension, backendLabel: string, value: string): string {
		if (dimension === "polygon") return polygonLabelById.get(value) ?? backendLabel;
		return backendLabel;
	}

	const activeFilterCount = $derived(
		(filters.regions?.length ?? 0) +
			(filters.categories?.length ?? 0) +
			(filters.collections?.length ?? 0) +
			(filters.friendlyVariableGroups?.length ?? 0) +
			(filters.selectedPolygons?.length ?? 0),
	);
</script>

<div class="facet-sidebar">
	<div class="facet-sidebar-header">
		<span>Filters</span>
		{#if activeFilterCount > 0}
			<button type="button" class="clear-btn" onclick={onClearAll}>Clear ({activeFilterCount})</button>
		{/if}
	</div>

	<div class="facet-groups">
		{#each DIMENSION_ORDER as dimension (dimension)}
			{@const group = groupFor(dimension)}
			{@const expanded = expandedDimensions.has(dimension)}
			{@const selected = new Set(selectedValues(dimension))}
			<div class="facet-group">
				<button
					type="button"
					class="facet-group-header"
					onclick={() => onToggleExpanded(dimension)}
					aria-expanded={expanded}
				>
					<span>{DIMENSION_LABELS[dimension]}</span>
					<svg
						class="chevron"
						class:rotated={expanded}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
				{#if expanded}
					<div class="facet-options">
						{#if dimension === "polygon" && polygons.length === 0}
							<p class="facet-empty">Draw a shape on the map to filter by area.</p>
						{:else if !group || group.values.length === 0}
							<p class="facet-empty">{loading ? "Loading…" : "No options"}</p>
						{:else}
							{#each group.values as option (option.value)}
								<label class="facet-option">
									<input
										type="checkbox"
										checked={selected.has(option.value)}
										onchange={() => onToggleValue(dimension, option.value)}
									/>
									<span class="facet-option-label">{optionLabel(dimension, option.label, option.value)}</span>
									<span class="facet-option-count">{option.count}</span>
								</label>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.facet-sidebar {
		flex: 0 0 220px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		overflow-y: auto;
		/* Thin, dark, theme-matching - same convention as
		   ActiveLayersPanel.svelte's .layer-list scrollbar. */
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}
	.facet-sidebar::-webkit-scrollbar {
		width: 6px;
	}
	.facet-sidebar::-webkit-scrollbar-track {
		background: transparent;
	}
	.facet-sidebar::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.facet-sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		padding: 1rem 1rem 0.6rem;
		font-size: 0.76rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.55);
	}

	.clear-btn {
		background: transparent;
		border: none;
		color: rgba(191, 219, 254, 0.95);
		font-family: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: none;
		letter-spacing: normal;
		cursor: pointer;
		padding: 0;
	}
	.clear-btn:hover {
		text-decoration: underline;
	}

	.facet-groups {
		display: flex;
		flex-direction: column;
		padding-bottom: 1rem;
	}

	.facet-group {
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.facet-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.7rem 1rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.9);
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.facet-group-header:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.chevron {
		width: 0.85rem;
		height: 0.85rem;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.45);
		transition: transform 150ms ease;
	}
	.chevron.rotated {
		transform: rotate(180deg);
	}

	.facet-options {
		/* No max-height/overflow of its own on purpose - nesting a scroll
		   region inside .facet-sidebar's own scroll region is exactly what
		   produced a separate scrollbar per expanded group. The whole
		   sidebar scrolls as one unit instead; no single group has enough
		   options (at most 18) to need its own independent viewport. */
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0 0.6rem 0.7rem 1rem;
	}

	.facet-empty {
		margin: 0;
		padding: 0.2rem 0.4rem 0.4rem;
		font-size: 0.76rem;
		color: rgba(255, 255, 255, 0.4);
		font-style: italic;
	}

	.facet-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
	}
	.facet-option:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	/* Themed checkbox - native `accent-color` renders each browser's own
	   stock checkbox shape (square corners, different sizing per platform),
	   which sits oddly against this panel's rounded glassy pill/badge
	   language everywhere else. `appearance: none` clears that entirely and
	   the box is painted from scratch: a soft rounded square that matches
	   `.facet-group-header`'s hover tint at rest, and fills solid blue with
	   an inline checkmark once `:checked` - same accent blue used for the
	   "Add" button and active tab elsewhere in this picker, so a checked
	   filter reads as "the same kind of active" as an added layer. */
	.facet-option input {
		appearance: none;
		-webkit-appearance: none;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		border-radius: 5px;
		border: 1.5px solid rgba(255, 255, 255, 0.25);
		background: rgba(255, 255, 255, 0.04);
		cursor: pointer;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}
	.facet-option input:hover {
		border-color: rgba(255, 255, 255, 0.45);
	}
	.facet-option input:checked {
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.2l3 3 6-6.4'/%3E%3C/svg%3E")
				center / 65% no-repeat,
			rgb(59, 130, 246);
		border-color: rgb(59, 130, 246);
	}
	.facet-option input:focus-visible {
		outline: 2px solid rgba(59, 130, 246, 0.6);
		outline-offset: 1px;
	}
	.facet-option-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.facet-option-count {
		flex-shrink: 0;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
