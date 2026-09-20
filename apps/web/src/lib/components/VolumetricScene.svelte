<script lang="ts">
	/**
	 * VolumetricScene.svelte
	 *
	 * The "Visualise Data" 3D popout's own canvas + three.js renderer/camera/
	 * OrbitControls, layered transparently on top of Cesium's own canvas
	 * (which stays live underneath - see CesiumCanvas.svelte's
	 * enterVolumeView and PolygonDimOverlay.svelte, which dims everywhere
	 * except the shape itself so the globe/graticule still read as "the
	 * ground this volume is standing on" instead of being replaced by a
	 * separate scene). The three.js camera is one-time-synced to wherever
	 * Cesium's own camera was framing the shape (see
	 * cesium-local-frame.ts) so the volume visually grows out of the right
	 * spot on screen; from then on OrbitControls owns it independently -
	 * Cesium's camera inputs are disabled for the duration (see
	 * CesiumCanvas), so the two never fight over the same drag gesture.
	 * CesiumCanvas mounts this only while volumetricMode.active is true and
	 * unmounts it (see onDestroy's explicit disposal) the moment the user
	 * exits, so repeated open/close cycles never leak a WebGL context.
	 */
	import { onMount, onDestroy } from "svelte";
	import * as THREE from "three";
	import { OrbitControls } from "three/addons/controls/OrbitControls.js";
	import { volumetricMode } from "$lib/state/volumetric-mode.svelte";
	import { volumeControls } from "$lib/state/volume-controls.svelte";
	import { buildData3DTexture } from "$lib/render/volume-field";
	import { toLUTTexture } from "$lib/render/colormaps";
	import { createVolumeMaterial, createVolumeMesh, type VolumeMaterialHandle } from "$lib/render/volume-raymarch";
	import { EARTH_RADIUS_M } from "$lib/geo/measure";
	import type { LocalFrameCameraSnapshot } from "$lib/geo/cesium-local-frame";

	interface Props {
		/** [longitude, latitude] positions of the shape this popout belongs
		 *  to - drawn as a ground-level outline so the volume stays anchored
		 *  to something recognisable rather than floating in empty space. */
		shapePositions: [number, number][];
		/** Where Cesium's own camera was looking when the popout opened -
		 *  null falls back to a top-down heuristic framing (see
		 *  rebuildVolume) rather than failing outright. */
		cameraSnapshot: LocalFrameCameraSnapshot | null;
		onExit: () => void;
	}
	const { shapePositions, cameraSnapshot, onExit }: Props = $props();

	let containerEl: HTMLDivElement;
	let renderer: THREE.WebGLRenderer | undefined;
	let scene: THREE.Scene | undefined;
	let camera: THREE.PerspectiveCamera | undefined;
	let controls: OrbitControls | undefined;
	let rafId: number | undefined;

	let volumeGroup: THREE.Group | undefined;
	let volumeMesh: THREE.Mesh | undefined;
	let materialHandle: VolumeMaterialHandle | undefined;
	let volumeTexture: THREE.Data3DTexture | undefined;
	let builtForGrid: unknown = null; // identity-compares volumetricMode.grid so a re-entrant grid only builds once

	const DEG2RAD = Math.PI / 180;

	/** Flat-earth local ENU meters relative to the shape's own centroid -
	 *  same approximation path-measure-tool.ts's rectangle/ellipse drawing
	 *  already uses; accurate enough at the scale a single drawn shape spans. */
	function toLocalMeters(lon: number, lat: number, centerLon: number, centerLat: number): { x: number; z: number } {
		const metersPerLon = EARTH_RADIUS_M * Math.max(Math.cos(centerLat * DEG2RAD), 0.01);
		return {
			x: (lon - centerLon) * DEG2RAD * metersPerLon,
			z: (lat - centerLat) * DEG2RAD * EARTH_RADIUS_M,
		};
	}

	function buildOutline(centerLon: number, centerLat: number): THREE.LineLoop {
		const points = shapePositions.map(([lon, lat]) => {
			const { x, z } = toLocalMeters(lon, lat, centerLon, centerLat);
			return new THREE.Vector3(x, 0, z);
		});
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const material = new THREE.LineBasicMaterial({ color: 0xffcc33 });
		return new THREE.LineLoop(geometry, material);
	}

	function disposeVolume(): void {
		if (volumeMesh) {
			volumeMesh.geometry.dispose();
			volumeGroup?.remove(volumeMesh);
			volumeMesh = undefined;
		}
		materialHandle?.material.dispose();
		materialHandle = undefined;
		volumeTexture?.dispose();
		volumeTexture = undefined;
		builtForGrid = null;
	}

	function rebuildVolume(): void {
		const grid = volumetricMode.grid;
		if (!scene || !volumeGroup || !grid || grid === builtForGrid) return;
		disposeVolume();
		builtForGrid = grid;

		const [west, south, east, north] = grid.bbox;
		const centerLon = (west + east) / 2;
		const centerLat = (south + north) / 2;
		const metersPerLon = EARTH_RADIUS_M * Math.max(Math.cos(centerLat * DEG2RAD), 0.01);
		const widthM = Math.max(1, (east - west) * DEG2RAD * metersPerLon);
		const heightM = Math.max(1, (north - south) * DEG2RAD * EARTH_RADIUS_M);
		const shallow = grid.depths[0] ?? 0;
		const deepest = grid.depths[grid.depths.length - 1] ?? shallow;
		const depthTotalM = Math.max(1, Math.abs(deepest - shallow));

		volumeTexture = buildData3DTexture(grid);
		materialHandle = createVolumeMaterial(volumeTexture, toLUTTexture(volumeControls.colormap), volumeControls.opacity);
		volumeMesh = createVolumeMesh(widthM, depthTotalM, heightM, materialHandle);
		// Anchors the shallow (top) face at local y=0 regardless of the
		// group's vertical-exaggeration scale - see the header comment on
		// applyVerticalExaggeration below for why this has to be a group
		// scale, not a mesh-level one.
		volumeMesh.position.y = -depthTotalM / 2;
		volumeGroup.add(volumeMesh);
		applyVerticalExaggeration();

		// Near/far only - camera position/target were already set once at
		// mount (from cameraSnapshot, or the top-down fallback below) and
		// must NOT be reset here: the grid usually finishes loading well
		// after the scene mounts, and resetting the camera on arrival would
		// yank it away from wherever Cesium's own camera (or the user, via
		// OrbitControls) had it framed.
		if (camera) {
			const maxDim = Math.max(widthM, heightM, depthTotalM * volumeControls.verticalExaggeration);
			camera.near = Math.max(0.1, maxDim / 1000);
			camera.far = maxDim * 20;
			camera.updateProjectionMatrix();
		}
	}

	/** Vertical exaggeration is a scale on the GROUP the mesh sits in, not
	 *  the mesh itself: a mesh-local scale would move the shallow (top) face
	 *  away from y=0 as the factor changes (scale is applied before the
	 *  mesh's own position offset), which would make the volume appear to
	 *  sink/rise out of the sea-surface outline every time the slider moves.
	 *  Scaling the parent group instead stretches the box strictly downward
	 *  around the fixed top face, because the mesh's -depthTotal/2 position
	 *  offset is itself subject to (and cancels out under) the same scale. */
	function applyVerticalExaggeration(): void {
		if (volumeGroup) volumeGroup.scale.y = volumeControls.verticalExaggeration;
	}

	function animate(): void {
		rafId = requestAnimationFrame(animate);
		controls?.update();
		if (renderer && scene && camera) renderer.render(scene, camera);
	}

	function handleResize(): void {
		if (!renderer || !camera || !containerEl) return;
		const { clientWidth, clientHeight } = containerEl;
		if (clientWidth === 0 || clientHeight === 0) return;
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(clientWidth, clientHeight);
	}

	onMount(() => {
		scene = new THREE.Scene();
		// Transparent - Cesium's own canvas (dimmed outside the shape by
		// PolygonDimOverlay, full brightness inside it) shows through
		// everywhere this scene doesn't paint an opaque pixel, instead of
		// this canvas replacing the view entirely.
		scene.background = null;

		camera = new THREE.PerspectiveCamera(50, containerEl.clientWidth / containerEl.clientHeight, 0.1, 100000);

		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setClearColor(0x000000, 0);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
		containerEl.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 1;

		volumeGroup = new THREE.Group();
		scene.add(volumeGroup);

		const [west, south, east, north] = volumetricMode.grid?.bbox ?? bboxOfShapePositions(shapePositions);
		scene.add(buildOutline((west + east) / 2, (south + north) / 2));

		scene.add(new THREE.AmbientLight(0xffffff, 0.6));
		const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight.position.set(1, 2, 1);
		scene.add(dirLight);

		if (cameraSnapshot) {
			camera.position.set(...cameraSnapshot.position);
			controls.target.set(...cameraSnapshot.target);
			camera.fov = cameraSnapshot.fovDeg;
		} else {
			// Fallback: a top-down-ish framing sized off the shape's own
			// bbox (grid.bbox isn't known yet at mount time) - only reached
			// if Cesium's frustum wasn't a PerspectiveFrustum, which
			// shouldn't happen in practice (see captureLocalCameraSnapshot).
			const metersPerLon = EARTH_RADIUS_M * Math.max(Math.cos(((south + north) / 2) * DEG2RAD), 0.01);
			const widthM = Math.max(1, (east - west) * DEG2RAD * metersPerLon);
			const heightM = Math.max(1, (north - south) * DEG2RAD * EARTH_RADIUS_M);
			const maxDim = Math.max(widthM, heightM);
			camera.position.set(0, maxDim * 1.7, maxDim * 0.35);
			controls.target.set(0, 0, 0);
		}
		camera.updateProjectionMatrix();
		controls.update();

		rebuildVolume();
		window.addEventListener("resize", handleResize);
		rafId = requestAnimationFrame(animate);
	});

	function bboxOfShapePositions(positions: [number, number][]): [number, number, number, number] {
		let west = Infinity;
		let south = Infinity;
		let east = -Infinity;
		let north = -Infinity;
		for (const [lon, lat] of positions) {
			if (lon < west) west = lon;
			if (lon > east) east = lon;
			if (lat < south) south = lat;
			if (lat > north) north = lat;
		}
		return [west, south, east, north];
	}

	$effect(() => {
		// Re-run whenever a fresh grid arrives (rebuildVolume no-ops if it's
		// the same object it already built for).
		void volumetricMode.grid;
		rebuildVolume();
	});

	$effect(() => {
		materialHandle?.setOpacity(volumeControls.opacity);
	});
	$effect(() => {
		if (materialHandle) materialHandle.setColormap(toLUTTexture(volumeControls.colormap));
	});
	$effect(() => {
		void volumeControls.verticalExaggeration;
		applyVerticalExaggeration();
	});

	onDestroy(() => {
		window.removeEventListener("resize", handleResize);
		if (rafId !== undefined) cancelAnimationFrame(rafId);
		controls?.dispose();
		disposeVolume();
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
		}
		scene = undefined;
		camera = undefined;
		volumeGroup = undefined;
	});
