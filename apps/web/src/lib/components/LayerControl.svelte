<script lang="ts">
    import { TILE_LAYERS } from '$lib/tiles/layers.config';

    interface Props {
        onVisibilityChange?: (layerId: string, visible: boolean) => void;
        onOpacityChange?: (layerId: string, opacity: number) => void;
    }

    let { onVisibilityChange, onOpacityChange }: Props = $props();

    // Track state locally for UI elements
    let layerState = $state(
        TILE_LAYERS.map(layer => ({
            id: layer.id,
            visible: true,
            opacity: 1.0
        }))
    );

    function handleToggle(id: string) {
        layerState = layerState.map(l => {
            if (l.id === id) {
                const next = !l.visible;
                onVisibilityChange?.(id, next);
                return { ...l, visible: next };
            }
            return l;
        });
    }

    function handleOpacity(id: string, val: number) {
        layerState = layerState.map(l => {
            if (l.id === id) {
                onOpacityChange?.(id, val);
                return { ...l, opacity: val };
            }
            return l;
        });
    }
</script>

<div class="layer-control-panel" aria-label="Layer control panel">
    <div class="panel-header">Layers</div>
    <div class="layer-list">
        {#each layerState as layer (layer.id)}
            <div class="layer-item">
                <label class="layer-info">
                    <input
                        type="checkbox"
                        checked={layer.visible}
                        onchange={() => handleToggle(layer.id)}
                    />
                    <span class="layer-name">{layer.id}</span>
                </label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    disabled={!layer.visible}
                    oninput={(e) => handleOpacity(layer.id, parseFloat(e.currentTarget.value))}
                    class="opacity-slider"
                    aria-label={`${layer.id} opacity`}
                />
            </div>
        {/each}
    </div>
</div>

<style>
    .layer-control-panel {
        position: fixed;
        top: 1.25rem;
        right: 1.25rem;
        width: 240px;
        background: rgba(20, 20, 25, 0.75);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 0.85rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        color: #ffffff;
        font-family: inherit;
        z-index: 20;
        user-select: none;
    }

    .panel-header {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.45);
        margin-bottom: 0.6rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .layer-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .layer-item {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .layer-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.85);
    }

    .layer-info input[type="checkbox"] {
        accent-color: #3b82f6;
        cursor: pointer;
    }

    .opacity-slider {
        width: 100%;
        height: 4px;
        appearance: none;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
    }

    .opacity-slider::-webkit-slider-thumb {
        appearance: none;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border-radius: 50%;
        transition: transform 100ms ease;
    }

    .opacity-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }

    .opacity-slider:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
</style>