<script lang="ts">
	/**
	 * PolygonDimOverlay.svelte
	 *
	 * Dims the whole screen except a cutout shaped like the shape being
	 * visualised, so Cesium's globe (and its graticule, if on - see
	 * CesiumCanvas.svelte's enterVolumeView, which keeps Cesium's canvas
	 * live and interactive under the 3D popout instead of replacing it)
	 * stays visible underneath: the shape itself (undimmed, full Cesium
	 * brightness), then whatever Cesium is rendering there (e.g. the
	 * grid), then the volume (VolumetricScene, a separate
	 * transparent-background canvas layered above this one).
	 *
	 * Cesium's camera is fully interactive during the popout, so the
	 * shape's screen-space projection changes every frame - updatePoints()
	 * is called from CesiumCanvas's existing animate() loop, same
	 * imperative-DOM-write pattern as ShapeVisualiseButton's
	 * updatePositions (a direct SVG attribute write, not $state, since
	 * this runs at render cadence).
	 */
	let svgEl: SVGSVGElement | undefined = $state();
	let polygonEl: SVGPolygonElement | undefined = $state();

	export function updatePoints(points: [number, number][] | null): void {
		if (!svgEl || !polygonEl) return;
		if (!points || points.length < 3) {
			svgEl.style.display = "none";
			return;
		}
		svgEl.style.display = "block";
		polygonEl.setAttribute("points", points.map(([x, y]) => `${x},${y}`).join(" "));
	}
</script>

<svg class="dim-overlay" bind:this={svgEl} aria-hidden="true" style="display: none;">
	<mask id="polygon-cutout">
		<rect x="0" y="0" width="100%" height="100%" fill="white" />
		<polygon bind:this={polygonEl} points="" fill="black" />
	</mask>
	<rect x="0" y="0" width="100%" height="100%" fill="#05070c" fill-opacity="0.72" mask="url(#polygon-cutout)" />
</svg>

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
