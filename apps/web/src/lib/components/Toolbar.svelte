<script lang="ts">
	import type { MeasureState, ShapeMode } from "$lib/measure/path-measure-tool";
	import { ProjectionType, PROJECTIONS } from "$lib/types/projection";
	import SidePanel from "$lib/components/SidePanel.svelte";

	interface Props {
		measureState: MeasureState;
		onTogglePathTool: () => void;
		onFinish: () => void;
		onClose: () => void;
		onUndo: () => void;
		onClearAll: () => void;
		onRemoveMeasurement: (id: string) => void;
		onZoomToMeasurement: (id: string) => void;
		onHighlightMeasurement: (id: string, highlighted: boolean) => void;
		/** Which shape the tool button draws - see path-measure-tool.ts's
		 *  ShapeMode doc comment. Drives the main button's own icon/tooltip
		 *  (not just the dropdown's active-item highlight), so it's always
		 *  obvious which tool a bare click will activate. */
		shapeMode: ShapeMode;
		onSelectShapeMode: (mode: ShapeMode) => void;
		/** Grid + projection used to live in BasemapPicker's own floating
		 *  panel (bottom-left) - moved here into the second toolbar button's
		 *  dropdown, so BasemapPicker is basemap-skins-only now. */
		graticuleOn: boolean;
		onGraticuleToggle: () => void;
		currentProjection: ProjectionType;
		onProjectionChange: (p: ProjectionType) => void;
		/** True while the "Visualise Data" 3D popout is active - the
		 *  measure/draw toolbar has nothing useful to do over an in-scene
		 *  volumetric view (see VolumeBottomToolbar for that mode's own
		 *  tools), so it's hidden entirely rather than left floating on top. */
		hidden?: boolean;
	}
	const {
		measureState,
		onTogglePathTool,
		onFinish,
		onClose,
		onUndo,
		onClearAll,
		onRemoveMeasurement,
		onZoomToMeasurement,
		onHighlightMeasurement,
		shapeMode,
		onSelectShapeMode,
		graticuleOn,
		onGraticuleToggle,
		currentProjection,
		onProjectionChange,
		hidden = false,
	}: Props = $props();

	// One glyph (viewBox 0 0 24 24 path/shape data) + label + tooltip per
	// shape mode - drives both the main tool button (whichever mode is
	// currently selected) and the dropdown's three options.
	const SHAPE_TOOLS: Record<ShapeMode, { label: string; tooltip: string }> = {
		path: { label: "Path / Polygon", tooltip: "Add path or polygon" },
		rectangle: { label: "Rectangle", tooltip: "Draw rectangle (Shift = square)" },
		ellipse: { label: "Ellipse", tooltip: "Draw ellipse (Shift = circle)" },
	};
	// Dropdown order - a plain typed array (not Object.keys(SHAPE_TOOLS)) so
	// the #each below never needs an inline `as ShapeMode[]` cast, which
	// would collide with the each-block's own `as` binding keyword.
	const SHAPE_MODES: ShapeMode[] = ["path", "rectangle", "ellipse"];

	// "Advanced measurements" is a static disclosure for now - real content
	// (segment breakdown, coordinates, etc.) is future scope; this just
	// matches the reference panel's layout so it's a non-event to add later.
	let advancedOpen = $state(false);

	// Which finished-measurement rows are expanded - a plain Set so any
	// number of rows can be open at once (the list scrolls internally, see
	// .measurements-list, so there's no reason to force a single-open
	// accordion here).
	let expandedIds = $state(new Set<string>());
	function toggleExpanded(id: string): void {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	// ---- Bottom tool-bar's own two dropdown menus -------------------------
	// Both are closed by the window-level click below whenever the click
	// lands outside .tool-cluster (stopPropagation on the cluster itself is
	// what makes "outside" work - see the markup). Only one top-level
	// dropdown is ever open at a time; opening one explicitly closes the
	// other and collapses the projection submenu, so a stale open panel
	// never lingers behind a freshly-opened one.
	let shapeMenuOpen = $state(false);
	let gridMenuOpen = $state(false);
	let projectionMenuOpen = $state(false);

	function toggleShapeMenu(): void {
		gridMenuOpen = false;
		projectionMenuOpen = false;
		shapeMenuOpen = !shapeMenuOpen;
	}
	function toggleGridMenu(): void {
		shapeMenuOpen = false;
		gridMenuOpen = !gridMenuOpen;
		if (!gridMenuOpen) projectionMenuOpen = false;
	}
	function closeAllMenus(): void {
		shapeMenuOpen = false;
		gridMenuOpen = false;
		projectionMenuOpen = false;
	}

	const currentProjectionLabel = $derived(
		PROJECTIONS.find((p) => p.type === currentProjection)?.label ?? "",
	);
</script>

{#snippet pathIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M5 17 L10 8 L14 14 L19 6" />
		<circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="14" cy="14" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
	</svg>
{/snippet}

{#snippet rectangleIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="4" y="6" width="16" height="12" rx="1" />
	</svg>
{/snippet}

{#snippet ellipseIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<ellipse cx="12" cy="12" rx="9" ry="6" />
	</svg>
{/snippet}

{#snippet shapeModeIcon(mode: ShapeMode)}
	{#if mode === "rectangle"}
		{@render rectangleIcon()}
	{:else if mode === "ellipse"}
		{@render ellipseIcon()}
	{:else}
		{@render pathIcon()}
	{/if}
{/snippet}

{#snippet gridIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
	</svg>
{/snippet}

{#snippet caretIcon()}
	<svg class="caret-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M6 9l6 6 6-6" />
	</svg>
{/snippet}

<svelte:window onclick={closeAllMenus} />

{#if !hidden}
<div class="toolbar-stack">
	<nav class="bottom-bar" aria-label="Map tools">
		<div class="tool-cluster" onclick={(e) => e.stopPropagation()} role="presentation">
			<!-- Shape tool - path/polygon, rectangle, or ellipse (see
			     path-measure-tool.ts's ShapeMode). The main button always
			     draws whichever mode the dropdown last selected; picking a
			     different one from the dropdown switches it (and starts the
			     tool if it wasn't already active) without needing a separate
			     toggle-on click. -->
			<div class="tool-group">
				<button
					type="button"
					class="tool-btn"
					class:active={measureState.active}
					onclick={onTogglePathTool}
					aria-pressed={measureState.active}
				>
					{@render shapeModeIcon(shapeMode)}
					<span class="tool-tooltip">{SHAPE_TOOLS[shapeMode].tooltip}</span>
				</button>
				<button
					type="button"
					class="caret-btn"
					class:active={shapeMenuOpen}
					onclick={toggleShapeMenu}
					aria-haspopup="menu"
					aria-expanded={shapeMenuOpen}
					aria-label="More shape tools"
				>
					{@render caretIcon()}
				</button>
				{#if shapeMenuOpen}
					<div class="tool-dropdown">
						{#each SHAPE_MODES as mode (mode)}
							<button
								type="button"
								class="dropdown-item"
								class:active={shapeMode === mode}
								onclick={() => {
									onSelectShapeMode(mode);
									closeAllMenus();
								}}
							>
								{@render shapeModeIcon(mode)}
								<span>{SHAPE_TOOLS[mode].label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="tool-divider"></div>

			<!-- Grid + projection, moved out of BasemapPicker's floating
			     panel (bottom-left) - that panel is basemap skins only now. -->
			<div class="tool-group">
				<button
					type="button"
					class="tool-btn"
					class:active={graticuleOn}
					onclick={onGraticuleToggle}
					aria-pressed={graticuleOn}
				>
					{@render gridIcon()}
					<span class="tool-tooltip">Toggle grid</span>
				</button>
				<button
					type="button"
					class="caret-btn"
					class:active={gridMenuOpen}
					onclick={toggleGridMenu}
					aria-haspopup="menu"
					aria-expanded={gridMenuOpen}
					aria-label="Grid and projection settings"
				>
					{@render caretIcon()}
				</button>
				{#if gridMenuOpen}
					<div class="tool-dropdown">
						<button type="button" class="dropdown-item" class:active={graticuleOn} onclick={onGraticuleToggle}>
							{@render gridIcon()}
							<span>Grid</span>
							<span class="item-state">{graticuleOn ? "On" : "Off"}</span>
						</button>
						<div class="dropdown-row">
							<button
								type="button"
								class="dropdown-item"
								onclick={() => (projectionMenuOpen = !projectionMenuOpen)}
								aria-haspopup="menu"
								aria-expanded={projectionMenuOpen}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<circle cx="12" cy="12" r="9" />
									<path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9Z" />
								</svg>
								<span>Projection</span>
								<span class="item-state">{currentProjectionLabel}</span>
							</button>
							{#if projectionMenuOpen}
								<!-- The "context-menu like thing" that lists every
								     projection - a small flyout beside the row that
								     opened it, not a page-anchored menu. -->
								<div class="submenu" role="menu">
									{#each PROJECTIONS as proj (proj.type)}
										<button
											type="button"
											class="dropdown-item"
											class:active={currentProjection === proj.type}
											role="menuitem"
											title={proj.description}
											onclick={() => {
												onProjectionChange(proj.type);
												closeAllMenus();
											}}
										>
											<span>{proj.label}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</nav>
</div>
{/if}

{#if measureState.active}
	<SidePanel
		title={SHAPE_TOOLS[shapeMode].label}
		onHelp={() => {}}
		onUndo={shapeMode === "path" && measureState.drawing ? onUndo : undefined}
		{onClose}
	>
		{#snippet icon()}
			{@render shapeModeIcon(shapeMode)}
		{/snippet}

		{#snippet children()}
			<div class="panel-draw-section">
				{#if !measureState.drawing}
					<p class="hint">
						{#if shapeMode === "rectangle"}
							Drag on the map to draw a rectangle - hold Shift for a square.
						{:else if shapeMode === "ellipse"}
							Drag on the map to draw an ellipse - hold Shift for a circle.
						{:else}
							Click points on the map to draw a path or polygon.
						{/if}
					</p>
				{:else if measureState.closed}
					<div class="field-row">
						<span class="field-label">Area</span>
						<span class="field-value">{measureState.area}</span>
					</div>
					<div class="field-row">
						<span class="field-label">Perimeter</span>
						<span class="field-value">{measureState.perimeter}</span>
					</div>
				{:else}
					<div class="field-row">
						<span class="field-label">Length</span>
						<span class="field-value">
							{measureState.length}
							<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M6 9l6 6 6-6" />
							</svg>
						</span>
					</div>
					<div class="field-row">
						<span class="field-label">Heading</span>
						<span class="field-value">{measureState.heading}</span>
					</div>
				{/if}

				{#if measureState.drawing && shapeMode === "path"}
					<div class="panel-divider"></div>
					<button
						type="button"
						class="advanced-row"
						onclick={() => (advancedOpen = !advancedOpen)}
						aria-expanded={advancedOpen}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 11v5M12 8v.01" />
						</svg>
						<span>Advanced measurements</span>
						<svg class="chevron" class:rotated={advancedOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M6 9l6 6 6-6" />
						</svg>
					</button>
					{#if advancedOpen}
						<div class="field-row advanced-detail">
							<span class="field-label">Points</span>
							<span class="field-value">{measureState.vertexCount}</span>
						</div>
					{/if}
				{/if}
			</div>

			{#if measureState.finished.length > 0}
				<div class="panel-divider"></div>
				<div class="measurements-section">
					<div class="measurements-header">
						<span>Measurements ({measureState.finished.length})</span>
						<button
							type="button"
							class="measurements-clear-btn"
							onclick={onClearAll}
							title="Clear all measurements"
							aria-label="Clear all measurements"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M4 7h16" />
								<path d="M9 7V4h6v3" />
								<path d="M6 7l1 13h10l1-13" />
							</svg>
						</button>
					</div>

					<div class="measurements-list">
						{#each measureState.finished as m (m.id)}
							{@const expanded = expandedIds.has(m.id)}
							<div
								class="measurement-row"
								role="group"
								onmouseenter={() => onHighlightMeasurement(m.id, true)}
								onmouseleave={() => onHighlightMeasurement(m.id, false)}
							>
								<button
									type="button"
									class="measurement-row-main"
									onclick={() => toggleExpanded(m.id)}
									aria-expanded={expanded}
								>
									<svg class="measurement-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										{#if m.type === "path"}
											<path d="M5 17 L10 8 L14 14 L19 6" />
										{:else if m.type === "rectangle"}
											<rect x="4" y="6" width="16" height="12" rx="1" />
										{:else if m.type === "ellipse"}
											<ellipse cx="12" cy="12" rx="9" ry="6" />
										{:else}
											<path d="M12 4 20 19 4 19Z" />
										{/if}
									</svg>
									<span class="measurement-label">{m.label}</span>
									<span class="measurement-primary">{m.primary}</span>
									<svg class="chevron" class:rotated={expanded} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M6 9l6 6 6-6" />
									</svg>
								</button>
								{#if expanded}
									<div class="measurement-detail">
										<div class="field-row">
											<span class="field-label">{m.type !== "path" ? "Perimeter" : "Heading"}</span>
											<span class="field-value">{m.secondary}</span>
										</div>
										<div class="field-row">
											<span class="field-label">Points</span>
											<span class="field-value">{m.vertexCount}</span>
										</div>
										<div class="measurement-actions">
											<button type="button" onclick={() => onZoomToMeasurement(m.id)}>Zoom to</button>
											<button type="button" class="danger" onclick={() => onRemoveMeasurement(m.id)}>Delete</button>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet footer()}
			<button type="button" class="done-btn" disabled={!measureState.drawing} onclick={onFinish}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 13l4 4L19 7" />
				</svg>
				Done
			</button>
		{/snippet}
	</SidePanel>
{/if}

<style>
	/* Bottom-center, clearing StatusBar's own 2.25rem-tall strip along the
	   very bottom edge (same 3.25rem clearance BasemapPicker's floating
	   panel already uses, bottom-left, for the same reason). */
	.toolbar-stack {
		position: fixed;
		bottom: 3.25rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.tool-cluster {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.3rem;
		background: rgba(20, 20, 25, 0.85);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	}

	.tool-group {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.05rem;
	}

	.caret-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.3rem;
		height: 2.5rem;
		padding: 0;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.45);
		cursor: pointer;
		transition: color 150ms ease;
	}
	.caret-btn:hover,
	.caret-btn.active {
		color: rgba(255, 255, 255, 0.9);
	}
	.caret-icon {
		width: 0.75rem;
		height: 0.75rem;
	}

	/* Opens upward, like the tooltip above - the bar sits at the bottom of
	   the screen, so a downward-opening dropdown would run under (or past)
	   the status bar instead of staying on screen. */
	.tool-dropdown {
		position: absolute;
		bottom: calc(100% + 0.6rem);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 11rem;
		padding: 0.3rem;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	}

	.dropdown-row {
		position: relative;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.8);
		font-family: inherit;
		font-size: 0.8rem;
		text-align: left;
		cursor: pointer;
		transition: background 120ms ease;
	}
	.dropdown-item:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.dropdown-item.active {
		background: rgba(59, 130, 246, 0.2);
		color: #ffffff;
	}
	.dropdown-item svg {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.55);
	}
	.dropdown-item.active svg {
		color: #ffffff;
	}

	.item-state {
		margin-left: auto;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: rgba(255, 255, 255, 0.4);
	}
	.dropdown-item.active .item-state {
		color: #7fb0ff;
	}

	/* The "context-menu like thing" listing every projection - a flyout
	   beside the row that opened it, same visual language as .tool-dropdown
	   one level up. */
	.submenu {
		position: absolute;
		left: calc(100% + 0.5rem);
		bottom: 0;
		min-width: 8rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.3rem;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
	}

	.tool-btn {
		position: relative;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.75);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
		-webkit-tap-highlight-color: transparent;
	}

	.tool-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.tool-btn.active {
		background: rgba(59, 130, 246, 0.35);
		color: #ffffff;
	}

	.tool-btn svg {
		width: 1.3rem;
		height: 1.3rem;
	}

	/* Tooltip: light, matching Google Earth's own toolbar tooltip look -
	   a deliberate one-off departure from this app's usual dark tooltips,
	   since this control is explicitly modeled on that reference. Opens
	   upward (bottom: 100%, not top) now that the bar itself lives at the
	   bottom of the screen - downward would run it under the status bar. */
	.tool-tooltip {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%) translateY(4px);
		background: #f1f3f4;
		color: #202124;
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		white-space: nowrap;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 150ms ease,
			transform 150ms ease;
	}

	.tool-btn:hover .tool-tooltip {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}

	/* ---- Path/polygon panel content (rendered inside SidePanel) ---- */
	.hint {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.field-label {
		color: rgba(255, 255, 255, 0.6);
	}

	.field-value {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.chevron {
		width: 0.9rem;
		height: 0.9rem;
		color: rgba(255, 255, 255, 0.5);
		transition: transform 150ms ease;
	}
	.chevron.rotated {
		transform: rotate(180deg);
	}

	.panel-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 0.1rem 0;
	}

	.advanced-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.15rem 0;
	}
	.advanced-row svg:first-child {
		width: 1rem;
		height: 1rem;
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}
	.advanced-row span {
		flex: 1;
		text-align: left;
	}

	.advanced-detail {
		padding-left: 1.5rem;
		font-size: 0.78rem;
	}

	/* ---- Draw-in-progress content: natural height, never scrolls - the
	   measurements list below is the one flexible/scrollable region. ---- */
	.panel-draw-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 0 0 auto;
	}

	/* ---- Finished-measurements list ---- */
	.measurements-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		/* Shrinks (and its .measurements-list scrolls) once the panel hits
		   SidePanel's max-height, but never force-stretches past its own
		   content for a short list - see .measurements-list below. */
		flex: 0 1 auto;
		min-height: 0;
	}

	.measurements-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 0 0 auto;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.76rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.measurements-clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.measurements-clear-btn svg {
		width: 0.9rem;
		height: 0.9rem;
	}
	.measurements-clear-btn:hover {
		background: rgba(255, 138, 138, 0.18);
		color: rgba(255, 138, 138, 0.95);
	}

	.measurements-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		/* Thin, low-contrast scrollbar so a long list doesn't look like a
		   default browser scrollbar bolted onto a dark floating panel. */
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
	}
	.measurements-list::-webkit-scrollbar {
		width: 6px;
	}
	.measurements-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.measurements-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}
	.measurements-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	.measurement-row {
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		transition: background 150ms ease;
	}
	.measurement-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.measurement-row-main {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.55rem;
		background: transparent;
		border: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
	}

	.measurement-type-icon {
		width: 0.95rem;
		height: 0.95rem;
		color: rgba(255, 204, 51, 0.9);
		flex-shrink: 0;
	}

	.measurement-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.measurement-primary {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.measurement-detail {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0 0.55rem 0.55rem 2rem;
		font-size: 0.78rem;
	}

	.measurement-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.1rem;
	}
	.measurement-actions button {
		padding: 0.28rem 0.6rem;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 999px;
		color: rgba(255, 255, 255, 0.85);
		font-family: inherit;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.measurement-actions button:hover {
		background: rgba(255, 255, 255, 0.18);
	}
	.measurement-actions button.danger {
		color: rgba(255, 138, 138, 0.95);
	}
	.measurement-actions button.danger:hover {
		background: rgba(255, 138, 138, 0.18);
	}

	.done-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.55rem 0.75rem;
		background: rgba(59, 130, 246, 0.5);
		border: none;
		border-radius: 999px;
		color: #ffffff;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.done-btn svg {
		width: 1rem;
		height: 1rem;
	}
	.done-btn:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.7);
	}
	.done-btn:disabled {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.35);
		cursor: default;
	}

	@media (max-width: 480px) {
		:global(.side-panel) {
			right: 0.75rem;
			left: 0.75rem;
			width: auto;
		}
	}
</style>
