<script lang="ts">
	/**
	 * VolumetricScene.svelte
	 *
	 * The "Visualise Data" 3D popout's own canvas, layered transparently on
	 * top of Cesium's own canvas (which stays live and fully interactive
	 * underneath - see CesiumCanvas.svelte's enterVolumeView and
	 * PolygonDimOverlay.svelte, which dims everywhere except the shape
	 * itself). This canvas has no camera controls of its own: every
	 * animation frame it re-derives its three.js camera from Cesium's
	 * current (live, user-driven) camera via captureLocalCameraSnapshot,
	 * so the globe and the volume move together as one continuous 3D space
	 * instead of two independently-navigable ones - drag/pan/zoom on
	 * Cesium's canvas underneath, and the volume rides along exactly.
	 * CesiumCanvas mounts this only while volumetricMode.active is true and
	 * unmounts it (see onDestroy's explicit disposal) the moment the user
	 * exits, so repeated open/close cycles never leak a WebGL context.
	 */
	import { onMount, onDestroy } from "svelte";
	import * as THREE from "three";
	import type * as Cesium from "cesium";
	import { volumetricMode } from "$lib/state/volumetric-mode.svelte";
	import { volumeControls } from "$lib/state/volume-controls.svelte";
	import { buildData3DTexture } from "$lib/render/volume-field";
	import { toLUTTexture } from "$lib/render/colormaps";
	import { createVolumeMaterial, createVolumeMesh, type VolumeMaterialHandle } from "$lib/render/volume-raymarch";
	import { EARTH_RADIUS_M } from "$lib/geo/measure";
	import { captureLocalCameraSnapshot } from "$lib/geo/cesium-local-frame";

	interface Props {
		/** [longitude, latitude] positions of the shape this popout belongs
		 *  to - drawn as a ground-level outline so the volume stays anchored
		 *  to something recognisable rather than floating in empty space. */
		shapePositions: [number, number][];
		viewer: Cesium.Viewer;
		centroid: Cesium.Cartesian3;
		onExit: () => void;
	}
	const { shapePositions, viewer, centroid, onExit }: Props = $props();

	let containerEl: HTMLDivElement;
	let renderer: THREE.WebGLRenderer | undefined;
	let scene: THREE.Scene | undefined;
	let camera: THREE.PerspectiveCamera | undefined;
	let rafId: number | undefined;

	let volumeGroup: THREE.Group | undefined;
	let volumeMesh: THREE.Mesh | undefined;
	let wireframeMesh: THREE.LineSegments | undefined;
	let materialHandle: VolumeMaterialHandle | undefined;
	let volumeTexture: THREE.Data3DTexture | undefined;
	let builtForGrid: unknown = null; // identity-compares volumetricMode.grid so a re-entrant grid only builds once
	/** Floor for syncCameraToCesium's per-frame near/far - see rebuildVolume. */
	let sceneMaxDim = 100_000;
	/** Set alongside the mesh in rebuildVolume, read every frame by
	 *  updateDepthLabels - plain (not $state), since it's never read from
	 *  the template, only from the animate() loop. */
	let boxDims = { width: 0, height: 0, depthTotal: 0 };

	/** DOM depth-axis labels (image-7-style ruler along the box's west-north
	 *  edge) - one per fetched depth level, positioned every frame by
	 *  projecting their 3D world point through the (also per-frame-synced)
	 *  camera, same imperative-DOM-write pattern as ShapeVisualiseButton's
	 *  updatePositions. */
	const depthLabelEls = new Map<number, HTMLDivElement>();
	function registerDepthLabel(node: HTMLDivElement, index: number) {
		depthLabelEls.set(index, node);
		return {
			destroy() {
				depthLabelEls.delete(index);
			},
		};
	}

	const DEG2RAD = Math.PI / 180;

	/** Flat-earth local frame meters relative to the shape's own centroid:
	 *  x=East, z=South - same (East, Up, South) right-handed convention
	 *  cesium-local-frame.ts's captureLocalCameraSnapshot uses (see its
	 *  header comment for why it's South, not North: East x Up = -North in
	 *  a right-handed ENU frame, so +North would silently mirror this
	 *  scene relative to Cesium's camera). volume-raymarch.ts's box
	 *  geometry/texture-coordinate mapping assumes this same convention -
	 *  keep all three in sync. */
	function toLocalMeters(lon: number, lat: number, centerLon: number, centerLat: number): { x: number; z: number } {
		const metersPerLon = EARTH_RADIUS_M * Math.max(Math.cos(centerLat * DEG2RAD), 0.01);
		return {
			x: (lon - centerLon) * DEG2RAD * metersPerLon,
			z: -(lat - centerLat) * DEG2RAD * EARTH_RADIUS_M,
		};
	}

	/** "-0 m" reads oddly for the barely-below-surface first standard depth
	 *  (-0.49m) - round to the nearest metre and normalize -0 to 0. */
	function formatDepthLabel(depthMeters: number): string {
		const rounded = Math.round(depthMeters);
		return `${rounded === 0 ? 0 : rounded} m`;
	}

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
		if (wireframeMesh) {
			wireframeMesh.geometry.dispose();
			(wireframeMesh.material as THREE.Material).dispose();
			volumeGroup?.remove(wireframeMesh);
			wireframeMesh = undefined;
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

		// Same (centerLon, centerLat) origin the mesh itself is built
		// around - required, not incidental (see CesiumCanvas's own note on
		// volumeTargets' centroid: mesh and shape-clip must share one origin).
		const polygonLocalXZ: [number, number][] = shapePositions.map(([lon, lat]) => {
			const { x, z } = toLocalMeters(lon, lat, centerLon, centerLat);
			return [x, z];
		});

		volumeTexture = buildData3DTexture(grid);
		materialHandle = createVolumeMaterial(
			volumeTexture,
			toLUTTexture(volumeControls.colormap),
			volumeControls.opacity,
			polygonLocalXZ,
		);
		volumeMesh = createVolumeMesh(widthM, depthTotalM, heightM, materialHandle);
		// Anchors the shallow (top) face at local y=0 regardless of the
		// group's vertical-exaggeration scale - see the header comment on
		// applyVerticalExaggeration below for why this has to be a group
		// scale, not a mesh-level one.
		volumeMesh.position.y = -depthTotalM / 2;
		volumeGroup.add(volumeMesh);

		// A "coordinate system" reference frame around the (now
		// shape-clipped) data - the box's bounding edges, exaggerated in
		// lockstep with the volume itself since it's added to the same
		// group. Depth-axis text labels are separate DOM elements (see
		// updateDepthLabels), not part of this mesh.
		wireframeMesh = new THREE.LineSegments(
			new THREE.EdgesGeometry(volumeMesh.geometry),
			new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
		);
		wireframeMesh.position.copy(volumeMesh.position);
		volumeGroup.add(wireframeMesh);

		boxDims = { width: widthM, height: heightM, depthTotal: depthTotalM };
		applyVerticalExaggeration();

		// Only a floor for syncCameraToCesium's dynamic near/far (see
		// there) - not applied to the camera directly here. A one-time
		// near/far sized off the box's own dimensions broke as soon as the
		// user free-navigated Cesium's camera to a very different distance
		// from the shape than it started at (e.g. a rotate-drag that pivots
		// around a different ground point) - the box would appear to fill
		// the whole screen because the camera had ended up far closer to
		// (or inside) it than the fixed near/far range accounted for.
		sceneMaxDim = Math.max(widthM, heightM, depthTotalM * volumeControls.verticalExaggeration);
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

	const scratchLabelPos = new THREE.Vector3();

	/** Projects each depth level's ruler position (west-north top edge of
	 *  the box, at that depth) through the camera into screen pixels -
	 *  called every frame (camera + exaggeration both change live), same
	 *  imperative-DOM-write pattern as ShapeVisualiseButton. */
	function updateDepthLabels(): void {
		const grid = volumetricMode.grid;
		if (!camera || !renderer || !grid || boxDims.depthTotal <= 0) return;
		const shallow = grid.depths[0] ?? 0;
		const deepest = grid.depths[grid.depths.length - 1] ?? shallow;
		const depthSpan = deepest - shallow || 1;
		const { clientWidth, clientHeight } = renderer.domElement;

		for (let i = 0; i < grid.depths.length; i++) {
			const el = depthLabelEls.get(i);
			if (!el) continue;
			const fraction = (grid.depths[i] - shallow) / depthSpan; // 0 at shallow, 1 at deepest
			const worldY = -fraction * boxDims.depthTotal * volumeControls.verticalExaggeration;
			scratchLabelPos.set(-boxDims.width / 2, worldY, -boxDims.height / 2); // west-north edge
			scratchLabelPos.project(camera);

			if (scratchLabelPos.z > 1) {
				el.style.display = "none";
				continue;
			}
			const x = ((scratchLabelPos.x + 1) / 2) * clientWidth;
			const y = ((1 - scratchLabelPos.y) / 2) * clientHeight;
			el.style.display = "block";
			el.style.left = `${x}px`;
			el.style.top = `${y}px`;
		}
	}

	/** Mirrors Cesium's current camera into this scene's camera - called
	 *  every frame (see animate below), not once, so the volume tracks
	 *  Cesium's own live pan/zoom/rotate exactly instead of drifting off
	 *  into an independently-navigated view. */
	function syncCameraToCesium(): void {
		if (!camera) return;
		const snapshot = captureLocalCameraSnapshot(viewer, centroid);
		if (!snapshot) return;
		camera.position.set(...snapshot.position);
		camera.up.set(...snapshot.up);
		camera.lookAt(...snapshot.target);

		// Near/far sized off the camera's LIVE distance to the shape, not a
		// one-time value computed from the box's own dimensions - Cesium's
		// camera is fully free to navigate during the popout (drag/zoom/
		// rotate), and a rotate can pivot around a different ground point
		// than the shape centroid, changing that distance a lot. A fixed
		// range broke (the box appeared to fill the whole screen) the
		// moment the camera ended up much closer than the range assumed.
		const distance = Math.hypot(
			camera.position.x - snapshot.target[0],
			camera.position.y - snapshot.target[1],
			camera.position.z - snapshot.target[2],
		);
		const near = Math.max(0.05, Math.min(distance / 100, sceneMaxDim / 1000));
		const far = Math.max(distance * 4, sceneMaxDim * 20);
		if (camera.fov !== snapshot.fovDeg || camera.near !== near || camera.far !== far) {
			camera.fov = snapshot.fovDeg;
			camera.near = near;
			camera.far = far;
			camera.updateProjectionMatrix();
		}
	}

	function animate(): void {
		rafId = requestAnimationFrame(animate);
		syncCameraToCesium();
		updateDepthLabels();
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

		volumeGroup = new THREE.Group();
		scene.add(volumeGroup);

		const [west, south, east, north] = bboxOfShapePositions(shapePositions);
		scene.add(buildOutline((west + east) / 2, (south + north) / 2));

		scene.add(new THREE.AmbientLight(0xffffff, 0.6));
		const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight.position.set(1, 2, 1);
		scene.add(dirLight);

		syncCameraToCesium();
		rebuildVolume();
		window.addEventListener("resize", handleResize);
		rafId = requestAnimationFrame(animate);
	});

	$effect(() => {
		// Re-run whenever a fresh grid arrives (rebuildVolume no-ops if it's
		// the same object it already built for) - the volume mesh fades in
		// once the fetch finishes, without blocking anything before that (see
		// StatusBar.svelte's own loading indicator instead of a blocking
		// overlay here).
		void volumetricMode.grid;
		rebuildVolume();
	});

	$effect(() => {
		materialHandle?.setOpacity(volumeControls.opacity);
	});
	$effect(() => {
		if (materialHandle) {
			const lut = toLUTTexture(volumeControls.colormap);
			materialHandle.setColormap(lut);
			(window as unknown as { __dbgColormap: unknown }).__dbgColormap = {
				name: volumeControls.colormap,
				lutUuid: lut.uuid,
				materialLutUuid: materialHandle.material.uniforms.uColormap.value?.uuid,
				sameObject: materialHandle.material.uniforms.uColormap.value === lut,
				first4: Array.from((lut.image.data as Uint8Array).slice(0, 4)),
			};
		}
	});
	$effect(() => {
		void volumeControls.verticalExaggeration;
		applyVerticalExaggeration();
	});

	onDestroy(() => {
		window.removeEventListener("resize", handleResize);
		if (rafId !== undefined) cancelAnimationFrame(rafId);
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

<div class="volumetric-scene" bind:this={containerEl}></div>

{#if volumetricMode.grid}
	{#each volumetricMode.grid.depths as depth, i (i)}
		<div class="depth-label" use:registerDepthLabel={i}>{formatDepthLabel(depth)}</div>
	{/each}
{/if}

{#if volumetricMode.error}
	<div class="error-banner">
		<p>{volumetricMode.error}</p>
		<button type="button" onclick={onExit}>Exit 3D View</button>
	</div>
{/if}

<style>
	.volumetric-scene {
		position: fixed;
		inset: 0;
		/* Above Cesium's canvas + PolygonDimOverlay (z-index 12), below the
		   right control panel (SidePanel, z-index 20) - see
		   VolumeControlPanel.svelte's header comment for the full stack. */
		z-index: 16;
		background: transparent;
		/* This canvas has no controls of its own (see syncCameraToCesium) -
		   every drag/wheel/click must reach Cesium's canvas underneath. */
		pointer-events: none;
	}
	.volumetric-scene :global(canvas) {
		display: block;
	}
	.depth-label {
		position: fixed;
		left: 0;
		top: 0;
		transform: translate(-100%, -50%);
		display: none;
		padding: 0.1rem 0.4rem;
		margin-right: 0.4rem;
		border-radius: 4px;
		background: rgba(10, 12, 16, 0.65);
		color: rgba(255, 255, 255, 0.85);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		pointer-events: none;
		z-index: 17;
	}
	.error-banner {
		position: fixed;
		top: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 25;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		border-radius: 10px;
		background: rgba(30, 10, 10, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 128, 128, 0.3);
		color: #ffb3b3;
		font-size: 0.8rem;
		max-width: 26rem;
	}
	.error-banner button {
		flex-shrink: 0;
		padding: 0.3rem 0.7rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		cursor: pointer;
	}
</style>
