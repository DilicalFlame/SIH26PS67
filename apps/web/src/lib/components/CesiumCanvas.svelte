<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as Cesium from "cesium";
    import "cesium/Build/Cesium/Widgets/widgets.css";
    import { ProjectionType } from "$lib/types/projection";
    import { formatLatLonDMS } from "$lib/geo/dms";
    import { pickNiceScale } from "$lib/geo/scale-bar";
    import { viewStatus } from "$lib/state/view-status.svelte";
    import { BASEMAPS, DEFAULT_BASEMAP_ID } from "$lib/tiles/basemaps";
    import { PathMeasureTool, type MeasureState } from "$lib/measure/path-measure-tool";
    import {
        loadSession,
        dispatchSessionAction,
        SessionActionType,
        type PersistedCameraView,
    } from "$lib/state/session-store";
    import type StatusBar from "$lib/components/StatusBar.svelte";
    import HeadingControl from "$lib/components/HeadingControl.svelte";
    import BasemapPicker from "$lib/components/BasemapPicker.svelte";
    import Toolbar from "$lib/components/Toolbar.svelte";

    interface Props {
        statusBar?: StatusBar;
        /** Layers panel visibility lives in +page.svelte (it owns
         *  <LayerControl>) — Toolbar's layers button just reflects/toggles it. */
        layersOpen?: boolean;
        onToggleLayers?: () => void;
        /** Lets +page.svelte hide <LayerControl> while the path/polygon tool's
         *  own top-right panel is showing — they'd otherwise overlap. */
        onMeasureActiveChange?: (active: boolean) => void;
    }
    const {
        statusBar,
        layersOpen = false,
        onToggleLayers = () => {},
        onMeasureActiveChange = () => {},
    }: Props = $props();

    // Read once at mount — everything below that falls back to a hardcoded
    // default (basemap, projection, graticule, camera, finished
    // measurements) prefers this instead, so a refresh restores the
    // previous session rather than resetting. Deliberately NOT restored:
    // the path/polygon tool's active/drawing state — see session-store.ts.
    const initialSession = loadSession();

    let containerEl: HTMLDivElement;
    let hasCrashed = $state(false);
    let headingControl: HeadingControl | undefined;

    let viewer: Cesium.Viewer;
    let gridLayer: Cesium.ImageryLayer | undefined;
    let baseLayer: Cesium.ImageryLayer | undefined;
    let handler: Cesium.ScreenSpaceEventHandler;
    let measureTool: PathMeasureTool | undefined;
    let measureState = $state<MeasureState>({
        active: false,
        drawing: false,
        vertexCount: 0,
        canClose: false,
        closed: false,
        length: "",
        heading: "",
        area: "",
        perimeter: "",
        finished: [],
    });
    $effect(() => {
        onMeasureActiveChange(measureState.active);
    });
    // Reactive so BasemapPicker can highlight the active skin; picking a new
    // one is the only thing that changes it, so a plain $state (not an
    // effect-driven derivation) is enough.
    let currentBasemapId = $state(initialSession.basemapId ?? DEFAULT_BASEMAP_ID);

    // Which projection the scene is currently morphed to (or morphing
    // towards). $state (not a plain let) so BasemapPicker's projection
    // toggle can highlight the active one — driven directly by
    // switchProjection() below, now that the projection control lives
    // inside this component instead of being passed down as a prop.
    // Only Equirectangular is worth restoring explicitly — anything else
    // (missing, corrupt, a stale future value) falls back to Sphere, same
    // as a first-ever visit.
    let currentProjection = $state(
        initialSession.projection === ProjectionType.Equirectangular
            ? ProjectionType.Equirectangular
            : ProjectionType.Sphere,
    );
    // Likewise for the graticule — was a prop watched by an $effect, now a
    // local toggle BasemapPicker calls directly. Defaults OFF (not ON) on a
    // first-ever visit, same "inactive unless a session says otherwise"
    // policy as every other toggle here.
    let graticuleOn = $state(initialSession.graticuleOn ?? false);

    // Heading state — same eased-drag-plus-reset-to-north model as
    // GlobeCanvas, just applied to Cesium's camera instead of a shader uniform.
    // Seeded from the restored camera (if any) so the first onResetNorth()
    // eases from the actual restored heading instead of assuming 0 — see
    // restoreSession() below, which also re-syncs these once the real
    // Cesium camera is set.
    let headingAngle = initialSession.camera?.heading ?? 0;
    let targetHeadingAngle = headingAngle;
    const HEADING_DAMPING = 0.22;

    const EARTH_RADIUS_KM = 6371;
    const STATUS_PUSH_INTERVAL_MS = 66; // ~15fps, matches GlobeCanvas's throttle
    let lastStatusPushTime = 0;
    let rafId: number;

    const GRAT_COLOR = Cesium.Color.fromCssColorString("#6f9dc0").withAlpha(0.35);

    // Closest the camera is allowed to get to the surface. Below this,
    // imagery has nothing higher-resolution left to show anyway, the
    // altitude/scale readout stops being meaningful, and — more importantly —
    // letting the camera distance run all the way to 0 (a big, fast wheel
    // delta can do this in a single frame) sends Cesium's internal
    // direction/right vectors through a zero-length normalize and crashes
    // the whole scene with "DeveloperError: normalized result is not a
    // number". 10m matches the finest graduation the scale bar can show
    // (see NICE_KM in geo/scale-bar.ts).
    const MIN_ZOOM_METERS = 10;
    // Farthest the camera is allowed to pull back. Past this the globe
    // shrinks to a small dot in a lot of empty black space and it's easy to
    // lose track of where you are — worth capping generally, but especially
    // now that the last zoom level persists across reloads (see
    // session-store.ts): without a cap, an accidental scroll-out-forever
    // could get "stuck" as the restored view on every future load.
    // Comfortably above Cesium's own default whole-globe framing (~20,200km,
    // the altitude you see on a fresh session) so backing out to see the
    // entire globe still works, just not endlessly further than that.
    const MAX_ZOOM_METERS = 25_000_000;
    const MAX_SCALE_BAR_PX = 120;
    const MIN_SCALE_BAR_PX = 40;

    /** True while the flat equirectangular map is the dominant projection —
     *  heading only makes sense while looking at a rotatable sphere. */
    function isFlatMode(): boolean {
        return viewer.scene.mode !== Cesium.SceneMode.SCENE3D;
    }

    function applyHeading(): void {
        const camera = viewer.scene.camera;
        camera.setView({
            orientation: {
                heading: headingAngle,
                pitch: camera.pitch,
                roll: 0,
            },
        });
        headingControl?.setHeadingDeg((headingAngle * 180) / Math.PI);
    }

    function onHeadingDrag(deltaRad: number): void {
        headingAngle += deltaRad;
        targetHeadingAngle = headingAngle;
        applyHeading();
    }

    function onResetNorth(): void {
        // Shortest direction back to 0, so a heading of e.g. 350° eases
        // forward through 360°/0° instead of spinning the long way round.
        let delta = ((-headingAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
        targetHeadingAngle = headingAngle + delta;
    }

    async function initScene(): Promise<void> {
        Cesium.Ion.defaultAccessToken = "";

        // No Ion/Mapbox/MapTiler token available (see .env), so Cesium's own
        // paid basemaps are out. Every skin in basemaps.ts is a free,
        // key-less tile source instead; the base layer itself is attached
        // below via switchBasemap() once the viewer exists, so the picker's
        // logic (build → adjust → swap) is exercised on the very first load
        // too, not duplicated here.
        viewer = new Cesium.Viewer(containerEl, {
            baseLayer: false,
            mapProjection: new Cesium.GeographicProjection(),
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            infoBox: false,
            selectionIndicator: false,
            shouldAnimate: true,
            // Cesium's own crash dialog (raw stack trace, no way back short of
            // reloading the tab) is replaced by the same recovery overlay used
            // for a lost WebGL context — see scene.renderError below.
            showRenderLoopErrors: false,
        });

        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#8fb8d8"); // OCEAN_COLOR
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0c1420"); // VOID_COLOR
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = MIN_ZOOM_METERS;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = MAX_ZOOM_METERS;
        // Releasing a drag and immediately wheel-zooming at the same cursor
        // position — a very ordinary "pan, then zoom in on what I was just
        // looking at" gesture — can send Cesium's internal camera math
        // through a zero-length Cartesian3.normalize, which by default kills
        // the render loop outright. Disabling translate inertia closes one
        // reproducible path into that race; scene.renderError below is the
        // actual backstop, since Cesium's camera internals aren't ours to
        // fully harden against every such edge case.
        viewer.scene.screenSpaceCameraController.inertiaTranslate = 0;
        viewer.scene.renderError.addEventListener((_scene, error) => {
            console.error("[CesiumCanvas] Scene render error. Rendering recovery prompt.", error);
            hasCrashed = true;
        });
        viewer.scene.morphComplete.addEventListener(() => {
            currentProjection =
                viewer.scene.mode === Cesium.SceneMode.SCENE3D
                    ? ProjectionType.Sphere
                    : ProjectionType.Equirectangular;
        });

        restoreSession();

        await switchBasemap(initialSession.basemapId ?? DEFAULT_BASEMAP_ID);
        if (graticuleOn) addGraticule();

        measureTool = new PathMeasureTool(viewer, (s) => {
            measureState = s;
        });
        measureTool.restoreFinished(initialSession.measurements ?? []);

        // Hover readout, mirroring GlobeCanvas's pointermove -> statusBar wiring.
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
            const cartesian = viewer.camera.pickEllipsoid(
                movement.endPosition,
                viewer.scene.globe.ellipsoid,
            );
            if (cartesian) {
                const carto = Cesium.Cartographic.fromCartesian(cartesian);
                const latDeg = Cesium.Math.toDegrees(carto.latitude);
                const lonDeg = Cesium.Math.toDegrees(carto.longitude);
                statusBar?.setCoords(formatLatLonDMS(latDeg, lonDeg));
            } else {
                statusBar?.clearCoords();
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(() => {
            statusBar?.clearCoords();
        }, Cesium.ScreenSpaceEventType.LEFT_UP);

        // WebGL crash recovery, same UX as GlobeCanvas.
        viewer.scene.canvas.addEventListener("webglcontextlost", onContextLost);

        rafId = requestAnimationFrame(animate);
    }

    // =========================================================================
    // Session restore — camera position + projection, from session-store.ts.
    // =========================================================================
    function applyRestoredCamera(cam: PersistedCameraView, includeOrientation: boolean): void {
        // A stale/corrupt height (e.g. 0) fed straight into setView is
        // exactly the zero-length-normalize crash MIN_ZOOM_METERS otherwise
        // guards against — that floor (and the MAX_ZOOM_METERS ceiling) is
        // enforced on the camera controller, not on setView, so both have to
        // be reapplied here explicitly. The ceiling also matters for a
        // session saved before MAX_ZOOM_METERS existed, or one edited by
        // hand — restoring it uncapped would put the user right back at the
        // "lost in empty space" view this cap exists to prevent.
        const height = Math.min(Math.max(cam.height, MIN_ZOOM_METERS), MAX_ZOOM_METERS);
        const destination = Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, height);
        if (includeOrientation) {
            viewer.camera.setView({
                destination,
                orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
            });
            headingAngle = cam.heading;
            targetHeadingAngle = cam.heading;
            headingControl?.setHeadingDeg((cam.heading * 180) / Math.PI);
        } else {
            // heading/pitch/roll don't round-trip meaningfully in 2D/Columbus
            // mode the way they do in 3D — passing a 3D-derived orientation
            // into a 2D destination is a plausible route into the same
            // normalize crash, so only the destination is restored here.
            viewer.camera.setView({ destination });
        }
    }

    /** Restores the persisted camera + projection, if any. Must run after
     *  the viewer (and its morphComplete listener above) exist, and BEFORE
     *  switchBasemap/addGraticule — imagery doesn't depend on camera state,
     *  so there's no reason to wait. */
    function restoreSession(): void {
        if (currentProjection === ProjectionType.Equirectangular) {
            // morphTo2D completes asynchronously even with duration 0 — a
            // setView issued synchronously right after it can still land
            // pre-morph and get silently overwritten. Apply the camera once
            // the morph actually finishes instead.
            const removeListener = viewer.scene.morphComplete.addEventListener(() => {
                removeListener();
                if (initialSession.camera) applyRestoredCamera(initialSession.camera, false);
            });
            viewer.scene.morphTo2D(0);
        } else if (initialSession.camera) {
            applyRestoredCamera(initialSession.camera, true);
        }
    }

    function addGraticule(): void {
        if (gridLayer) return;
        gridLayer = viewer.imageryLayers.addImageryProvider(
            new Cesium.GridImageryProvider({ color: GRAT_COLOR, glowWidth: 0 }),
        );
    }

    function removeGraticule(): void {
        if (!gridLayer) return;
        viewer.imageryLayers.remove(gridLayer);
        gridLayer = undefined;
    }

    function toggleGraticule(): void {
        graticuleOn = !graticuleOn;
        if (graticuleOn) addGraticule();
        else removeGraticule();
        dispatchSessionAction({ type: SessionActionType.GraticuleToggled, payload: graticuleOn });
    }

    /** Drives Cesium's own built-in globe <-> map morph. Called directly by
     *  BasemapPicker's projection toggle. */
    function switchProjection(next: ProjectionType): void {
        if (!viewer || next === currentProjection) return;
        currentProjection = next;
        if (next === ProjectionType.Sphere) {
            viewer.scene.morphTo3D(1.0);
        } else {
            viewer.scene.morphTo2D(1.0);
        }
        dispatchSessionAction({ type: SessionActionType.ProjectionChanged, payload: next });
    }

    // =========================================================================
    // Path/polygon measure tool — thin pass-throughs to PathMeasureTool
    // (path-measure-tool.ts), called by Toolbar.
    // =========================================================================
    function togglePathTool(): void {
        measureTool?.toggle();
    }
    function finishMeasure(): void {
        measureTool?.finishCurrent();
    }
    function undoMeasureVertex(): void {
        measureTool?.undoLastVertex();
    }
    function clearMeasurements(): void {
        measureTool?.clearAll();
    }
    function removeMeasurement(id: string): void {
        measureTool?.removeMeasurement(id);
    }
    function flyToMeasurement(id: string): void {
        measureTool?.flyToMeasurement(id);
    }
    function setMeasurementHighlighted(id: string, highlighted: boolean): void {
        measureTool?.setMeasurementHighlighted(id, highlighted);
    }

    // =========================================================================
    // Basemap ("skin") switching — see basemaps.ts. Builds the new provider
    // BEFORE touching the layer collection, so a slow or failing tile source
    // (network hiccup, an offline skin's key-less server down) leaves the
    // current basemap on screen instead of flashing to bare globe. Always
    // inserted at index 0 so the graticule — appended on top via
    // addImageryProvider — stays above it regardless of how many times the
    // base layer is swapped.
    // =========================================================================
    async function switchBasemap(id: string): Promise<void> {
        const config = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
        let provider: Cesium.ImageryProvider;
        try {
            provider = await config.build();
        } catch (err) {
            console.error(`[CesiumCanvas] Failed to load basemap "${config.id}":`, err);
            return;
        }
        if (!viewer || viewer.isDestroyed()) return; // component may have unmounted mid-fetch

        const nextLayer = new Cesium.ImageryLayer(provider);
        if (config.saturation !== undefined) nextLayer.saturation = config.saturation;
        if (config.brightness !== undefined) nextLayer.brightness = config.brightness;

        const previousLayer = baseLayer;
        viewer.imageryLayers.add(nextLayer, 0);
        if (previousLayer) viewer.imageryLayers.remove(previousLayer);
        baseLayer = nextLayer;
        currentBasemapId = config.id;
        dispatchSessionAction({ type: SessionActionType.BasemapChanged, payload: config.id });
    }

    // =========================================================================
    // Status-bar readout: real camera altitude + a measured (not simulated)
    // scale bar, both straight off the Cesium camera/ellipsoid.
    // =========================================================================
    function pushStatusReadout(): void {
        const canvas = viewer.scene.canvas;
        const altitudeKm = viewer.camera.positionCartographic.height / 1000;

        // Sample two ellipsoid points a fixed pixel span apart at screen
        // center to get a local km-per-pixel, then convert to a nice scale
        // bar width — same approach as GlobeCanvas, just measured instead of
        // derived from projection math.
        const cx = canvas.clientWidth / 2;
        const cy = canvas.clientHeight / 2;
        const SAMPLE_PX = 100;
        const p1 = viewer.camera.pickEllipsoid(
            new Cesium.Cartesian2(cx - SAMPLE_PX / 2, cy),
            viewer.scene.globe.ellipsoid,
        );
        const p2 = viewer.camera.pickEllipsoid(
            new Cesium.Cartesian2(cx + SAMPLE_PX / 2, cy),
            viewer.scene.globe.ellipsoid,
        );

        let kmPerPx: number;
        if (p1 && p2) {
            kmPerPx = Cesium.Cartesian3.distance(p1, p2) / 1000 / SAMPLE_PX;
        } else {
            // Off-globe (zoomed out past the limb in 3D) — fall back to a
            // circumference-based estimate so the bar doesn't freeze at a
            // stale value.
            kmPerPx =
                (2 * Math.PI * EARTH_RADIUS_KM) /
                (canvas.clientWidth * Math.max(1e-6, altitudeKm / EARTH_RADIUS_KM));
        }

        const { km, label } = pickNiceScale(kmPerPx, MAX_SCALE_BAR_PX, MIN_SCALE_BAR_PX);
        // pickNiceScale can't step below its finest graduation (10m — see
        // NICE_KM), so once actual km-per-pixel gets smaller than that (right
        // at the MIN_ZOOM_METERS floor) the "nice" bar for 10m legitimately
        // needs more than MAX_SCALE_BAR_PX to draw — clamp the rendered width
        // rather than let the bar run off past the status bar's edge.
        const barWidthPx = Math.min(MAX_SCALE_BAR_PX, km / kmPerPx);

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

    // Last camera values actually dispatched to session-store — compared
    // against on every throttled tick below so scheduleSaveCamera() only
    // dispatches when the camera truly moved. This matters a lot more than
    // it looks: animate()'s RAF loop runs forever, not just while the user
    // is interacting, so calling dispatchSessionAction() unconditionally on
    // every tick would keep re-arming CameraChanged's 500ms debounce timer
    // indefinitely — it would never get a quiet window to actually fire,
    // and the camera would silently never persist from panning/zooming
    // alone (it previously only appeared to work when some other action,
    // e.g. switching basemap, forced an immediate write that happened to
    // flush an in-memory camera value nothing had actually saved yet).
    let lastDispatchedCamera: PersistedCameraView | undefined;
    const CAMERA_EPS_DEG = 1e-7;
    const CAMERA_EPS_M = 0.1;
    const CAMERA_EPS_RAD = 1e-6;

    function cameraChanged(a: PersistedCameraView, b: PersistedCameraView): boolean {
        return (
            Math.abs(a.longitude - b.longitude) > CAMERA_EPS_DEG ||
            Math.abs(a.latitude - b.latitude) > CAMERA_EPS_DEG ||
            Math.abs(a.height - b.height) > CAMERA_EPS_M ||
            Math.abs(a.heading - b.heading) > CAMERA_EPS_RAD ||
            Math.abs(a.pitch - b.pitch) > CAMERA_EPS_RAD ||
            Math.abs(a.roll - b.roll) > CAMERA_EPS_RAD
        );
    }

    /** Debounced camera persistence, piggybacked on the same throttled tick
     *  as pushStatusReadout — fires up to ~15x/sec while the camera is
     *  actively moving, but only actually dispatches when the camera changed
     *  since the last dispatch (see lastDispatchedCamera above), so
     *  CameraChanged's 500ms debounce in session-store.ts gets a real quiet
     *  window to fire once movement stops. */
    function scheduleSaveCamera(): void {
        const carto = viewer.camera.positionCartographic;
        const cam: PersistedCameraView = {
            longitude: Cesium.Math.toDegrees(carto.longitude),
            latitude: Cesium.Math.toDegrees(carto.latitude),
            height: carto.height,
            heading: viewer.camera.heading,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
        };
        if (lastDispatchedCamera && !cameraChanged(lastDispatchedCamera, cam)) return;
        lastDispatchedCamera = cam;
        dispatchSessionAction({ type: SessionActionType.CameraChanged, payload: cam });
    }

    function animate(now: number): void {
        rafId = requestAnimationFrame(animate);
        if (!viewer || viewer.isDestroyed()) return;

        if (Math.abs(targetHeadingAngle - headingAngle) > 1e-4) {
            headingAngle += (targetHeadingAngle - headingAngle) * HEADING_DAMPING;
            applyHeading();
        } else if (headingAngle !== targetHeadingAngle) {
            headingAngle = targetHeadingAngle;
            applyHeading();
        }

        headingControl?.setVisible(!isFlatMode());

        if (now - lastStatusPushTime >= STATUS_PUSH_INTERVAL_MS) {
            lastStatusPushTime = now;
            pushStatusReadout();
            scheduleSaveCamera();
        }
    }

    // =========================================================================
    // Exported controls: kept as a matching no-op surface. There is no
    // Cesium-side data layer yet (coastlines/scalar fields still render only
    // through GlobeCanvas's PMTiles pipeline — see #migration notes), so
    // these intentionally don't throw, just warn once per call.
    // =========================================================================
    export function setLayerVisibility(layerId: string, _visible: boolean): void {
        console.warn(
            `[CesiumCanvas] setLayerVisibility("${layerId}") — data layers are not yet ported to Cesium.`,
        );
    }

    export function setLayerOpacity(layerId: string, _opacity: number): void {
        console.warn(
            `[CesiumCanvas] setLayerOpacity("${layerId}") — data layers are not yet ported to Cesium.`,
        );
    }

    function onContextLost(e: Event): void {
        e.preventDefault();
        console.error("[CesiumCanvas] WebGL context lost. Rendering recovery prompt.", e);
        hasCrashed = true;
    }

    onMount(() => {
        initScene();
    });

    onDestroy(() => {
        if (!browser) return;
        cancelAnimationFrame(rafId);
        handler?.destroy();
        measureTool?.destroy();
        if (viewer && !viewer.isDestroyed()) viewer.destroy();
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

<div
    bind:this={containerEl}
    class="cesium-canvas"
    aria-label="Interactive world map projection. Drag to rotate"
></div>

<HeadingControl bind:this={headingControl} onDrag={onHeadingDrag} {onResetNorth} />

<Toolbar
    {measureState}
    onTogglePathTool={togglePathTool}
    onFinish={finishMeasure}
    onClose={togglePathTool}
    onUndo={undoMeasureVertex}
    onClearAll={clearMeasurements}
    onRemoveMeasurement={removeMeasurement}
    onZoomToMeasurement={flyToMeasurement}
    onHighlightMeasurement={setMeasurementHighlighted}
    {layersOpen}
    {onToggleLayers}
/>

<BasemapPicker
    basemaps={BASEMAPS}
    activeId={currentBasemapId}
    onSelect={switchBasemap}
    {currentProjection}
    onProjectionChange={switchProjection}
    {graticuleOn}
    onGraticuleToggle={toggleGraticule}
/>

<style>
    .cesium-canvas {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
        cursor: grab;
        outline: none;
    }
    .cesium-canvas:active {
        cursor: grabbing;
    }

    /* Cesium's own credit/logo bar — keep it, but out from under our status
       bar (see StatusBar.svelte, height 2.25rem, pinned to the bottom edge). */
    .cesium-canvas :global(.cesium-viewer-bottom) {
        bottom: 2.25rem;
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
