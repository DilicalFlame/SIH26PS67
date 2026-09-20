<script lang="ts">
	/**
	 * PolygonDimOverlay.svelte
	 *
	 * Dims the whole screen except a cutout shaped like the shape being
	 * visualised, so Cesium's globe (and its graticule, if on - see
	 * CesiumCanvas.svelte's enterVolumeView, which stops hiding Cesium's
	 * canvas entirely) stays visible underneath the 3D popout instead of
	 * being replaced by it: polygon (undimmed, full Cesium brightness),
	 * then whatever Cesium itself is rendering there (e.g. the grid), then
	 * the volume (VolumetricScene, a separate transparent-background
	 * canvas layered above this one).
	 *
	 * `points` is captured once by the caller right after the camera parks
	 * (see cesium-local-frame.ts's captureShapeScreenPoints) - Cesium's
	 * camera inputs are disabled for the duration of the popout, so the
	 * projection doesn't need to be recomputed every frame, only on
	 * window resize (see CesiumCanvas's resize wiring).
	 */
	interface Props {
		points: [number, number][] | null;
	}
	const { points }: Props = $props();

	const pointsAttr = $derived(points ? points.map(([x, y]) => `${x},${y}`).join(" ") : "");
</script>

{#if points && points.length >= 3}
	<svg class="dim-overlay" aria-hidden="true">
		<mask id="polygon-cutout">
			<rect x="0" y="0" width="100%" height="100%" fill="white" />
			<polygon points={pointsAttr} fill="black" />
		</mask>
		<rect x="0" y="0" width="100%" height="100%" fill="#05070c" fill-opacity="0.72" mask="url(#polygon-cutout)" />
	</svg>
{/if}

<style>
	.dim-overlay {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 12;
		pointer-events: none;
	}
</style>
