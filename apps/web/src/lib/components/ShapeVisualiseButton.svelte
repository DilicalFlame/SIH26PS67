<script lang="ts" module>
	import type * as Cesium from "cesium";
	import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";

	export interface VisualiseTarget {
		id: string;
		centroid: Cesium.Cartesian3;
		layer: DataLayerCatalogEntry;
	}

	/** Minimal shape for the EllipsoidalOccluder constructor + method this
	 *  component actually calls - see the runtime-vs-.d.ts note below. */
	export interface EllipsoidalOccluderCtor {
		new (ellipsoid: Cesium.Ellipsoid, cameraPosition?: Cesium.Cartesian3): {
			isPointVisible(occludee: Cesium.Cartesian3): boolean;
		};
	}
</script>

<script lang="ts">
	/**
	 * ShapeVisualiseButton.svelte
	 *
	 * One "Visualise Data" chip per finished shape that has a data layer to
	 * show (see shape-layer-intersection.ts's gate) - a single instance for
	 * every qualifying shape, not one component-per-shape-with-its-own-
	 * postRender-listener: CesiumCanvas calls this component's exported
	 * updatePositions() once per frame from its existing animate() loop
	 * (same imperative-DOM-write pattern as HeadingControl's needle
	 * rotation), which is far cheaper than N independent per-frame hooks.
	 */
	import * as CesiumRuntime from "cesium";

	interface Props {
		targets: VisualiseTarget[];
		onVisualise: (target: VisualiseTarget) => void;
	}
	const { targets, onVisualise }: Props = $props();

	const elByTarget = new Map<string, HTMLButtonElement>();

	function registerEl(node: HTMLButtonElement, id: string) {
		elByTarget.set(id, node);
		return {
			update(newId: string) {
				elByTarget.delete(id);
				id = newId;
				elByTarget.set(id, node);
			},
			destroy() {
				elByTarget.delete(id);
			},
		};
	}

	/** Called every frame from CesiumCanvas's animate() - imperative DOM
	 *  writes only (position/visibility), never $state, since this runs at
	 *  render cadence. */
	export function updatePositions(viewer: Cesium.Viewer): void {
		const scene = viewer.scene;
		const width = scene.canvas.clientWidth;
		const height = scene.canvas.clientHeight;
		// A camera-height threshold doesn't tell you whether a *specific*
		// point is on the near or far side of the globe (a point can be on
		// the far side while zoomed in close, or on the near side at any
		// zoom) - an EllipsoidalOccluder horizon test is the correct check,
		// and Cesium already ships it (cheap: one dot product per point).
		// Exported at runtime (cesium/Source/Cesium.js) but missing from
		// this version's own Cesium.d.ts - a real gap in Cesium's shipped
		// types, not a typo here.
		const EllipsoidalOccluder = (CesiumRuntime as unknown as { EllipsoidalOccluder: EllipsoidalOccluderCtor })
			.EllipsoidalOccluder;
		const occluder = new EllipsoidalOccluder(scene.globe.ellipsoid, viewer.camera.position);

		for (const target of targets) {
			const el = elByTarget.get(target.id);
			if (!el) continue;

			const win = occluder.isPointVisible(target.centroid)
				? CesiumRuntime.SceneTransforms.worldToWindowCoordinates(scene, target.centroid)
				: undefined;

			if (!win || win.x < 0 || win.y < 0 || win.x > width || win.y > height) {
				if (el.style.display !== "none") el.style.display = "none";
				continue;
			}
			if (el.style.display !== "flex") el.style.display = "flex";
			el.style.left = `${win.x}px`;
			el.style.top = `${win.y}px`;
		}
	}
</script>

{#each targets as target (target.id)}
	<button
		type="button"
		class="visualise-button"
		use:registerEl={target.id}
		onclick={() => onVisualise(target)}
	>
		<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M3 16 L9 10 L13 14 L21 5" />
			<path d="M21 5 L21 10" />
			<path d="M21 5 L16 5" />
		</svg>
		Visualise Data
	</button>
{/each}

<style>
	.visualise-button {
		position: fixed;
		left: 0;
		top: 0;
		transform: translate(-50%, 6px);
		display: none;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 204, 51, 0.5);
		background: rgba(20, 20, 25, 0.75);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		color: #ffcc33;
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		z-index: 12;
		pointer-events: auto;
	}
	.visualise-button:hover {
		background: rgba(255, 204, 51, 0.15);
	}
</style>
