<script lang="ts">
    import GlobeCanvas from '$lib/components/GlobeCanvas.svelte';
    import StatusBar from '$lib/components/StatusBar.svelte';
    import LayerControl from '$lib/components/LayerControl.svelte';
    import { ProjectionType, PROJECTIONS } from '$lib/types/projection';

    let activeProjection = $state<ProjectionType>(ProjectionType.Sphere);
    let statusBarRef = $state<StatusBar | undefined>(undefined);
    let globeCanvasRef = $state<GlobeCanvas | undefined>(undefined);
</script>

<svelte:head>
    <title>SIH26PS67</title>
    <meta name="description" content="Optimised Ocean Data Visualisation Platform." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
</svelte:head>

<main class="viewport">
    <!-- Full-screen Three.js canvas -->
    <div class="canvas-wrapper">
        <GlobeCanvas bind:this={globeCanvasRef} {activeProjection} statusBar={statusBarRef} />
    </div>

    <!-- Floating layer control panel -->
    <LayerControl
        onVisibilityChange={(id, visible) => globeCanvasRef?.setLayerVisibility(id, visible)}
        onOpacityChange={(id, opacity) => globeCanvasRef?.setLayerOpacity(id, opacity)}
    />

    <!-- Floating projection picker -->
    <nav class="projection-bar" aria-label="Map projection selector">
        {#each PROJECTIONS as proj (proj.type)}
            <button
                class="proj-btn"
                class:active={activeProjection === proj.type}
                onclick={() => { activeProjection = proj.type; }}
                aria-pressed={activeProjection === proj.type}
                title={proj.description}
            >
                <span class="proj-icon" aria-hidden="true">{proj.icon}</span>
                <span class="proj-label">{proj.label}</span>
            </button>
        {/each}
    </nav>

    <StatusBar bind:this={statusBarRef} />
</main>

<style>
    /* Reset / base */
    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :global(body, html) {
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0d0d0f;
        font-family: 'Noto Sans', system-ui, sans-serif;
    }

    /* Viewport */
    .viewport {
        position: relative;
        width: 100vw;
        height: 100dvh;
        overflow: hidden;
    }

    .canvas-wrapper {
        position: absolute;
        inset: 0;
    }

    /* Projection bar */
    .projection-bar {
        position: fixed;
        bottom: 3.25rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 0.25rem;
        padding: 0.35rem;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.6),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        z-index: 10;
    }

    /* Individual buttons */
    .proj-btn {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.9rem;
        background: transparent;
        border: none;
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.45);
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 500;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition:
            color 200ms ease,
            background 200ms ease,
            transform 120ms ease;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
    }

    .proj-btn:hover {
        color: rgba(255, 255, 255, 0.75);
        background: rgba(255, 255, 255, 0.07);
    }

    .proj-btn.active {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.15);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
    }

    .proj-btn:active {
        transform: scale(0.96);
    }

    .proj-icon {
        font-size: 1rem;
        line-height: 1;
    }

    .proj-label {
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    /* Responsive */
    @media (max-width: 480px) {
        .proj-label {
            display: none;
        }
        .proj-btn {
            padding: 0.5rem 0.65rem;
        }
    }
</style>