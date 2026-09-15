<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as THREE from "three";
    import {
        buildGraticule,
        pickGraticuleStep,
        DEFAULT_GRID_STEP,
    } from "$lib/geo/geo-parser";
    import { buildSouthPolarCap } from "$lib/geo/polar-cap";
    import { ProjectionType } from "$lib/types/projection";
    import { TileManager } from "$lib/tiles/tile-manager";
    import { PointLayer } from "$lib/render/point-layer";
    import {
        TILE_LAYERS,
        MAX_CAMERA_ZOOM,
        OCEAN_COLOR,
        VOID_COLOR,
    } from "$lib/tiles/layers.config";
    import {
        unprojectPoint,
        viewDirection,
        zoomForScale,
        scaleForZoom,
    } from "$lib/tiles/projection-math";
    import { lonLatToTile } from "$lib/tiles/tile-math";
    import { formatLatLonDMS } from "$lib/geo/dms";
    import { pickNiceScale } from "$lib/geo/scale-bar";
    import { viewStatus } from "$lib/state/view-status.svelte";
    import type StatusBar from "$lib/components/StatusBar.svelte";
    import HeadingControl from "$lib/components/HeadingControl.svelte";
    import TileDebugOverlay from "$lib/components/TileDebugOverlay.svelte";

    // Imported without ?raw so vite-plugin-glsl resolves the #include of the
    // shared projection chunk.
    import vertSrc from "$lib/shaders/globe.vert.glsl";
    import fragSrc from "$lib/shaders/globe.frag.glsl";
    import fillVertSrc from "$lib/shaders/fill.vert.glsl";
    import fillFragSrc from "$lib/shaders/fill.frag.glsl";
    import bodyVertSrc from "$lib/shaders/globeBody.vert.glsl";
    import bodyFragSrc from "$lib/shaders/globeBody.frag.glsl";
    import geoFillVertSrc from "$lib/shaders/geofill.vert.glsl";

    // Props
    interface Props {
        activeProjection?: ProjectionType;
        showGraticule?: boolean;
        statusBar?: StatusBar;
    }
    const {
        activeProjection = ProjectionType.Sphere,
        showGraticule = true,
        statusBar,
    }: Props = $props();

    // Canvas ref
    let canvasEl: HTMLCanvasElement;
    let hasCrashed = $state(false);

    // Heading-control instance (rendered below), for the same direct-call
    // pattern used with statusBar — imperative, not a reactive prop.
    let headingControl: HeadingControl | undefined;
    // TEMPORARY diagnostic overlay — see TileDebugOverlay.svelte.
    let tileDebugOverlay: TileDebugOverlay | undefined;
    let lastHoverLonDeg = 0;
    let lastHoverLatDeg = 0;
    let hasHover = false;

    // Three.js core
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let fillMat: THREE.ShaderMaterial; // prototype cloned per styled layer
    let gratMat: THREE.ShaderMaterial;
    let ocean: THREE.Mesh; // full-screen quad, masked to the map shape
    let bodyMat: THREE.ShaderMaterial;
    let rafId: number;
    let tileManager: TileManager;
    let pointLayer: PointLayer;
    /** Whole-world meshes, drawn once per visible east-west copy of the map. */
    let worldCopies: {
        graticule: THREE.LineSegments;
        cap: THREE.Mesh;
        shift: number;
    }[] = [];
    let currentGridStep = DEFAULT_GRID_STEP;
    let capMat: THREE.ShaderMaterial;

    // Graticule sits just above the ocean and below the land fills.
    const GRAT_COLOR = 0x6f9dc0;
    // Must match the antarctica_ice style so the cap and the tiles read as one.
    const ANTARCTIC_ICE_COLOR = 0xf4f7fa;

    // Wheel-velocity prefetch state
    let lastWheelTime = 0;
    let wheelVelocity = 0; // EMA of signed px/ms (+ = zooming in)

    // Cursor-anchored zoom: NDC position the zoom should keep pinned.
    let zoomAnchorX = 0;
    let zoomAnchorY = 0;

    // Constants
    // Scale: fraction of the viewport half-height the globe / map occupies.
    const BASE_SCALE = 0.82;
    // Floor chosen so the globe/map always fills a decent share of the
    // viewport — below this it shrinks into an island in a black void.
    const MIN_SCALE = 0.62;
    // Max zoom is derived from MAX_CAMERA_ZOOM (one level past the deepest tile
    // zoom the data carries), so it's a deliberate one-level overzoom rather
    // than an arbitrary cap. Recomputed on resize since it depends on canvas
    // width. Past this the camera would only be magnifying the deepest tile's
    // geometry further, which tile-manager already clamps its own requests to.
    let maxScale = 4096;
    // Smoothstep tween duration (ms) for projection morphing.
    const TWEEN_MS = 800;

    // Status-bar readout (altitude + scale bar): pinhole-camera constants and
    // throttle so this doesn't recompute/dirty $state on every frame.
    const EARTH_RADIUS_KM = 6371;
    const ALTITUDE_FOV_DEG = 60;
    const MAX_SCALE_BAR_PX = 120;
    const MIN_SCALE_BAR_PX = 40;
    const STATUS_PUSH_INTERVAL_MS = 66; // ~15fps
    let lastStatusPushTime = 0;

    // Trackball state
    // panQuat accumulates trackball-drag (lon/lat) rotation and the
    // cursor-anchored zoom correction. headingAngle is a separate compass
    // rotation around the view axis, driven only by the heading control —
    // kept apart from panQuat so "reset to north" can zero it out without
    // disturbing whatever the user has panned to. rotMat3 (uploaded to the
    // shader as u_globeRotation) is always the two composed together; see
    // updateRotMat3().
    const panQuat = new THREE.Quaternion();
    const headingQuat = new THREE.Quaternion();
    const HEADING_AXIS = new THREE.Vector3(1, 0, 0); // "depth/forward" — the view axis
    let headingAngle = 0;
    let targetHeadingAngle = 0;
    const HEADING_DAMPING = 0.22;
    const rotMat3 = new THREE.Matrix3();
    const tmpMat4 = new THREE.Matrix4();
    const tmpQuat = new THREE.Quaternion();

    /** Recomputes rotMat3 = headingQuat * panQuat — heading applied on the
     *  outside, so it always rotates the current pan's view about the screen
     *  center rather than changing which point is centered. */
    function updateRotMat3(): void {
        tmpQuat.copy(headingQuat).multiply(panQuat);
        tmpMat4.makeRotationFromQuaternion(tmpQuat);
        rotMat3.setFromMatrix4(tmpMat4);
    }

    // Zoom state. currentScale eases toward targetScale each frame so wheel
    // input feels smooth rather than stepped, and so the tile LOD changes are
    // spread over several frames instead of snapping.
    let currentScale = BASE_SCALE;
    let targetScale = BASE_SCALE;
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
        mapPan.x =
            ((((mapPan.x + 1) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH) - 1;
        const halfY = Math.max(0, 0.5 - 1 / (aspect * currentScale));
        mapPan.y = Math.max(-halfY, Math.min(halfY, mapPan.y));
    }

    /** True while the flat-map navigation model is the dominant one. */
    function isFlatMode(): boolean {
        const dominant = tweenActive ? pendingProjection : currentProjection;
        return dominant !== ProjectionType.Sphere;
    }

    // Projection morph tween
    let currentProjection = 0; // matches shader int 0–3
    let pendingProjection = 0;
    let tweenStart = 0;
    let tweenActive = false;

    // Pointer drag
    let isDragging = false;
    // Sensitivity: radians per pixel
    const SENSITIVITY = 0.004;

    // =========================================================================
    // Line material — used by the graticule only; coastlines are filled.
    // =========================================================================
    function makeLineMat(): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            vertexShader: vertSrc,
            fragmentShader: fragSrc,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                u_globeRotation: { value: new THREE.Matrix3() },
                u_projectionTypeA: { value: 0 },
                u_projectionTypeB: { value: 0 },
                u_blend: { value: 0.0 },
                u_scale: { value: currentScale },
                u_aspect: { value: 1.0 },
                u_pan: { value: new THREE.Vector2(0, 0) },
                u_worldShift: { value: 0 },
                u_lineColor: { value: new THREE.Color(GRAT_COLOR) },
                u_globalAlpha: { value: 0.35 },
                u_tileCenter: { value: new THREE.Vector2(0, 0) },
                u_tileHalfExtent: { value: new THREE.Vector2(0, 0) },
            },
        });
    }

    // Prototype for the tile fills; TileManager clones it per styled layer and
    // sets the colour, so all tiles of a layer share one material and one
    // uniform sync per frame.
    function makeFillMat(): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            vertexShader: fillVertSrc,
            fragmentShader: fillFragSrc,
            // Opaque in appearance, but flagged transparent so it shares the
            // renderOrder-sorted pass with the ocean quad. As an opaque-pass
            // material it would draw before the ocean, which would then paint
            // straight over every landmass.
            transparent: true,
            // Fills are fully opaque and clip with discard, so blending buys
            // nothing — and it costs: shared triangle edges get composited
            // twice, drawing a visible web of seams across every filled area.
            blending: THREE.NoBlending,
            depthTest: false,
            depthWrite: false,
            // Winding is not meaningful here: the tile Y axis is flipped during
            // quantization, and the projection itself can reverse orientation
            // (near the limb, or between projections), so face culling would
            // drop arbitrary triangles.
            side: THREE.DoubleSide,
            uniforms: {
                u_globeRotation: { value: new THREE.Matrix3() },
                u_projectionTypeA: { value: 0 },
                u_projectionTypeB: { value: 0 },
                u_blend: { value: 0.0 },
                u_scale: { value: currentScale },
                u_aspect: { value: 1.0 },
                u_pan: { value: new THREE.Vector2(0, 0) },
                u_sphereWeight: { value: 1.0 },
                u_color: { value: new THREE.Color(0xffffff) },
                u_opacity: { value: 1.0 },
                u_tileLon: { value: new THREE.Vector2(0, 0) },
                u_tileMercY: { value: new THREE.Vector2(0.5, 0.5) },
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
        if (currentProjection === ProjectionType.Sphere)
            sphereWeight += 1 - blend;
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
                if (u.u_globalAlpha)
                    u.u_globalAlpha.value =
                        gratMat.uniforms.u_globalAlpha.value;
                if (u.u_sphereWeight)
                    u.u_sphereWeight.value = Math.max(
                        0,
                        Math.min(1, sphereWeight),
                    );
            }
        }
    }

    // The ocean quad covers the whole frustum — its shader masks it to the
    // current projection shape — so it only needs the aspect fit.
    function syncOceanScale(): void {
        if (!ocean) return;
        ocean.scale.set(gratMat?.uniforms.u_aspect.value ?? 1, 1, 1);
    }

    /**
     * Disposes and rebuilds every world copy's graticule at a new spacing,
     *  reusing each copy's existing material so uniforms stay in sync.
     */
    function rebuildGraticules(gridStep: number): void {
        for (const copy of worldCopies) {
            const oldGraticule = copy.graticule;
            scene.remove(oldGraticule);
            oldGraticule.geometry.dispose();

            const { graticule } = buildGraticule(
                oldGraticule.material as THREE.ShaderMaterial,
                gridStep,
            );
            graticule.renderOrder = 0;
            graticule.visible = showGraticule;
            scene.add(graticule);

            copy.graticule = graticule;
        }
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
            canvas: canvasEl,
            antialias: true,
            alpha: false,
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
        camera = new THREE.OrthographicCamera(
            -aspect,
            aspect,
            1,
            -1,
            0.01,
            100,
        );
        camera.position.set(0, 0, 2);

        // Ocean. A full-screen quad whose shader masks it to whichever projection
        // shape is current (disc / rectangle / ellipse), morphing between them,
        // so every projection gets the same treatment from one draw call.
        bodyMat = new THREE.ShaderMaterial({
            vertexShader: bodyVertSrc,
            fragmentShader: bodyFragSrc,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                u_ocean: { value: new THREE.Color(OCEAN_COLOR) },
                u_scale: { value: currentScale },
                u_aspect: { value: aspect },
                u_projectionTypeA: { value: 0 },
                u_projectionTypeB: { value: 0 },
                u_blend: { value: 0.0 },
                u_pan: { value: new THREE.Vector2(0, 0) },
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
        maxScale = scaleForZoom(MAX_CAMERA_ZOOM, w);
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
            vertexShader: geoFillVertSrc,
            fragmentShader: fillFragSrc,
            transparent: true,
            blending: THREE.NoBlending, // see makeFillMat
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                u_globeRotation: { value: new THREE.Matrix3() },
                u_projectionTypeA: { value: 0 },
                u_projectionTypeB: { value: 0 },
                u_blend: { value: 0.0 },
                u_scale: { value: currentScale },
                u_aspect: { value: aspect },
                u_pan: { value: new THREE.Vector2(0, 0) },
                u_worldShift: { value: 0 },
                u_sphereWeight: { value: 1.0 },
                u_color: { value: new THREE.Color(ANTARCTIC_ICE_COLOR) },
                u_opacity: { value: 1.0 },
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
            console.error(
                "[GlobeCanvas] Failed to initialize tile layers:",
                err,
            );
        }
        pointLayer = new PointLayer(scene);

        // Resize observer
        const ro = new ResizeObserver(onResize);
        ro.observe(canvasEl);

        // Pointer events (trackball, always active)
        canvasEl.addEventListener("pointerdown", onPointerDown);
        canvasEl.addEventListener("pointermove", onPointerMove);
        canvasEl.addEventListener("pointerup", onPointerUp);
        canvasEl.addEventListener("pointerleave", onPointerUp);
        canvasEl.addEventListener("pointerleave", () => {
            statusBar?.clearCoords();
            hasHover = false;
            pushTileDebugInfo();
        });
        canvasEl.addEventListener("wheel", onWheel, { passive: false });
        // Prevent context-menu on long-press (mobile)
        canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());

        // Custom WebGL Crash recovery listener
        canvasEl.addEventListener("webglcontextlost", onContextLost);

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
        camera.left = -aspect;
        camera.right = aspect;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();

        // Update shader aspect uniforms (tile fills are synced by TileManager).
        gratMat.uniforms.u_aspect.value = aspect;
        bodyMat.uniforms.u_aspect.value = aspect;
        syncOceanScale();

        maxScale = scaleForZoom(MAX_CAMERA_ZOOM, w);
    }

    // =========================================================================
    // Trackball pointer events
    // =========================================================================
    function onPointerDown(e: PointerEvent): void {
        isDragging = true;
        canvasEl.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent): void {
        // Hover readout: runs on every move, independent of drag state. Placed
        // first because the drag branches below return early.
        const hoverRect = canvasEl.getBoundingClientRect();
        const hoverNdcX =
            ((e.clientX - hoverRect.left) / hoverRect.width) * 2 - 1;
        const hoverNdcY = -(
            ((e.clientY - hoverRect.top) / hoverRect.height) * 2 -
            1
        );
        const hoverGeo = unprojectPoint(hoverNdcX, hoverNdcY, {
            rotMat3,
            scale: currentScale,
            aspect: gratMat.uniforms.u_aspect.value,
            projectionType: tweenActive ? pendingProjection : currentProjection,
            pan: mapPan,
        });
        if (hoverGeo) {
            lastHoverLonDeg = (hoverGeo.lon * 180) / Math.PI;
            lastHoverLatDeg = (hoverGeo.lat * 180) / Math.PI;
            hasHover = true;
            statusBar?.setCoords(
                formatLatLonDMS(lastHoverLatDeg, lastHoverLonDeg),
            );
        } else {
            hasHover = false;
            statusBar?.clearCoords();
        }
        pushTileDebugInfo();

        if (!isDragging) return;

        if (isFlatMode()) {
            // Translate the plane, converting pixels to map units so the dragged
            // feature stays exactly under the pointer.
            const aspect = gratMat.uniforms.u_aspect.value;
            const halfW = canvasEl.clientWidth / 2;
            const halfH = canvasEl.clientHeight / 2;
            mapPan.x -= e.movementX / halfW / currentScale;
            mapPan.y += e.movementY / halfH / (aspect * currentScale);
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
        //   Z = north           (sin(lat))            → maps to screen-Y
        //
        // Horizontal drag (dx) → rotate around Z axis (north/up on screen)
        // Vertical   drag (dy) → rotate around Y axis (east/right on screen)
        const qLon = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            dx,
        );
        const qLat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            dy,
        );
        panQuat.premultiply(qLon).premultiply(qLat).normalize();
        updateRotMat3();
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
        const floor = minScaleFor(
            tweenActive ? pendingProjection : currentProjection,
            gratMat.uniforms.u_aspect.value,
        );
        targetScale = Math.max(
            floor,
            Math.min(maxScale, targetScale * zoomFactor),
        );

        const rect = canvasEl.getBoundingClientRect();
        zoomAnchorX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        zoomAnchorY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        // Wheel-velocity prefetch: predict where the zoom is heading and warm
        // the tile cache under the cursor ray ahead of time.
        const now = performance.now();
        const dt = Math.max(1, now - lastWheelTime);
        lastWheelTime = now;
        wheelVelocity = wheelVelocity * 0.7 + (-e.deltaY / dt) * 0.3;

        if (tileManager) {
            const geo = unprojectPoint(zoomAnchorX, zoomAnchorY, {
                rotMat3,
                scale: currentScale,
                aspect: gratMat.uniforms.u_aspect.value,
                projectionType: tweenActive
                    ? pendingProjection
                    : currentProjection,
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
        const projectionType = tweenActive
            ? pendingProjection
            : currentProjection;

        if (isFlatMode()) {
            // Keep the map point under the cursor fixed: it sits at
            // pan + ndc/scale, so pan absorbs the change in 1/scale.
            mapPan.x += zoomAnchorX * (1 / prevScale - 1 / nextScale);
            mapPan.y +=
                (zoomAnchorY / aspect) * (1 / prevScale - 1 / nextScale);
            clampPan();
            return;
        }

        const before = viewDirection(zoomAnchorX, zoomAnchorY, {
            rotMat3,
            scale: prevScale,
            aspect,
            projectionType,
        });
        const after = viewDirection(zoomAnchorX, zoomAnchorY, {
            rotMat3,
            scale: nextScale,
            aspect,
            projectionType,
        });
        if (!before || !after) return;

        // R' = Q·R with Q·before = after keeps the same world point under the cursor.
        // Q is computed in the outer (screen) frame, same as heading, but it
        // belongs to panQuat (zoom shouldn't touch heading) — so it's conjugated
        // through headingQuat into pan's frame before being applied there.
        const q = new THREE.Quaternion().setFromUnitVectors(before, after);
        const qInPanFrame = tmpQuat
            .copy(headingQuat)
            .invert()
            .multiply(q)
            .multiply(headingQuat);
        panQuat.premultiply(qInPanFrame).normalize();
        updateRotMat3();
    }

    // =========================================================================
    // Heading control (sphere projection only)
    // =========================================================================
    /** Called with each incremental angle (radians) as the compass knob is
     *  dragged. Applied immediately (not eased) so the drag feels 1:1; the
     *  target is kept in sync so the animate()-loop easing below stays inert
     *  until a reset is requested. */
    function onHeadingDrag(deltaRad: number): void {
        headingAngle += deltaRad;
        targetHeadingAngle = headingAngle;
        headingQuat.setFromAxisAngle(HEADING_AXIS, headingAngle);
        updateRotMat3();
        headingControl?.setHeadingDeg((headingAngle * 180) / Math.PI);
    }

    function onResetNorth(): void {
        targetHeadingAngle = 0;
    }

    // =========================================================================
    // Projection switch — starts u_blend tween
    // =========================================================================
    function switchProjection(next: number): void {
        if (next === currentProjection && !tweenActive) return;

        pendingProjection = next;

        gratMat.uniforms.u_projectionTypeA.value = currentProjection;
        gratMat.uniforms.u_projectionTypeB.value = next;
        gratMat.uniforms.u_blend.value = 0.0;

        tweenStart = performance.now();
        tweenActive = true;

        // Entering a flat projection: zoom out to the fit-the-viewport scale and
        // recentre, so the plane always arrives full-screen.
        const floor = minScaleFor(next, gratMat.uniforms.u_aspect.value);
        if (next !== ProjectionType.Sphere) {
            targetScale = Math.max(floor, currentScale);
            mapPan.set(0, 0);
        } else {
            targetScale = Math.min(
                targetScale,
                Math.max(MIN_SCALE, BASE_SCALE),
            );
        }
    }

    // =========================================================================
    // Animation loop
    // =========================================================================
    function animate(now: number): void {
        rafId = requestAnimationFrame(animate);

        // Drive tween
        if (tweenActive) {
            const t = Math.min((now - tweenStart) / TWEEN_MS, 1.0);
            const blend = t * t * (3.0 - 2.0 * t); // smoothstep
            gratMat.uniforms.u_blend.value = blend;

            if (t >= 1.0) {
                tweenActive = false;
                currentProjection = pendingProjection;

                gratMat.uniforms.u_projectionTypeA.value = currentProjection;
                gratMat.uniforms.u_projectionTypeB.value = currentProjection;
                gratMat.uniforms.u_blend.value = 0.0;
            }
        }

        const effectiveZoom = zoomForScale(currentScale, canvasEl.clientWidth);
        const nextGridStep = pickGraticuleStep(effectiveZoom);
        if (nextGridStep !== currentGridStep) {
            currentGridStep = nextGridStep;
            rebuildGraticules(currentGridStep);
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
        const floor = minScaleFor(
            tweenActive ? pendingProjection : currentProjection,
            gratMat.uniforms.u_aspect.value,
        );
        if (targetScale < floor) targetScale = floor;
        if (currentScale < floor) currentScale = floor;
        clampPan();

        // Ease heading back toward its target — only moves when "Reset to
        // North" set a new target; a live drag keeps target == current so
        // this is a no-op while the knob is actually being dragged.
        if (Math.abs(targetHeadingAngle - headingAngle) > 1e-4) {
            headingAngle +=
                (targetHeadingAngle - headingAngle) * HEADING_DAMPING;
            headingQuat.setFromAxisAngle(HEADING_AXIS, headingAngle);
            updateRotMat3();
            headingControl?.setHeadingDeg((headingAngle * 180) / Math.PI);
        } else if (headingAngle !== targetHeadingAngle) {
            headingAngle = targetHeadingAngle;
            headingQuat.setFromAxisAngle(HEADING_AXIS, headingAngle);
            updateRotMat3();
            headingControl?.setHeadingDeg((headingAngle * 180) / Math.PI);
        }

        gratMat.uniforms.u_scale.value = currentScale;
        gratMat.uniforms.u_pan.value.copy(mapPan);
        bodyMat.uniforms.u_pan.value.copy(mapPan);

        // The ocean follows the same projection/morph state as the fills so its
        // shape stays locked to the coastlines.
        bodyMat.uniforms.u_scale.value = currentScale;
        bodyMat.uniforms.u_projectionTypeA.value = currentProjection;
        bodyMat.uniforms.u_projectionTypeB.value = pendingProjection;
        bodyMat.uniforms.u_blend.value = gratMat.uniforms.u_blend.value;

        // Graticule is reference furniture, not data: let it recede as the view
        // zooms in, where a 15° grid is far off-screen and only adds noise.
        const gratFade =
            1 - Math.min(1, Math.max(0, (currentScale / BASE_SCALE - 2) / 10));
        gratMat.uniforms.u_globalAlpha.value = 0.28 * gratFade;

        // Heading only makes sense while looking at a rotatable sphere. Driven
        // every frame from isFlatMode() (not just at the start of a projection
        // switch) so reversing direction mid-tween — e.g. Sphere→Map→Sphere
        // before the first tween finishes, where switchProjection's `next ===
        // currentProjection` guard means it's never called again — can't leave
        // this stuck hidden; the $state setter behind it already no-ops on an
        // unchanged value, so this costs nothing extra on a steady frame.
        headingControl?.setVisible(!isFlatMode());

        // Push rotation uniform
        syncUniforms();

        tileManager?.update({
            rotMat3,
            scale: currentScale,
            aspect: gratMat.uniforms.u_aspect.value,
            canvasWidthPx: canvasEl.clientWidth,
            projectionA: currentProjection,
            projectionB: pendingProjection,
            blend: gratMat.uniforms.u_blend.value,
            pan: mapPan,
        });
        pointLayer?.update({
            rotMat3,
            scale: currentScale,
            aspect: gratMat.uniforms.u_aspect.value,
            projectionA: currentProjection,
            projectionB: pendingProjection,
            blend: gratMat.uniforms.u_blend.value,
            pan: mapPan,
        });

        renderer.render(scene, camera);

        // Status-bar readout (altitude + scale bar): throttled to ~15fps since
        // it only needs to track zoom, not every rendered frame.
        if (now - lastStatusPushTime >= STATUS_PUSH_INTERVAL_MS) {
            lastStatusPushTime = now;
            pushStatusReadout();
            pushTileDebugInfo();
        }
    }

    /** TEMPORARY diagnostic — see TileDebugOverlay.svelte. Reads the last
     *  hovered lon/lat (tracked in onPointerMove) so this also refreshes on
     *  zoom changes alone, without requiring the mouse to move. */
    function pushTileDebugInfo(): void {
        if (!tileDebugOverlay) return;
        const infos = tileManager?.getDebugInfo() ?? [];
        const primary = infos[0];
        const lines: string[] = ["[TILE DEBUG]"];
        if (primary) {
            lines.push(`zoom (effective): ${primary.effectiveZoom}`);
            const counts = Object.entries(primary.tileCountsByZoom)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([z, n]) => `z${z}:${n}`)
                .join(" ");
            lines.push(`in scene: ${counts || "(none)"}`);
        } else {
            lines.push("zoom (effective): —");
        }
        if (hasHover) {
            const z =
                primary?.effectiveZoom ??
                Math.round(zoomForScale(currentScale, canvasEl.clientWidth));
            const { x, y } = lonLatToTile(lastHoverLonDeg, lastHoverLatDeg, z);
            lines.push(
                `hover tile: z${z} / x${Math.floor(x)} / y${Math.floor(y)}`,
            );
        } else {
            lines.push("hover tile: —");
        }
        tileDebugOverlay.setInfo(lines.join("\n"));
    }

    /** Derives simulated altitude and the scale-bar label/width from the
     *  current zoom, and writes them into the shared viewStatus state. */
    function pushStatusReadout(): void {
        const canvasWidthPx = canvasEl.clientWidth;
        const canvasHeightPx = canvasEl.clientHeight;
        const flat = isFlatMode();

        let kmPerPx: number;
        if (flat) {
            // Vertical direction is scale-accurate everywhere in equirectangular,
            // but a horizontal bar needs the cos(latitude) correction since
            // longitude spacing shrinks toward the poles — sample the view's
            // center latitude once per push.
            const centerGeo = unprojectPoint(0, 0, {
                rotMat3,
                scale: currentScale,
                aspect: gratMat.uniforms.u_aspect.value,
                projectionType: currentProjection,
                pan: mapPan,
            });
            const centerLat = centerGeo?.lat ?? 0;
            kmPerPx =
                (2 * Math.PI * EARTH_RADIUS_KM * Math.cos(centerLat)) /
                (currentScale * canvasWidthPx);
        } else {
            // Sphere: exact at the sub-cursor/sub-nadir point; an approximation
            // toward the limb due to orthographic foreshortening, consistent
            // with the rest of this readout being a simulated instrument.
            kmPerPx = (2 * EARTH_RADIUS_KM) / (currentScale * canvasHeightPx);
        }

        // Faux altitude: model a pinhole camera with vertical FOV θ looking
        // straight down at a plane of visible width `visibleWidthKm` (the
        // geographic distance spanned by the full canvas width, from the same
        // kmPerPx used for the scale bar above — so the two readouts can never
        // contradict each other). Triangle half-angle gives:
        //   altitude = (visibleWidthKm / 2) / tan(θ/2)
        // Shared across both projections; at the equator in flat mode this
        // reduces to (2π·EARTH_RADIUS_KM/scale)/2 / tan(θ/2), matching
        // circumference/scale to within the 2π·R_e vs 40,075km rounding gap.
        const visibleWidthKm = canvasWidthPx * kmPerPx;
        const altitudeKm =
            visibleWidthKm /
            2 /
            Math.tan((ALTITUDE_FOV_DEG * Math.PI) / 180 / 2);

        const { km, label } = pickNiceScale(
            kmPerPx,
            MAX_SCALE_BAR_PX,
            MIN_SCALE_BAR_PX,
        );
        const barWidthPx = km / kmPerPx;

        // Only touch $state if something actually changed, so an idle view
        // (scale unchanged) doesn't dirty reactivity 15x/sec.
        if (
            Math.abs(viewStatus.altitudeKm - altitudeKm) > 0.5 ||
            viewStatus.scaleBarLabel !== label ||
            Math.abs(viewStatus.scaleBarWidthPx - barWidthPx) > 0.5
        ) {
            viewStatus.altitudeKm = Math.max(0, altitudeKm);
            viewStatus.scaleBarLabel = label;
            viewStatus.scaleBarWidthPx = barWidthPx;
        }
    }

    // =========================================================================
    // Exported controls (#57): bridges the layer panel down to TileManager.
    // =========================================================================
    export function setLayerVisibility(layerId: string, visible: boolean): void {
        tileManager?.setLayerVisibility(layerId, visible);
    }

    export function setLayerOpacity(layerId: string, opacity: number): void {
        tileManager?.setLayerOpacity(layerId, opacity);
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
    // Svelte reactive: toggle graticule visibility from parent prop
    // =========================================================================
    $effect(() => {
        console.log(
            "[graticule toggle]",
            showGraticule,
            "worldCopies count:",
            worldCopies.length,
        );
        for (const copy of worldCopies) {
            copy.graticule.visible = showGraticule;
        }
    });

    // =========================================================================
    // Error Handling
    // =========================================================================
    function onContextLost(e: Event): void {
        e.preventDefault();
        console.error(
            "[GlobeCanvas] WebGL context lost. Rendering recovery prompt.",
            e,
        );
        hasCrashed = true;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================
    onMount(() => {
        initScene();
    });

    onDestroy(() => {
        if (!browser) return;
        cancelAnimationFrame(rafId);
        tileManager?.dispose();
        pointLayer?.dispose();
        renderer?.dispose();
    });
</script>

{#if hasCrashed}
    <div class="crash-overlay">
        <div class="crash-dialog">
            <h2>3D Map Disconnected</h2>
            <p>The graphics processor ran out of memory or was reset.</p>
            <button onclick={() => window.location.reload()}>Reload Map</button>
        </div>
    </div>
{/if}

<canvas
    bind:this={canvasEl}
    class="globe-canvas"
    aria-label="Interactive world map projection. Drag to rotate"
></canvas>

<HeadingControl
    bind:this={headingControl}
    onDrag={onHeadingDrag}
    {onResetNorth}
/>

<TileDebugOverlay bind:this={tileDebugOverlay} />

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

    .crash-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.75);
        color: white;
        z-index: 100;
    }
    .crash-dialog {
        background: #1e1e1e;
        padding: 2rem;
        border-radius: 8px;
        text-align: center;
        border: 1px solid #333;
    }
    .crash-dialog h2 {
        margin-top: 0;
        color: #ff5555;
    }
    .crash-dialog button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        cursor: pointer;
        background: #ffffff;
        color: #000000;
        border: none;
        border-radius: 4px;
    }
</style>
