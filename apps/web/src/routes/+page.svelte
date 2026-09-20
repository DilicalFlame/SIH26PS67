<script lang="ts">
	import CesiumCanvas from '$lib/components/CesiumCanvas.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import DataLayersCatalog from '$lib/components/DataLayersCatalog.svelte';
	import { loadSession, dispatchSessionAction, SessionActionType } from '$lib/state/session-store';
	import type { FinishedMeasurement } from '$lib/measure/path-measure-tool';

	const initialSession = loadSession();

	let statusBarRef = $state<StatusBar | undefined>(undefined);
	let globeCanvasRef = $state<CesiumCanvas | undefined>(undefined);
	// Owned here (not inside CesiumCanvas) because it gates <DataLayersCatalog>,
	// which is a page-level modal - ActiveLayersPanel's "Add Layer" button
	// (inside CesiumCanvas) just toggles it via props. Defaults closed on a
	// first-ever visit (no session yet) - restored from a prior session
	// otherwise, see session-store.ts.
	let layersOpen = $state(initialSession.layersOpen ?? false);
	// Mirrors dataLayerManager's active-layer ids (owned inside CesiumCanvas)
	// so the catalog modal can show "Added" vs "Add" per card.
	let activeLayerIds = $state<Set<string>>(new Set());
	// Mirrors measureTool's finished shapes (also owned inside CesiumCanvas)
	// so the catalog modal's "Area of Interest" facet can filter by them -
	// any closed-area shape (polygon, rectangle, ellipse - not an open path,
	// see path-measure-tool.ts's header comment) is a legitimate AOI.
	let finishedMeasurements = $state<FinishedMeasurement[]>([]);
	const polygonMeasurements = $derived(finishedMeasurements.filter((m) => m.type !== 'path'));

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
	     now (see BasemapPicker.svelte's bottom-left panel) - one control
	     cluster instead of three separate floating elements. -->
	<div class="canvas-wrapper">
		<CesiumCanvas
			bind:this={globeCanvasRef}
			statusBar={statusBarRef}
			onToggleLayers={toggleLayersOpen}
			onActiveLayerIdsChange={(ids) => (activeLayerIds = new Set(ids))}
			onMeasurementsChange={(measurements) => (finishedMeasurements = measurements)}
		/>
	</div>

	<!-- Data layers catalog - a full-screen modal, opened from the "Add
	     Layer" button on the active-layers panel (see CesiumCanvas >
	     ActiveLayersPanel.svelte). That panel itself (left floating panel)
	     is rendered inside CesiumCanvas. -->
	<DataLayersCatalog
		open={layersOpen}
		activeIds={activeLayerIds}
		polygons={polygonMeasurements}
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
