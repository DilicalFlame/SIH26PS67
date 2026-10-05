<script lang="ts">
	import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";
	import { wmtsThumbnailUrl, type CatalogLabelMaps } from "$lib/tiles/wmts-catalog-client";
	import { hasDataNearPoints, type SamplePoint } from "$lib/copernicus/copernicus-coverage-check";
	import { categoryMeta } from "$lib/tiles/category-icons";

	interface Props {
		entry: DataLayerCatalogEntry;
		active: boolean;
		/** Grid (tiled card) vs. list (full-width row) - see
		 *  DataLayersCatalog.svelte's view-mode toggle. Defaults to grid so
		 *  nothing else that renders this card needs to pass it. */
		view?: "grid" | "list";
		/** Human labels for the domain/region/product-type tags below -
		 *  see wmts-catalog-client.ts's buildCatalogLabelMaps. Only a
		 *  dynamically-fetched entry has the raw keys to look up (see
		 *  entry.restoreDescriptor below); omitted entirely for a curated
		 *  Featured card, which has no facet classification of its own. */
		labelMaps?: CatalogLabelMaps;
		/** Non-empty only when a polygon "Area of Interest" filter is active -
		 *  see the coverage-check effect below. Left empty (the default) for
		 *  the always-shown "Featured" section, which the polygon filter
		 *  never applies to. */
		samplePoints?: SamplePoint[];
		/** User opt-in (off by default, see CatalogResultGrid's "Hide flagged
		 *  results" toggle) to collapse this card once its own check confirms
		 *  no data, instead of showing it dimmed with a warning. */
		hideIfFlagged?: boolean;
		/** Fired the moment this card kicks off a check - lets CatalogResultGrid
		 *  show "checking N of M" progress. Purely observational, like
		 *  onCoverageChecked below; this component's own render decision never
		 *  depends on the parent. */
		onCoverageStarted?: (id: string) => void;
		/** Reports this card's own check result upward once resolved, purely
		 *  so CatalogResultGrid can show an aggregate "N hidden" count - this
		 *  component's own render decision doesn't depend on the parent at all. */
		onCoverageChecked?: (id: string, hasData: boolean) => void;
		onToggle: () => void;
	}
	const {
		entry,
		active,
		view = "grid",
		labelMaps,
		samplePoints = [],
		hideIfFlagged = false,
		onCoverageStarted,
		onCoverageChecked,
		onToggle,
	}: Props = $props();

	// The leading colored domain label above the title (see the reference
	// this redesign was inspired by - a short, icon-tagged "Temperature" /
	// "Salinity" style label per card). Only a dynamically-fetched entry
	// carries the raw descriptor this needs (see copernicusWmtsLayerToEntry -
	// restoreDescriptor is the full WmtsLayerDescriptor, category/region/
	// collection included); a curated Featured entry falls back to its own
	// `variable` string with the generic icon, since it has no facet
	// classification of its own to draw on.
	const descriptor = $derived(entry.restoreDescriptor);
	const domainMeta = $derived(categoryMeta(descriptor?.category));
	// A curated entry's own `variable` is a raw snake_case code (e.g.
	// "sea_surface_height") never meant for display as-is - every other
	// source of this label (the two facet-label lookups above it) is
	// already a proper display string, so only this fallback needs
	// humanizing.
	function humanize(code: string): string {
		return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	}
	const domainLabel = $derived(
		(descriptor && labelMaps?.friendlyVariableGroup.get(descriptor.friendlyVariableGroup ?? "")) ||
			(descriptor && labelMaps?.category.get(descriptor.category)) ||
			(entry.variable ? humanize(entry.variable) : null) ||
			"Layer",
	);

	// The tag row below the description - region, product type, and a
	// depth/time-coverage badge, all sourced from data this entry already
	// carries (no extra fetch). Undefined/empty pieces are just omitted
	// rather than shown as "Unknown" - a curated entry with no descriptor
	// simply renders fewer tags instead of fabricated ones.
	const regionLabel = $derived(
		descriptor && labelMaps ? (labelMaps.region.get(descriptor.region) ?? descriptor.region) : null,
	);
	const collectionLabel = $derived(
		descriptor && labelMaps ? (labelMaps.collection.get(descriptor.collection) ?? descriptor.collection) : null,
	);
	const depthLabel = $derived.by((): string | null => {
		const levels = descriptor?.elevation?.levelCount ?? 0;
		if (!descriptor) return null;
		return levels > 1 ? `${levels} depths` : "Surface";
	});
	const timeRangeLabel = $derived.by((): string | null => {
		if (entry.timeStart && entry.timeEnd) {
			const startYear = new Date(entry.timeStart).getFullYear();
			const endYear = new Date(entry.timeEnd).getFullYear();
			if (Number.isNaN(startYear) || Number.isNaN(endYear)) return null;
			return startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;
		}
		if (entry.timeValues && entry.timeValues.length > 0) return `${entry.timeValues.length} dates`;
		return null;
	});

	// One glyph per tag *kind* (as opposed to category-icons.ts's one glyph
	// per domain *value*) — region/depth/time/product-type tags all share
	// this component's plain pill styling, so a small leading icon is what
	// tells them apart at a glance, same idea as the reference's tag row.
	const TAG_ICONS = {
		region: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.3 2.5 3.6 5.5 3.6 9s-1.3 6.5-3.6 9c-2.3-2.5-3.6-5.5-3.6-9s1.3-6.5 3.6-9Z",
		depth: "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
		time: "M8 2.5v3M16 2.5v3M4 8.5h16M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z",
		collection:
			"M4 5c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2ZM4 5v6c0 1.1 3.6 2 8 2s8-.9 8-2V5M4 11v6c0 1.1 3.6 2 8 2s8-.9 8-2v-6",
	};

	// Hybrid rendering strategy for the full-catalog browse (see
	// CatalogResultGrid.svelte's header comment): the card itself stays
	// mounted once rendered (cheap - just text), but its thumbnail <img>
	// mounts/unmounts based on scroll proximity, so browsing thousands of
	// results in one session doesn't accumulate thousands of concurrent
	// GetTile requests/decoded images - only ones near the viewport are ever
	// actually live. Starts mounted so the very first page doesn't
	// flash-then-load.
	let thumbnailMounted = $state(true);
	let thumbnailBroken = $state(false);
	const thumbUrl = $derived(thumbnailBroken ? null : wmtsThumbnailUrl(entry));

	function thumbVisibility(node: HTMLElement) {
		// Root is whichever ancestor actually scrolls - set on the modal's
		// content area by DataLayersCatalog.svelte/CatalogResultGrid.svelte,
		// found by class name since this card doesn't otherwise know (or
		// need to know) which component owns that container.
		const root = node.closest(".catalog-main");
		const observer = new IntersectionObserver(
			([intersectionEntry]) => {
				thumbnailMounted = intersectionEntry?.isIntersecting ?? thumbnailMounted;
			},
			{ root, rootMargin: "600px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}

	// A bbox-only polygon filter can't tell a genuinely sparse product
	// (declared coverage far wider than its real data) from a dense one -
	// this reuses the same scroll-visibility signal above to run one live
	// GetFeatureInfo check per card, only while a polygon filter is actually
	// selected (samplePoints is non-empty). Never blocks adding the layer -
	// a single point can miss real coverage elsewhere in the drawn area, so
	// a "no data here" result is surfaced as a soft warning, not a gate.
	let noDataConfirmed = $state(false);
	// Tracks which `samplePoints` array this card has already started/
	// resolved a check for - NOT reactive state on purpose. Once resolved, a
	// later intersection-observer flip (e.g. a sibling card collapsing via
	// the "Hide these" toggle reflows the grid and briefly reports this card
	// as out of view too) must not throw the settled answer away, so this
	// only gates *starting a new* check for a genuinely different area -
	// staleness on resolution is checked against it too, so a slow response
	// for an area the user has since changed away from can't clobber a newer
	// one that resolved first.
	let checkedForPoints: SamplePoint[] | undefined;
	$effect(() => {
		if (samplePoints.length === 0) {
			noDataConfirmed = false;
			checkedForPoints = undefined;
			return;
		}
		if (!thumbnailMounted || checkedForPoints === samplePoints) return;
		const pointsForThisCheck = samplePoints;
		checkedForPoints = pointsForThisCheck;
		onCoverageStarted?.(entry.id);
		hasDataNearPoints(entry, pointsForThisCheck).then((hasData) => {
			if (checkedForPoints !== pointsForThisCheck) return; // superseded
			noDataConfirmed = !hasData;
			onCoverageChecked?.(entry.id, hasData);
		});
	});
</script>

{#snippet thumb()}
	{#if thumbnailMounted && thumbUrl}
		<img src={thumbUrl} alt="" loading="lazy" onerror={() => (thumbnailBroken = true)} />
	{:else}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v18M3 12h18" />
			<circle cx="12" cy="12" r="9" />
		</svg>
	{/if}
{/snippet}

{#snippet domainPill()}
	<span class="tag domain-tag" style="color: {domainMeta.color}; border-color: {domainMeta.color}44">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d={domainMeta.icon} />
		</svg>
		{domainLabel}
	</span>
{/snippet}

{#snippet tag(icon: string, text: string, tooltip?: string)}
	<span class="tag" title={tooltip}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d={icon} />
		</svg>
		{text}
	</span>
{/snippet}

{#snippet infoButton()}
	{#if entry.attribution}
		<!-- Hover-only for now (native `title` tooltip) - a future click
		     handler can open a fuller info panel without changing this
		     markup, per the user's explicit "no click behavior yet" ask. -->
		<button type="button" class="info-btn" title={entry.attribution} aria-label="Data source: {entry.attribution}">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="12" cy="12" r="9" />
				<path d="M12 11v5M12 8h.01" />
			</svg>
		</button>
	{/if}
{/snippet}

{#if view === "list"}
	<div
		class="layer-row"
		class:no-data-warning={noDataConfirmed}
		class:collapsed={noDataConfirmed && hideIfFlagged}
		use:thumbVisibility
	>
		<label class="row-check">
			<input type="checkbox" checked={active} onchange={onToggle} aria-label="Toggle {entry.title} on the map" />
		</label>
		<div class="row-thumb">{@render thumb()}</div>
		<div class="row-main">
			<h3>{entry.title}</h3>
			<p>{entry.description}</p>
			<div class="tag-row">
				{@render domainPill()}
				{#if regionLabel}{@render tag(TAG_ICONS.region, regionLabel)}{/if}
				{#if depthLabel}{@render tag(TAG_ICONS.depth, depthLabel)}{/if}
				{#if collectionLabel}{@render tag(TAG_ICONS.collection, collectionLabel, collectionLabel)}{/if}
			</div>
			{#if noDataConfirmed}
				<p class="no-data-note">No data found at your selected area - may still be worth checking.</p>
			{/if}
		</div>
		<div class="row-meta">
			{#if timeRangeLabel}
				<span class="meta-line">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d={TAG_ICONS.time} />
					</svg>
					<span class="meta-text">{timeRangeLabel}</span>
				</span>
			{/if}
		</div>
		{@render infoButton()}
	</div>
{:else}
	<div
		class="layer-card"
		class:no-data-warning={noDataConfirmed}
		class:collapsed={noDataConfirmed && hideIfFlagged}
		use:thumbVisibility
	>
		<div class="card-thumb">
			{@render thumb()}
			<button type="button" class="add-btn" class:added={active} onclick={onToggle}>
				{active ? "Added" : "Add"}
			</button>
		</div>
		<div class="card-body">
			<div class="body-head">
				<span class="domain-label" style="color: {domainMeta.color}">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d={domainMeta.icon} />
					</svg>
					{domainLabel}
				</span>
				{@render infoButton()}
			</div>
			<h3>{entry.title}</h3>
			<p>{entry.description}</p>
			{#if regionLabel || collectionLabel || depthLabel || timeRangeLabel}
				<div class="tag-row">
					{#if regionLabel}{@render tag(TAG_ICONS.region, regionLabel)}{/if}
					{#if depthLabel}{@render tag(TAG_ICONS.depth, depthLabel)}{/if}
					{#if timeRangeLabel}{@render tag(TAG_ICONS.time, timeRangeLabel)}{/if}
					{#if collectionLabel}{@render tag(TAG_ICONS.collection, collectionLabel, collectionLabel)}{/if}
				</div>
			{/if}
			{#if noDataConfirmed}
				<p class="no-data-note">No data found at your selected area - may still be worth checking.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.layer-card {
		position: relative;
		display: flex;
		flex-direction: column;
		/* Every card in the grid is the same height regardless of content
		   length - CSS Grid already sizes a row to its tallest item, and
		   clamping title/description below fixes the actual cause (jaggedly
		   different natural heights driven by variable-length text) rather
		   than the symptom. */
		height: 100%;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
		transition: border-color 130ms ease;
	}
	.layer-card:hover {
		border-color: rgba(255, 255, 255, 0.18);
	}

	/* List view: one full-width row per layer - a themed checkbox, a small
	   square thumbnail, the title/description/tags filling the middle, a
	   right-aligned meta column (source + date coverage), then the same
	   Add/Added button used elsewhere, back in normal flow (not the grid's
	   floating overlay - a full-width row has no need to reclaim height by
	   floating it). Mirrors the reference layout the user supplied. */
	.layer-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		transition: border-color 130ms ease;
	}
	.layer-row:hover {
		border-color: rgba(255, 255, 255, 0.18);
	}
	.layer-row.no-data-warning {
		opacity: 0.55;
	}
	.layer-row.collapsed {
		display: none;
	}

	.row-check {
		display: flex;
		flex-shrink: 0;
		cursor: pointer;
	}
	/* Same themed checkbox treatment as CatalogFacetFilters.svelte's sidebar
	   filters - one checkbox look across the whole picker. */
	.row-check input {
		appearance: none;
		-webkit-appearance: none;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 5px;
		border: 1.5px solid rgba(255, 255, 255, 0.25);
		background: rgba(255, 255, 255, 0.04);
		cursor: pointer;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}
	.row-check input:hover {
		border-color: rgba(255, 255, 255, 0.45);
	}
	.row-check input:checked {
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.2l3 3 6-6.4'/%3E%3C/svg%3E")
				center / 65% no-repeat,
			rgb(59, 130, 246);
		border-color: rgb(59, 130, 246);
	}

	.row-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		flex-shrink: 0;
		border-radius: 8px;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(20, 20, 25, 0.4));
		color: rgba(255, 255, 255, 0.5);
		overflow: hidden;
	}
	.row-thumb svg {
		width: 1.3rem;
		height: 1.3rem;
	}
	.row-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1 1 auto;
		min-width: 0;
	}
	.row-main h3 {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-main p {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.35;
		color: rgba(255, 255, 255, 0.55);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		flex-shrink: 0;
		width: 11rem;
		overflow: hidden;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.45);
		text-align: right;
	}
	.meta-line {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.3rem;
		width: 100%;
		min-width: 0;
	}
	.meta-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta-line svg {
		width: 0.8rem;
		height: 0.8rem;
		flex-shrink: 0;
	}

	.card-thumb {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 90px;
		flex-shrink: 0;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(20, 20, 25, 0.4));
		color: rgba(255, 255, 255, 0.5);
		overflow: hidden;
	}
	.card-thumb svg {
		width: 2rem;
		height: 2rem;
	}
	.card-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		/* A single coarse (zoom-level-2) GetTile scaled up to fill the
		   thumbnail - smoothing it looks far better than the browser's
		   default pixelated upscale for a preview this small. */
		image-rendering: auto;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem;
		flex: 1 1 auto;
	}

	.domain-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.76rem;
		font-weight: 700;
		/* `color` set inline per-card from category-icons.ts's palette -
		   this just sizes/positions the icon to match that text color. */
	}
	.domain-label svg {
		width: 0.85rem;
		height: 0.85rem;
		flex-shrink: 0;
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.55rem;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.65);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 11rem;
	}
	.tag svg {
		width: 0.7rem;
		height: 0.7rem;
		flex-shrink: 0;
	}
	/* The leading domain pill (list view only - grid keeps it as the
	   standalone .domain-label above the title instead) - same pill shape,
	   colored per-domain via category-icons.ts instead of the neutral
	   tag tint. */
	.domain-tag {
		font-weight: 700;
		background: color-mix(in srgb, currentColor 14%, transparent);
	}

	.card-body h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-body p {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.6);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.body-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}

	.info-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition:
			background 130ms ease,
			color 130ms ease;
	}
	.info-btn:hover {
		background: rgba(59, 130, 246, 0.2);
		color: rgba(255, 255, 255, 0.9);
	}
	.info-btn svg {
		width: 0.85rem;
		height: 0.85rem;
	}

	.layer-card.no-data-warning {
		opacity: 0.55;
	}
	/* Collapsed out of the grid entirely (not just visually hidden) so it
	   doesn't leave a gap - the card stays mounted underneath (see the
	   coverage-check effect's own doc comment) purely so its already-settled
	   result doesn't need re-fetching if the user toggles "Show anyway". */
	.layer-card.collapsed {
		display: none;
	}
	.no-data-note {
		margin: 0;
		font-size: 0.72rem !important;
		line-height: 1.35;
		color: rgba(250, 204, 21, 0.85) !important;
		-webkit-line-clamp: 2 !important;
		line-clamp: 2 !important;
	}

	/* Floats over the thumbnail's top-right corner in grid view (see
	   .layer-card's own position:relative) instead of sitting in the card
	   body's own flow — frees the height a full-width in-flow button used
	   to take at the bottom of every card. Translucent + blurred so it
	   reads clearly over whatever imagery the thumbnail happens to show. */
	.add-btn {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		z-index: 1;
		padding: 0.3rem 0.75rem;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(8px) saturate(160%);
		-webkit-backdrop-filter: blur(8px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 999px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
		transition:
			background 150ms ease,
			border-color 150ms ease;
	}
	.add-btn:hover {
		background: rgba(59, 130, 246, 0.55);
		border-color: rgba(147, 197, 253, 0.7);
	}
	.add-btn.added {
		background: rgba(15, 23, 42, 0.55);
		border-color: rgba(255, 255, 255, 0.28);
		color: rgba(255, 255, 255, 0.85);
	}
	.add-btn.added:hover {
		background: rgba(239, 68, 68, 0.45);
		border-color: rgba(248, 113, 113, 0.6);
		color: #ffffff;
	}

	/* The checkbox is the row's only add/remove control (see the markup -
	   list view has no separate Add button, unlike grid), so the info
	   button just needs to not get squeezed by row-main's flex-grow. */
	.layer-row .info-btn {
		flex-shrink: 0;
	}
</style>
