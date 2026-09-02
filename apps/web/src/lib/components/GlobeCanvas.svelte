<!--
  GlobeCanvas.svelte  (v2)
  ========================
  Three.js scene for the GPU-driven map projection engine.

  Architecture changes from v1:
  • OrthographicCamera replaces PerspectiveCamera — world-space units map
    directly to NDC units, so the sphere background exactly matches the
    shader's u_scale.
  • OrbitControls REMOVED — the ShaderMaterial bypasses camera matrices, so
    orbiting the camera would move the sphere body but not the lines.
    Instead, a single trackball (pointer events → quaternion → u_globeRotation)
    works identically in all modes.
  • Background changed from SphereGeometry → CircleGeometry — simpler and
    perfectly matches the orthographic globe silhouette.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import * as THREE from 'three';
	import { parseGeoBuffers } from '$lib/geo/geo-parser';
	import { ProjectionType } from '$lib/types/projection';

	// Shader sources (vite-plugin-glsl imports them as strings)
	import vertSrc from '$lib/shaders/globe.vert.glsl?raw';
	import fragSrc from '$lib/shaders/globe.frag.glsl?raw';

	// ── Props ─────────────────────────────────────────────────────────────────
	interface Props {
		activeProjection?: ProjectionType;
	}
	const { activeProjection = ProjectionType.Sphere }: Props = $props();

	// ── Canvas ref ────────────────────────────────────────────────────────────
	let canvasEl: HTMLCanvasElement;

	// ── Three.js core ─────────────────────────────────────────────────────────
	let renderer: THREE.WebGLRenderer;
	let scene:    THREE.Scene;
	let camera:   THREE.OrthographicCamera;
	let shaderMat: THREE.ShaderMaterial;
	let gratMat:   THREE.ShaderMaterial;
	let globeBg:   THREE.Mesh;          // dark circle behind lines in sphere mode
	let rafId:     number;

	// ── Constants ─────────────────────────────────────────────────────────────
	// Scale: fraction of the viewport half-height the globe / map occupies.
	const BASE_SCALE = 0.82;
	const MIN_SCALE  = 0.3;
	const MAX_SCALE  = 2.0;
	// Smoothstep tween duration (ms) for projection morphing.
	const TWEEN_MS = 800;

	// ── Trackball state ───────────────────────────────────────────────────────
	// A single quaternion accumulates all drags for both sphere and 2D modes.
	const rotQuat = new THREE.Quaternion();
	const rotMat3 = new THREE.Matrix3();
	const tmpMat4 = new THREE.Matrix4();

	// ── Zoom state ───────────────────────────────────────────────────────────
	let currentScale = BASE_SCALE;

	// ── Projection morph tween ────────────────────────────────────────────────
	let currentProjection = 0;  // matches shader int 0–3
	let pendingProjection = 0;
	let tweenStart = 0;
	let tweenActive = false;

	// ── Pointer drag ──────────────────────────────────────────────────────────
	let isDragging   = false;
	// Sensitivity: radians per pixel
	const SENSITIVITY = 0.004;

	// =========================================================================
	// Build a shader material for borders or graticule
	// =========================================================================
	function makeMat(isGraticule: boolean): THREE.ShaderMaterial {
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
				u_isGraticule:     { value: isGraticule ? 1.0 : 0.0 },
				u_lineColor:       { value: new THREE.Color(isGraticule ? 0x2d2d3a : 0xd8d8d8) },
				u_globalAlpha:     { value: 1.0 },
			},
		});
	}

	// =========================================================================
	// Push current rotMat3 + projection state to both materials
	// =========================================================================
	function syncUniforms(): void {
		for (const mat of [shaderMat, gratMat]) {
			mat.uniforms.u_globeRotation.value   = rotMat3;
			mat.uniforms.u_projectionTypeA.value = currentProjection;
			mat.uniforms.u_projectionTypeB.value = pendingProjection;
		}
	}

	// =========================================================================
	// Scene setup
	// =========================================================================
	async function initScene(): Promise<void> {
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		const aspect = w / h;

		// ── Renderer ──────────────────────────────────────────────────────────
		renderer = new THREE.WebGLRenderer({
			canvas:    canvasEl,
			antialias: true,
			alpha:     false,
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(w, h, false);
		renderer.setClearColor(0x0d0d0f, 1);

		// ── Scene ─────────────────────────────────────────────────────────────
		scene = new THREE.Scene();

		// ── Orthographic camera ───────────────────────────────────────────────
		// Frustum:  left/right = ±aspect, top/bottom = ±1.
		// This ensures:
		//   • world y ∈ [-1,1]  → NDC y ∈ [-1,1]   (1 world unit = 1 NDC unit)
		//   • world x ∈ [-a,a]  → NDC x ∈ [-1,1]   (1 world unit = 1/aspect NDC unit)
		// A sphere of world-radius r therefore appears as a circle of radius
		// r × (H/2) pixels — exactly matching the line shader's scale formula.
		camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 100);
		camera.position.set(0, 0, 2);

		// ── Globe background (dark circle, sphere mode only) ──────────────────
		// Radius = GLOBE_SCALE × 0.998 so it sits just inside the line silhouette.
		// Use a unit circle — we'll scale it each frame to match currentScale
		const bgGeo = new THREE.CircleGeometry(1.0, 128);
		const bgMat = new THREE.MeshBasicMaterial({ color: 0x111118 });
		globeBg = new THREE.Mesh(bgGeo, bgMat);
		globeBg.scale.setScalar(currentScale * 0.998);
		globeBg.renderOrder = 0;
		scene.add(globeBg);

		// ── Materials ─────────────────────────────────────────────────────────
		shaderMat = makeMat(false);
		gratMat   = makeMat(true);

		// Sync initial aspect
		shaderMat.uniforms.u_aspect.value = aspect;
		gratMat.uniforms.u_aspect.value   = aspect;

		// ── Geo buffers ───────────────────────────────────────────────────────
		try {
			const { borders, graticule } = await parseGeoBuffers(shaderMat);
			graticule.material = gratMat;
			graticule.renderOrder = 1;
			borders.renderOrder  = 2;
			scene.add(graticule);
			scene.add(borders);
		} catch (err) {
			console.error('[GlobeCanvas] Failed to load geo data:', err);
		}

		// ── Resize observer ───────────────────────────────────────────────────
		const ro = new ResizeObserver(onResize);
		ro.observe(canvasEl);

		// ── Pointer events (trackball, always active) ─────────────────────────
		canvasEl.addEventListener('pointerdown',  onPointerDown);
		canvasEl.addEventListener('pointermove',  onPointerMove);
		canvasEl.addEventListener('pointerup',    onPointerUp);
		canvasEl.addEventListener('pointerleave', onPointerUp);
		canvasEl.addEventListener('wheel',        onWheel, { passive: false });
		// Prevent context-menu on long-press (mobile)
		canvasEl.addEventListener('contextmenu',  (e) => e.preventDefault());

		// ── Start render loop ─────────────────────────────────────────────────
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

		// Update shader aspect uniform
		shaderMat.uniforms.u_aspect.value = aspect;
		gratMat.uniforms.u_aspect.value   = aspect;
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

		const dx = e.movementX * SENSITIVITY;
		const dy = e.movementY * SENSITIVITY;

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
		const zoomFactor = 1 - e.deltaY * 0.001;
		currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale * zoomFactor));

		// Update shader uniforms
		for (const mat of [shaderMat, gratMat]) {
			mat.uniforms.u_scale.value = currentScale;
		}
		// Update background circle size
		globeBg.scale.setScalar(currentScale * 0.998);
	}

	// =========================================================================
	// Projection switch — starts u_blend tween
	// =========================================================================
	function switchProjection(next: number): void {
		if (next === currentProjection && !tweenActive) return;

		pendingProjection = next;

		// Tell both materials what to blend from and to
		for (const mat of [shaderMat, gratMat]) {
			mat.uniforms.u_projectionTypeA.value = currentProjection;
			mat.uniforms.u_projectionTypeB.value = next;
			mat.uniforms.u_blend.value           = 0.0;
		}

		tweenStart  = performance.now();
		tweenActive = true;

		// Globe background: visible only when sphere is involved
		globeBg.visible = (next === 0 || currentProjection === 0);
	}

	// =========================================================================
	// Animation loop
	// =========================================================================
	function animate(now: number): void {
		rafId = requestAnimationFrame(animate);

		// ── Drive tween ───────────────────────────────────────────────────────
		if (tweenActive) {
			const t     = Math.min((now - tweenStart) / TWEEN_MS, 1.0);
			const blend = t * t * (3.0 - 2.0 * t);   // smoothstep

			for (const mat of [shaderMat, gratMat]) {
				mat.uniforms.u_blend.value = blend;
			}

			if (t >= 1.0) {
				tweenActive        = false;
				currentProjection  = pendingProjection;
				globeBg.visible    = (currentProjection === 0);

				for (const mat of [shaderMat, gratMat]) {
					mat.uniforms.u_projectionTypeA.value = currentProjection;
					mat.uniforms.u_projectionTypeB.value = currentProjection;
					mat.uniforms.u_blend.value           = 0.0;
				}
			}
		}

		// ── Push rotation uniform ──────────────────────────────────────────────
		syncUniforms();

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
		renderer?.dispose();
	});
</script>

<canvas
	bind:this={canvasEl}
	class="globe-canvas"
	aria-label="Interactive world map projection — drag to rotate"
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
