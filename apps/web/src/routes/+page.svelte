<script lang="ts">
	import CesiumCanvas from '$lib/components/CesiumCanvas.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import LayerControl from '$lib/components/LayerControl.svelte';

	let statusBarRef = $state<StatusBar | undefined>(undefined);
	let globeCanvasRef = $state<CesiumCanvas | undefined>(undefined);
	// Owned here (not inside CesiumCanvas) because it gates <LayerControl>,
	// which is a page-level panel — Toolbar's layers button (inside
	// CesiumCanvas) just reflects/toggles it via props.
	let layersOpen = $state(true);
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
			onToggleLayers={() => (layersOpen = !layersOpen)}
		/>
	</div>

	<!-- Floating layer control panel — visibility toggled from the top-bar
	     layers icon (see CesiumCanvas > Toolbar.svelte). -->
	{#if layersOpen}
		<LayerControl
			onVisibilityChange={(id, visible) => globeCanvasRef?.setLayerVisibility(id, visible)}
			onOpacityChange={(id, opacity) => globeCanvasRef?.setLayerOpacity(id, opacity)}
		/>
	{/if}

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