</script>

<div class="volumetric-scene" bind:this={containerEl}>
	{#if volumetricMode.loading}
		<div class="overlay">
			<div class="spinner" aria-hidden="true"></div>
			<p>Fetching depth layers&hellip;</p>
		</div>
	{:else if volumetricMode.error}
		<div class="overlay">
			<p class="error">{volumetricMode.error}</p>
			<button type="button" onclick={onExit}>Close</button>
		</div>
	{/if}
</div>

<style>
	.volumetric-scene {
		position: fixed;
		inset: 0;
		/* Above Cesium's canvas + PolygonDimOverlay (z-index 12), below the
		   right control panel (SidePanel, z-index 20) - see
		   VolumeControlPanel.svelte's header comment for the full stack. */
		z-index: 16;
		background: transparent;
		/* OrbitControls needs to receive drags on this canvas even though
		   its background is transparent and Cesium's (input-disabled)
		   canvas sits directly underneath. */
		pointer-events: auto;
	}
	.volumetric-scene :global(canvas) {
		display: block;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: #e6ecf3;
		background: rgba(5, 7, 12, 0.55);
		z-index: 1;
	}
	.overlay .error {
		color: #ff8080;
		max-width: 26rem;
		text-align: center;
	}
	.overlay button {
		padding: 0.5rem 1.25rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		cursor: pointer;
	}
	.spinner {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: #ffcc33;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
