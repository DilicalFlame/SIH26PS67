<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as Cesium from "cesium";
    import "cesium/Build/Cesium/Widgets/widgets.css";
    import { ProjectionType } from "$lib/types/projection";
    import { formatLatLonDMS } from "$lib/geo/dms";
    import { pickNiceScale } from "$lib/geo/scale-bar";
    import { viewStatus } from "$lib/state/view-status.svelte";
    import type StatusBar from "$lib/components/StatusBar.svelte";
    import HeadingControl from "$lib/components/HeadingControl.svelte";

    // Props — mirrors GlobeCanvas's public surface exactly, so this is a
    // drop-in replacement from +page.svelte's point of view.
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

    let containerEl: HTMLDivElement;
    let hasCrashed = $state(false);
    let headingControl: HeadingControl | undefined;

    let viewer: Cesium.Viewer;
    let gridLayer: Cesium.ImageryLayer | undefined;
    let handler: Cesium.ScreenSpaceEventHandler;

    // Which projection the scene is currently morphed to (or morphing
    // towards) — kept separate from Cesium's own scene.mode so the $effect
    // below only calls morphTo*() on an actual change.
    let currentProjection = ProjectionType.Sphere;

    // Heading state — same eased-drag-plus-reset-to-north model as
    // GlobeCanvas, just applied to Cesium's camera instead of a shader uniform.
    let headingAngle = 0;
    let targetHeadingAngle = 0;
    const HEADING_DAMPING = 0.22;

    const EARTH_RADIUS_KM = 6371;
    const STATUS_PUSH_INTERVAL_MS = 66; // ~15fps, matches GlobeCanvas's throttle
    let lastStatusPushTime = 0;
    let rafId: number;

    const GRAT_COLOR = Cesium.Color.fromCssColorString("#6f9dc0").withAlpha(0.35);

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

        // No Ion token available (see .env) — bundled offline imagery and the
        // default ellipsoid terrain provider only. TileMapServiceImageryProvider
        // must be constructed through its async fromUrl() factory (it fetches
        // tilemapresource.xml to learn the tiling scheme) before it can become
        // the Viewer's base layer.
        const naturalEarth = await Cesium.TileMapServiceImageryProvider.fromUrl(
            Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        );

        viewer = new Cesium.Viewer(containerEl, {
            baseLayer: new Cesium.ImageryLayer(naturalEarth),
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
        });

        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#8fb8d8"); // OCEAN_COLOR
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0c1420"); // VOID_COLOR
        viewer.scene.morphComplete.addEventListener(() => {
            currentProjection =
                viewer.scene.mode === Cesium.SceneMode.SCENE3D
                    ? ProjectionType.Sphere
                    : ProjectionType.Equirectangular;
        });

        if (showGraticule) addGraticule();

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

        const { km, label } = pickNiceScale(kmPerPx, 120, 40);
        const barWidthPx = km / kmPerPx;

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

    // =========================================================================
    // Svelte reactive: respond to parent activeProjection prop changes by
    // driving Cesium's own built-in globe <-> map morph.
    // =========================================================================
    $effect(() => {
        const p = Number(activeProjection);
        if (!viewer || p === currentProjection) return;
        currentProjection = p;
        if (p === ProjectionType.Sphere) {
            viewer.scene.morphTo3D(1.0);
        } else {
            viewer.scene.morphTo2D(1.0);
        }
    });

    $effect(() => {
        if (!viewer) return;
        if (showGraticule) addGraticule();
        else removeGraticule();
    });

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
