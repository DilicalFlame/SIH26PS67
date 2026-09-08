<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import * as THREE from 'three';
	import { buildGraticule } from '$lib/geo/geo-parser';
	import { buildSouthPolarCap } from '$lib/geo/polar-cap';
	import { ProjectionType } from '$lib/types/projection';
	import { TileManager } from '$lib/tiles/tile-manager';
	import { TILE_LAYERS, MAX_TILE_ZOOM, OCEAN_COLOR, VOID_COLOR } from '$lib/tiles/layers.config';
	import { unprojectPoint, viewDirection, zoomForScale, scaleForZoom } from '$lib/tiles/projection-math';

	// Imported without ?raw so vite-plugin-glsl resolves the #include of the
	// shared projection chunk.
	import vertSrc from '$lib/shaders/globe.vert.glsl';
	import fragSrc from '$lib/shaders/globe.frag.glsl';
	import fillVertSrc from '$lib/shaders/fill.vert.glsl';
	import fillFragSrc from '$lib/shaders/fill.frag.glsl';
	import bodyVertSrc from '$lib/shaders/globeBody.vert.glsl';
	import bodyFragSrc from '$lib/shaders/globeBody.frag.glsl';
	import geoFillVertSrc from '$lib/shaders/geofill.vert.glsl';

	// Props
	interface Props {
		activeProjection?: ProjectionType;
	}
	const { activeProjection = ProjectionType.Sphere }: Props = $props();

	// Canvas ref
	let canvasEl: HTMLCanvasElement;

	// Three.js core
	let renderer: THREE.WebGLRenderer;
	let scene:    THREE.Scene;
	let camera:   THREE.OrthographicCamera;
	let fillMat:  THREE.ShaderMaterial;  // prototype cloned per styled layer
	let gratMat:  THREE.ShaderMaterial;
	let ocean:    THREE.Mesh;            // full-screen quad, masked to the map shape
	let bodyMat:  THREE.ShaderMaterial;
	let rafId:     number;
	let tileManager: TileManager;
	/** Whole-world meshes, drawn once per visible east-west copy of the map. */
	let worldCopies: { graticule: THREE.LineSegments; cap: THREE.Mesh; shift: number }[] = [];
	let capMat: THREE.ShaderMaterial;

	// Graticule sits just above the ocean and below the land fills.
	const GRAT_COLOR = 0x6f9dc0;
	// Must match the antarctica_ice style so the cap and the tiles read as one.
	const ANTARCTIC_ICE_COLOR = 0xf4f7fa;

	// Wheel-velocity prefetch state
	let lastWheelTime = 0;
	let wheelVelocity  = 0; // EMA of signed px/ms (+ = zooming in)

	// Cursor-anchored zoom: NDC position the zoom should keep pinned.
	let zoomAnchorX = 0;
	let zoomAnchorY = 0;

	// Constants
	// Scale: fraction of the viewport half-height the globe / map occupies.
	const BASE_SCALE = 0.82;
	// Floor chosen so the globe/map always fills a decent share of the
	// viewport — below this it shrinks into an island in a black void.
	const MIN_SCALE  = 0.62;
	// Max zoom is derived from the deepest tile zoom the data actually carries,
	// so camera zoom and tile detail can't drift apart. Recomputed on resize
	// since it depends on canvas width. Past this the camera would only be
	// magnifying z14 geometry, which tile-manager already clamps to.
	let maxScale = 4096;
	// Smoothstep tween duration (ms) for projection morphing.
	const TWEEN_MS = 800;

	// Trackball state
	// A single quaternion accumulates all drags for both sphere and 2D modes.
	const rotQuat = new THREE.Quaternion();
	const rotMat3 = new THREE.Matrix3();
	const tmpMat4 = new THREE.Matrix4();

	// Zoom state. currentScale eases toward targetScale each frame so wheel
	// input feels smooth rather than stepped, and so the tile LOD changes are
	// spread over several frames instead of snapping.
	let currentScale = BASE_SCALE;
	let targetScale  = BASE_SCALE;
	const ZOOM_DAMPING = 0.18;

	// Flat projections pan (in map units) instead of rotating the globe, and
	// are always zoomed in far enough to fill the viewport — you move within
	// the plane rather than seeing it float as a plate.
	const mapPan = new THREE.Vector2(0, 0);

	/** Smallest scale at which the flat map still fills the viewport. */
	function minScaleFor(projection: number, aspect: number): number {
		if (projection === ProjectionType.Sphere) return MIN_SCALE;
		// Only the vertical fit constrains it: the map wraps east-west, so it
		// always fills the width. Visible half-height in map units is
		// 1/(aspect*scale) and the map spans ±0.5.
		return 2 / aspect;
	}

	/**
	 * Longitude wraps, so x is folded back into one world width rather than
	 * clamped — panning east past the dateline continues into the next copy.
	 * Latitude has real ends, so y stops where the poles reach the viewport.
	 */
	function clampPan(): void {
		const aspect = gratMat?.uniforms.u_aspect.value ?? 1;
		const WORLD_WIDTH = 2;
		mapPan.x = ((((mapPan.x + 1) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH) - 1;
		const halfY = Math.max(0, 0.5 - 1 / (aspect * currentScale));
		mapPan.y = Math.max(-halfY, Math.min(halfY, mapPan.y));
	}

	/** True while the flat-map navigation model is the dominant one. */
	function isFlatMode(): boolean {
		const dominant = tweenActive ? pendingProjection : currentProjection;
		return dominant !== ProjectionType.Sphere;
	}

	// Projection morph tween
	let currentProjection = 0;  // matches shader int 0–3
	let pendingProjection = 0;
	let tweenStart = 0;
	let tweenActive = false;

	// Pointer drag
	let isDragging   = false;
	// Sensitivity: radians per pixel
	const SENSITIVITY = 0.004;

	// =========================================================================
	// Line material — used by the graticule only; coastlines are filled.
	// =========================================================================
	function makeLineMat(): THREE.ShaderMaterial {
		return new THREE.ShaderMaterial({
			vertexShader:   vertSrc,
			fragmentShader: fragSrc,
			transparent:    true,
			depthTest:      false,
			depthWrite:     false,
			uniforms: {
				u_globeRotation:   { value: new THREE.Matrix3() },
				u_projectionTypeA: { value: 0 },
				u_projectionTypeB: { value: 0 },
				u_blend:           { value: 0.0 },
				u_scale:           { value: currentScale },
				u_aspect:          { value: 1.0 },
				u_pan:             { value: new THREE.Vector2(0, 0) },
				u_worldShift:      { value: 0 },
				u_lineColor:       { value: new THREE.Color(GRAT_COLOR) },
				u_globalAlpha:     { value: 0.35 },
				u_tileCenter:      { value: new THREE.Vector2(0, 0) },
				u_tileHalfExtent:  { value: new THREE.Vector2(0, 0) },
			},
		});
	}

	// Prototype for the tile fills; TileManager clones it per styled layer and
	// sets the colour, so all tiles of a layer share one material and one
	// uniform sync per frame.
	function makeFillMat(): THREE.ShaderMaterial {
		return new THREE.ShaderMaterial({
			vertexShader:   fillVertSrc,
			fragmentShader: fillFragSrc,
			// Opaque in appearance, but flagged transparent so it shares the
			// renderOrder-sorted pass with the ocean quad. As an opaque-pass
			// material it would draw before the ocean, which would then paint
			// straight over every landmass.
			transparent:    true,
			// Fills are fully opaque and clip with discard, so blending buys
			// nothing — and it costs: shared triangle edges get composited
			// twice, drawing a visible web of seams across every filled area.
			blending:       THREE.NoBlending,
			depthTest:      false,
			depthWrite:     false,
			// Winding is not meaningful here: the tile Y axis is flipped during
			// quantization, and the projection itself can reverse orientation
			// (near the limb, or between projections), so face culling would
			// drop arbitrary triangles.
			side:           THREE.DoubleSide,
			uniforms: {
				u_globeRotation:   { value: new THREE.Matrix3() },
				u_projectionTypeA: { value: 0 },
				u_projectionTypeB: { value: 0 },
				u_blend:           { value: 0.0 },
				u_scale:           { value: currentScale },
				u_aspect:          { value: 1.0 },
				u_pan:             { value: new THREE.Vector2(0, 0) },
				u_sphereWeight:    { value: 1.0 },
				u_color:           { value: new THREE.Color(0xffffff) },
				u_opacity:         { value: 1.0 },
				u_tileLon:         { value: new THREE.Vector2(0, 0) },
				u_tileMercY:       { value: new THREE.Vector2(0.5, 0.5) },
			},
		});
	}

	// =========================================================================
	// Push current rotation + projection state to the graticule material
	// (tile fills are synced by TileManager).
	// =========================================================================
	function syncUniforms(): void {
		const blend = gratMat.uniforms.u_blend.value as number;
		let sphereWeight = 0;
		if (currentProjection === ProjectionType.Sphere) sphereWeight += 1 - blend;
		if (pendingProjection === ProjectionType.Sphere) sphereWeight += blend;

		for (const copy of worldCopies) {
			for (const mat of [
				copy.graticule.material as THREE.ShaderMaterial,
				copy.cap.material as THREE.ShaderMaterial,
			]) {
				const u = mat.uniforms;
				u.u_globeRotation.value = rotMat3;
				u.u_projectionTypeA.value = currentProjection;
				u.u_projectionTypeB.value = pendingProjection;
				u.u_blend.value = blend;
				u.u_scale.value = currentScale;
				u.u_aspect.value = gratMat.uniforms.u_aspect.value;
				u.u_pan.value.copy(mapPan);
				if (u.u_globalAlpha) u.u_globalAlpha.value = gratMat.uniforms.u_globalAlpha.value;
				if (u.u_sphereWeight) u.u_sphereWeight.value = Math.max(0, Math.min(1, sphereWeight));
			}
		}
	}

	// The ocean quad covers the whole frustum — its shader masks it to the
	// current projection shape — so it only needs the aspect fit.
	function syncOceanScale(): void {
		if (!ocean) return;
		ocean.scale.set(gratMat?.uniforms.u_aspect.value ?? 1, 1, 1);
	}

	// =========================================================================
	// Scene setup
	// =========================================================================
	async function initScene(): Promise<void> {
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		const aspect = w / h;

		// Renderer
		renderer = new THREE.WebGLRenderer({
			canvas:    canvasEl,
			antialias: true,
			alpha:     false,
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(w, h, false);
		renderer.setClearColor(VOID_COLOR, 1);

		// Scene
		scene = new THREE.Scene();

		// Orthographic camera
		// Frustum:  left/right = ±aspect, top/bottom = ±1.
		// This ensures:
		//   - world y ∈ [-1,1]  → NDC y ∈ [-1,1]   (1 world unit = 1 NDC unit)
		//   - world x ∈ [-a,a]  → NDC x ∈ [-1,1]   (1 world unit = 1/aspect NDC unit)
		// A sphere of world-radius r therefore appears as a circle of radius
		// r × (H/2) pixels — exactly matching the line shader's scale formula.
		camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 100);
		camera.position.set(0, 0, 2);

		// Ocean. A full-screen quad whose shader masks it to whichever projection
		// shape is current (disc / rectangle / ellipse), morphing between them,
		// so every projection gets the same treatment from one draw call.
		bodyMat = new THREE.ShaderMaterial({
			vertexShader:   bodyVertSrc,
			fragmentShader: bodyFragSrc,
			transparent: true,
			depthTest:  false,
			depthWrite: false,
			uniforms: {
				u_ocean:           { value: new THREE.Color(OCEAN_COLOR) },
				u_scale:           { value: currentScale },
				u_aspect:          { value: aspect },
				u_projectionTypeA: { value: 0 },
				u_projectionTypeB: { value: 0 },
				u_blend:           { value: 0.0 },
				u_pan:             { value: new THREE.Vector2(0, 0) },
			},
		});
		ocean = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bodyMat);
		ocean.renderOrder = -1;
		scene.add(ocean);

		// Materials
		fillMat = makeFillMat();
		gratMat = makeLineMat();
		fillMat.uniforms.u_aspect.value = aspect;
		gratMat.uniforms.u_aspect.value = aspect;
		maxScale = scaleForZoom(MAX_TILE_ZOOM, w);
		syncOceanScale();

		// Whole-world furniture: the graticule, and the south polar cap that
		// covers the ground the Mercator tile pyramid can't reach (it stops at
		// ±85.05°, leaving a hole under Antarctica).
		//
		// Each is drawn once per visible east-west copy of the map. Wrapping
		// them per-vertex instead would tear them in half at the wrap point,
		// since a single mesh spans the whole world.
		gratMat.uniforms.u_tileHalfExtent.value.set(Math.PI, Math.PI / 2);
		capMat = new THREE.ShaderMaterial({
			vertexShader:   geoFillVertSrc,
			fragmentShader: fillFragSrc,
			transparent: true,
			blending:    THREE.NoBlending, // see makeFillMat
			depthTest:  false,
			depthWrite: false,
			side:       THREE.DoubleSide,
			uniforms: {
				u_globeRotation:   { value: new THREE.Matrix3() },
				u_projectionTypeA: { value: 0 },
				u_projectionTypeB: { value: 0 },
				u_blend:           { value: 0.0 },
				u_scale:           { value: currentScale },
				u_aspect:          { value: aspect },
				u_pan:             { value: new THREE.Vector2(0, 0) },
				u_worldShift:      { value: 0 },
				u_sphereWeight:    { value: 1.0 },
				u_color:           { value: new THREE.Color(ANTARCTIC_ICE_COLOR) },
				u_opacity:         { value: 1.0 },
			},
		});

		for (const shift of [-2, 0, 2]) {
			const gMat = gratMat.clone();
			gMat.uniforms.u_worldShift.value = shift;
			const { graticule } = buildGraticule(gMat);
			graticule.renderOrder = 0;
			scene.add(graticule);

			const cMat = capMat.clone();
			cMat.uniforms.u_worldShift.value = shift;
			const cap = buildSouthPolarCap(cMat);
			// Under the ice tiles, which draw the real coastline over it.
			cap.renderOrder = 1;
			scene.add(cap);

			worldCopies.push({ graticule, cap, shift });
		}

		// Coastlines (and any future layers): streamed as PMTiles vector
		// tiles, decoded and triangulated in workers, quantized, LOD-managed.
		tileManager = new TileManager();
		try {
			await tileManager.init(scene, fillMat, TILE_LAYERS);
		} catch (err) {
			console.error('[GlobeCanvas] Failed to initialize tile layers:', err);
		}

		// Resize observer
		const ro = new ResizeObserver(onResize);
		ro.observe(canvasEl);

		// Pointer events (trackball, always active)
		canvasEl.addEventListener('pointerdown',  onPointerDown);
		canvasEl.addEventListener('pointermove',  onPointerMove);
		canvasEl.addEventListener('pointerup',    onPointerUp);
		canvasEl.addEventListener('pointerleave', onPointerUp);
		canvasEl.addEventListener('wheel',        onWheel, { passive: false });
		// Prevent context-menu on long-press (mobile)
		canvasEl.addEventListener('contextmenu',  (e) => e.preventDefault());

		// Start render loop
		rafId = requestAnimationFrame(animate);
	}

	// =========================================================================
	// Resize
	// =========================================================================
	function onResize(): void {
		if (!renderer) return;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		const aspect = w / h;

		renderer.setSize(w, h, false);

		// Update orthographic frustum
		camera.left   = -aspect;
		camera.right  =  aspect;
		camera.top    =  1;
		camera.bottom = -1;
		camera.updateProjectionMatrix();

		// Update shader aspect uniforms (tile fills are synced by TileManager).
		gratMat.uniforms.u_aspect.value = aspect;
		bodyMat.uniforms.u_aspect.value = aspect;
		syncOceanScale();

		maxScale = scaleForZoom(MAX_TILE_ZOOM, w);
	}

	// =========================================================================
	// Trackball pointer events
	// =========================================================================
	function onPointerDown(e: PointerEvent): void {
		isDragging = true;
		canvasEl.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent): void {
		if (!isDragging) return;

		if (isFlatMode()) {
			// Translate the plane, converting pixels to map units so the dragged
			// feature stays exactly under the pointer.
			const aspect = gratMat.uniforms.u_aspect.value;
			const halfW = canvasEl.clientWidth / 2;
			const halfH = canvasEl.clientHeight / 2;
			mapPan.x -= (e.movementX / halfW) / currentScale;
			mapPan.y += (e.movementY / halfH) / (aspect * currentScale);
			clampPan();
			return;
		}

		// Sensitivity must fall off with zoom: a fixed radians-per-pixel rate
		// flings the view across the planet once zoomed in, making deep zoom
		// impossible to navigate. Dividing by scale keeps the dragged feature
		// pinned to the pointer at every depth.
		const rate = SENSITIVITY * (BASE_SCALE / currentScale);
		const dx = e.movementX * rate;
		const dy = e.movementY * rate;

		// Our shader coordinate system:
		//   X = depth/forward  (cos(lat)·cos(lon) at lon=0, lat=0)
		//   Y = east            (cos(lat)·sin(lon))   → maps to screen-X
		//   Z = north           (sin(lat))             → maps to screen-Y
		//
		// Horizontal drag (dx) → rotate around Z axis (north/up on screen)
		// Vertical   drag (dy) → rotate around Y axis (east/right on screen)
		const qLon = new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 0, 1), dx
		);
		const qLat = new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 1, 0), dy
		);
		rotQuat.premultiply(qLon).premultiply(qLat).normalize();

		// Extract mat3 for the shader uniform
		tmpMat4.makeRotationFromQuaternion(rotQuat);
		rotMat3.setFromMatrix4(tmpMat4);
	}

	function onPointerUp(e: PointerEvent): void {
		isDragging = false;
		if (canvasEl.hasPointerCapture(e.pointerId)) {
			canvasEl.releasePointerCapture(e.pointerId);
		}
	}

	// =========================================================================
	// Zoom (wheel)
	// =========================================================================
	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		// Exponential in wheel delta, so a tick feels the same at every depth.
		const zoomFactor = Math.exp(-e.deltaY * 0.0015);
		const floor = minScaleFor(tweenActive ? pendingProjection : currentProjection,
		                          gratMat.uniforms.u_aspect.value);
		targetScale = Math.max(floor, Math.min(maxScale, targetScale * zoomFactor));

		const rect = canvasEl.getBoundingClientRect();
		zoomAnchorX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		zoomAnchorY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

		// Wheel-velocity prefetch: predict where the zoom is heading and warm
		// the tile cache under the cursor ray ahead of time.
		const now = performance.now();
		const dt  = Math.max(1, now - lastWheelTime);
		lastWheelTime = now;
		wheelVelocity = wheelVelocity * 0.7 + (-e.deltaY / dt) * 0.3;

		if (tileManager) {
			const geo = unprojectPoint(zoomAnchorX, zoomAnchorY, {
				rotMat3,
				scale: currentScale,
				aspect: gratMat.uniforms.u_aspect.value,
				projectionType: tweenActive ? pendingProjection : currentProjection,
			});
			if (geo) {
				tileManager.onWheelVelocity({
					lon: (geo.lon * 180) / Math.PI,
					lat: (geo.lat * 180) / Math.PI,
					currentZ: zoomForScale(currentScale, canvasEl.clientWidth),
					velocityPxPerMs: wheelVelocity,
				});
			}
		}
	}

	// =========================================================================
	// Cursor-anchored zoom
	// Keeps the geography under the cursor pinned as the scale eases, by
	// rotating the globe by the delta between the directions the cursor
	// pointed at before and after the scale change. Projection-agnostic:
	// every projection shares the same rotate-then-project pipeline.
	// =========================================================================
	function applyZoomAnchor(prevScale: number, nextScale: number): void {
		const aspect = gratMat.uniforms.u_aspect.value;
		const projectionType = tweenActive ? pendingProjection : currentProjection;

		if (isFlatMode()) {
			// Keep the map point under the cursor fixed: it sits at
			// pan + ndc/scale, so pan absorbs the change in 1/scale.
			mapPan.x += zoomAnchorX * (1 / prevScale - 1 / nextScale);
			mapPan.y += (zoomAnchorY / aspect) * (1 / prevScale - 1 / nextScale);
			clampPan();
			return;
		}

		const before = viewDirection(zoomAnchorX, zoomAnchorY, {
			rotMat3, scale: prevScale, aspect, projectionType
		});
		const after = viewDirection(zoomAnchorX, zoomAnchorY, {
			rotMat3, scale: nextScale, aspect, projectionType
		});
		if (!before || !after) return;

		// R' = Q·R with Q·before = after keeps the same world point under the cursor.
		const q = new THREE.Quaternion().setFromUnitVectors(before, after);
		rotQuat.premultiply(q).normalize();
		tmpMat4.makeRotationFromQuaternion(rotQuat);
		rotMat3.setFromMatrix4(tmpMat4);
	}

	// =========================================================================
	// Projection switch — starts u_blend tween
	// =========================================================================
	function switchProjection(next: number): void {
		if (next === currentProjection && !tweenActive) return;

		pendingProjection = next;

		gratMat.uniforms.u_projectionTypeA.value = currentProjection;
		gratMat.uniforms.u_projectionTypeB.value = next;
		gratMat.uniforms.u_blend.value           = 0.0;

		tweenStart  = performance.now();
		tweenActive = true;

		// Entering a flat projection: zoom out to the fit-the-viewport scale and
		// recentre, so the plane always arrives full-screen.
		const floor = minScaleFor(next, gratMat.uniforms.u_aspect.value);
		if (next !== ProjectionType.Sphere) {
			targetScale = Math.max(floor, currentScale);
			mapPan.set(0, 0);
		} else {
			targetScale = Math.min(targetScale, Math.max(MIN_SCALE, BASE_SCALE));
		}
	}

	// =========================================================================
	// Animation loop
	// =========================================================================
	function animate(now: number): void {
		rafId = requestAnimationFrame(animate);

		// Drive tween
		if (tweenActive) {
			const t     = Math.min((now - tweenStart) / TWEEN_MS, 1.0);
			const blend = t * t * (3.0 - 2.0 * t);   // smoothstep

			gratMat.uniforms.u_blend.value = blend;

			if (t >= 1.0) {
				tweenActive       = false;
				currentProjection = pendingProjection;

				gratMat.uniforms.u_projectionTypeA.value = currentProjection;
				gratMat.uniforms.u_projectionTypeB.value = currentProjection;
				gratMat.uniforms.u_blend.value           = 0.0;
			}
		}

		// Ease zoom toward its target, then push the resulting scale everywhere.
		if (Math.abs(targetScale - currentScale) > currentScale * 1e-4) {
			const prevScale = currentScale;
			currentScale += (targetScale - currentScale) * ZOOM_DAMPING;
			applyZoomAnchor(prevScale, currentScale);
		} else {
			currentScale = targetScale;
		}
		// A flat map must never zoom out past covering the viewport.
		const floor = minScaleFor(tweenActive ? pendingProjection : currentProjection,
		                          gratMat.uniforms.u_aspect.value);
		if (targetScale < floor) targetScale = floor;
		if (currentScale < floor) currentScale = floor;
		clampPan();

		gratMat.uniforms.u_scale.value = currentScale;
		gratMat.uniforms.u_pan.value.copy(mapPan);
		bodyMat.uniforms.u_pan.value.copy(mapPan);

		// The ocean follows the same projection/morph state as the fills so its
		// shape stays locked to the coastlines.
		bodyMat.uniforms.u_scale.value           = currentScale;
		bodyMat.uniforms.u_projectionTypeA.value = currentProjection;
		bodyMat.uniforms.u_projectionTypeB.value = pendingProjection;
		bodyMat.uniforms.u_blend.value           = gratMat.uniforms.u_blend.value;

		// Graticule is reference furniture, not data: let it recede as the view
		// zooms in, where a 15° grid is far off-screen and only adds noise.
		const gratFade = 1 - Math.min(1, Math.max(0, (currentScale / BASE_SCALE - 2) / 10));
		gratMat.uniforms.u_globalAlpha.value = 0.28 * gratFade;

		// Push rotation uniform
		syncUniforms();

		tileManager?.update({
			rotMat3,
			scale:         currentScale,
			aspect:        gratMat.uniforms.u_aspect.value,
			canvasWidthPx: canvasEl.clientWidth,
			projectionA:   currentProjection,
			projectionB:   pendingProjection,
			blend:         gratMat.uniforms.u_blend.value,
			pan:           mapPan,
		});

		renderer.render(scene, camera);
	}

	// =========================================================================
	// Svelte reactive: respond to parent activeProjection prop changes
	// =========================================================================
	$effect(() => {
		// activeProjection is from $props() → reactive.
		// Runs whenever the parent changes the prop.
		// Use Number() to guard against esbuild const-enum mangling.
		const p = Number(activeProjection);
		if (renderer && p !== currentProjection) {
			switchProjection(p);
		}
	});

	// =========================================================================
	// Lifecycle
	// =========================================================================
	onMount(() => { initScene(); });

	onDestroy(() => {
		if (!browser) return;
		cancelAnimationFrame(rafId);
		tileManager?.dispose();
		renderer?.dispose();
	});
</script>

<canvas
	bind:this={canvasEl}
	class="globe-canvas"
	aria-label="Interactive world map projection. Drag to rotate"
></canvas>

<style>
	.globe-canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: grab;
		outline: none;
	}
	.globe-canvas:active {
		cursor: grabbing;
	}
</style>
