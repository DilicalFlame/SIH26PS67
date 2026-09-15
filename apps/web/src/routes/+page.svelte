<script lang="ts">
	import CesiumCanvas from '$lib/components/CesiumCanvas.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import DataLayersCatalog from '$lib/components/DataLayersCatalog.svelte';
	import { loadSession, dispatchSessionAction, SessionActionType } from '$lib/state/session-store';

	const initialSession = loadSession();

	let statusBarRef = $state<StatusBar | undefined>(undefined);
	let globeCanvasRef = $state<CesiumCanvas | undefined>(undefined);
	// Owned here (not inside CesiumCanvas) because it gates <DataLayersCatalog>,
	// which is a page-level modal — Toolbar's layers button (inside
	// CesiumCanvas) just reflects/toggles it via props. Defaults closed on a
	// first-ever visit (no session yet) — restored from a prior session
	// otherwise, see session-store.ts.
	let layersOpen = $state(initialSession.layersOpen ?? false);
	// Mirrors dataLayerManager's active-layer ids (owned inside CesiumCanvas)
	// so the catalog modal can show "Added" vs "Add" per card.
	let activeLayerIds = $state<Set<string>>(new Set());

	function toggleLayersOpen(): void {
		layersOpen = !layersOpen;
		dispatchSessionAction({ type: SessionActionType.LayersPanelToggled, payload: layersOpen });
	}
</script>

<svelte:head>
	<title>SIH26PS67</title>
	<meta name="description" content="Optimised Ocean Data Visualisation Platform." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
</svelte:head>

<main class="viewport">
	<!-- Full-screen Cesium canvas. Projection morph, graticule toggle, and
	     the basemap skin switcher are all controlled from inside CesiumCanvas
	     now (see BasemapPicker.svelte's bottom-left panel) — one control
	     cluster instead of three separate floating elements. -->
	<div class="canvas-wrapper">
		<CesiumCanvas
			bind:this={globeCanvasRef}
			statusBar={statusBarRef}
			{layersOpen}
			onToggleLayers={toggleLayersOpen}
			onActiveLayerIdsChange={(ids) => (activeLayerIds = new Set(ids))}
		/>
	</div>

	<!-- Data layers catalog — a full-screen modal, opened from the top-bar
	     layers icon (see CesiumCanvas > Toolbar.svelte). The active-layers
	     list itself (left floating panel) is rendered inside CesiumCanvas. -->
	<DataLayersCatalog
		open={layersOpen}
		activeIds={activeLayerIds}
		onAdd={(id) => globeCanvasRef?.addDataLayer(id)}
		onRemove={(id) => globeCanvasRef?.removeDataLayer(id)}
		onClose={toggleLayersOpen}
	/>

	<StatusBar bind:this={statusBarRef} />
</main>

<style>
	/* Reset / base */
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body, html) {
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #0d0d0f;
		font-family: 'Noto Sans', system-ui, sans-serif;
	}

	/* Viewport */
	.viewport {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
	}

	.canvas-wrapper {
		position: absolute;
		inset: 0;
	}
</style>
