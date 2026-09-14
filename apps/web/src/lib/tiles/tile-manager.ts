/**
 * tile-manager.ts
 *
 * Per-layer quadtree/LOD controller. Each update() call:
 *   1. Computes the visible lon/lat bbox + target zoom from camera state.
 *   2. Requests any missing tiles from the worker pool (dedup'd via cache).
 *   3. Adds newly-ready tiles to the scene.
 *   4. Retires tiles that fell out of view — except any ancestor of a tile
 *      that hasn't finished loading, which stays put so no hole opens up.
 *
 * Fills are opaque and composited by painter's algorithm: style order first
 * (lakes over land), then tile zoom, so a child tile paints over the retained
 * parent it replaces instead of fighting with it.
 */

import * as THREE from 'three';
import type { LayerStyle, TileLayerConfig } from './layers.config';
import { resolveLayer, type LayerRuntime } from './pmtiles-source';
import { TileWorkerPool } from './tile-worker-pool';
import { TileLRUCache } from './tile-cache';
import {
    tileKey,
    tileToLonLatBounds,
    tilesForBounds,
    countTilesForBounds,
    parentOf,
    lonLatToTile,
} from './tile-math';
import { computeVisibleBounds, zoomForScale, type LonLatBoundsRad } from './projection-math';
import { ProjectionType } from '$lib/types/projection';
import type { DecodeResult } from './tile.worker';

const DEG2RAD = Math.PI / 180;
const MAX_TILES_PER_LAYER = 400;
const CACHE_SIZE_PER_LAYER = 512;
const PREFETCH_VELOCITY_THRESHOLD = 0.15; // px/ms, tuned against typical wheel deltas
const MAX_TILE_ATTEMPTS = 3;

interface TileEntry {
    z: number;
    x: number;
    y: number;
    key: string;
    meshes: THREE.Mesh[];
    state: 'pending' | 'ready' | 'empty';
    inScene: boolean;
    markedForDisposal: boolean;
}

export interface TileManagerFrameParams {
    rotMat3: THREE.Matrix3;
    scale: number;
    aspect: number;
    canvasWidthPx: number;
    projectionA: ProjectionType;
    projectionB: ProjectionType;
    blend: number;
    pan: THREE.Vector2;
}

export interface WheelVelocityParams {
    lon: number; // degrees, true (unrotated) geographic position under the cursor
    lat: number;
    currentZ: number;
    velocityPxPerMs: number; // signed: positive = zooming in
}

/** Diagnostic snapshot for TileDebugOverlay — see getDebugInfo(). */
export interface TileDebugInfo {
    layerId: string;
    /** The zoom actually used to build `desired` this frame, i.e. after the
     *  MAX_TILES_PER_LAYER budget backoff — not the raw zoomForScale(), which
     *  can disagree with what's actually rendering on a wide/polar view. */
    effectiveZoom: number;
    /** Count of cache entries currently in the scene, keyed by their own zoom
     *  (not `effectiveZoom`) — the direct evidence of whether a stale or
     *  wrong-zoom tile is still resident. */
    tileCountsByZoom: Record<number, number>;
}

export class TileManager {
    private pool = new TileWorkerPool();
    private layers: LayerRuntime[] = [];
    private caches = new Map<string, TileLRUCache<TileEntry>>();
    private scene!: THREE.Scene;
    private baseMaterial!: THREE.ShaderMaterial;
    /** One material per (tileset, style) — all tiles of a layer share a colour. */
    private materials = new Map<string, THREE.ShaderMaterial>();
    /** Failure counts per tile key, kept outside the entry so retries can't reset them. */
    private failures = new Map<string, number>();
    private debugInfo = new Map<string, TileDebugInfo>();
    private layerVisibility = new Map<string, boolean>();

    async init(
        scene: THREE.Scene,
        baseMaterial: THREE.ShaderMaterial,
        configs: TileLayerConfig[]
    ): Promise<void> {
        this.scene = scene;
        this.baseMaterial = baseMaterial;
        this.layers = await Promise.all(configs.map(resolveLayer));

        for (const layer of this.layers) {
            this.caches.set(
                layer.config.id,
                new TileLRUCache<TileEntry>(
                    CACHE_SIZE_PER_LAYER,
                    (_key, entry) => this.disposeEntry(entry),
                    (entry) => entry.inScene || entry.z === layer.minZoom
                )
            );
            for (const style of layer.config.styles) {
                this.materials.set(this.styleKey(layer, style), this.makeMaterial(style));
            }
            this.ensureBaseLayer(layer);
        }
    }

    /**
     * Load the whole world at the layer's base zoom and keep it resident. It is
     * a handful of small tiles, and it guarantees something is always under the
     * view: without it, a fast zoom or pan outruns the loader and shows bare
     * ocean until the new level arrives.
     */
    private ensureBaseLayer(layer: LayerRuntime): void {
        const cache = this.caches.get(layer.config.id)!;
        const z = layer.minZoom;
        const n = 2 ** z;
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                const key = tileKey(layer.config.id, z, x, y);
                if (cache.get(key)) continue;
                const entry = this.createPendingEntry(z, x, y, key);
                cache.set(key, entry);
                void this.requestTile(layer, entry);
            }
        }
    }

    update(params: TileManagerFrameParams): void {
        const dominant = params.blend < 0.5 ? params.projectionA : params.projectionB;
        const bounds = computeVisibleBounds({
            rotMat3: params.rotMat3,
            scale: params.scale,
            aspect: params.aspect,
            projectionType: dominant,
            pan: params.pan,
        });

        this.syncMaterialUniforms(params);

        for (const layer of this.layers) {
            this.updateLayer(layer, bounds, params);
        }
    }

    onWheelVelocity(p: WheelVelocityParams): void {
        if (Math.abs(p.velocityPxPerMs) < PREFETCH_VELOCITY_THRESHOLD) return;
        const targetZ = Math.round(p.currentZ) + (p.velocityPxPerMs > 0 ? 1 : -1);

        for (const layer of this.layers) {
            const z = Math.max(layer.minZoom, Math.min(layer.maxZoom, targetZ));
            const cache = this.caches.get(layer.config.id)!;
            const n = 2 ** z;
            const { x, y } = lonLatToTile(p.lon, p.lat, z);
            const fx = Math.floor(x);
            const fy = Math.floor(y);

            // x wraps around the globe, y clamps (no wrap past the poles).
            const seen = new Set<string>();
            for (const dx of [0, 1]) {
                for (const dy of [0, 1]) {
                    const cx = (((fx + dx) % n) + n) % n;
                    const cy = Math.max(0, Math.min(n - 1, fy + dy));
                    const id = `${cx}/${cy}`;
                    if (seen.has(id)) continue;
                    seen.add(id);

                    const key = tileKey(layer.config.id, z, cx, cy);
                    if (cache.get(key)) continue;
                    const entry = this.createPendingEntry(z, cx, cy, key);
                    cache.set(key, entry);
                    void this.requestTile(layer, entry);
                }
            }
        }
    }

    dispose(): void {
        for (const cache of this.caches.values()) {
            for (const [, entry] of [...cache.entries()]) this.disposeEntry(entry);
        }
        for (const mat of this.materials.values()) mat.dispose();
        this.materials.clear();
        this.pool.dispose();
    }

    /** Snapshot for TileDebugOverlay, refreshed once per layer at the end of
     *  each updateLayer() call. */
    getDebugInfo(): TileDebugInfo[] {
        return [...this.debugInfo.values()];
    }

    /** Sets the visibility for a specific layer. */
    public setLayerVisibility(layerId: string, visible: boolean): void {
        this.layerVisibility.set(layerId, visible);
        const cache = this.caches.get(layerId);
        if (!cache) return;

        for (const [, entry] of cache.entries()) {
            for (const mesh of entry.meshes) {
                mesh.visible = visible;
            }
        }
    }

    /** Sets the opacity for all styles belonging to a specific layer. */
    public setLayerOpacity(layerId: string, opacity: number): void {
        const layer = this.layers.find((l) => l.config.id === layerId);
        if (!layer) return;

        for (const style of layer.config.styles) {
            const mat = this.materials.get(this.styleKey(layer, style));
            if (mat && mat.uniforms.u_opacity) {
                mat.uniforms.u_opacity.value = opacity;
            }
        }
    }

    // -- internals ------------------------------------------------------------

    private styleKey(layer: LayerRuntime, style: LayerStyle): string {
        return `${layer.config.id}/${style.name}`;
    }

    private makeMaterial(style: LayerStyle): THREE.ShaderMaterial {
        const mat = this.baseMaterial.clone();
        mat.uniforms.u_color.value = new THREE.Color(style.color);
        mat.uniforms.u_opacity.value = style.opacity ?? 1.0;
        return mat;
    }

    /** Camera state is shared by every tile, so it lives on the per-style materials. */
    private syncMaterialUniforms(params: TileManagerFrameParams): void {
        let sphereWeight = 0;
        if (params.projectionA === ProjectionType.Sphere) sphereWeight += 1 - params.blend;
        if (params.projectionB === ProjectionType.Sphere) sphereWeight += params.blend;

        for (const mat of this.materials.values()) {
            const u = mat.uniforms;
            u.u_globeRotation.value = params.rotMat3;
            u.u_projectionTypeA.value = params.projectionA;
            u.u_projectionTypeB.value = params.projectionB;
            u.u_blend.value = params.blend;
            u.u_scale.value = params.scale;
            u.u_aspect.value = params.aspect;
            u.u_pan.value.copy(params.pan);
            u.u_sphereWeight.value = Math.max(0, Math.min(1, sphereWeight));
        }
    }

    private updateLayer(
        layer: LayerRuntime,
        bounds: LonLatBoundsRad,
        params: TileManagerFrameParams
    ): void {
        const cache = this.caches.get(layer.config.id)!;
        const degBounds = {
            lonMin: bounds.lonMin / DEG2RAD,
            lonMax: bounds.lonMax / DEG2RAD,
            latMin: bounds.latMin / DEG2RAD,
            latMax: bounds.latMax / DEG2RAD,
        };

        let z = Math.max(
            layer.minZoom,
            Math.min(layer.maxZoom, zoomForScale(params.scale, params.canvasWidthPx))
        );
        while (z > layer.minZoom && countTilesForBounds(degBounds, z) > MAX_TILES_PER_LAYER) z--;

        const desired = tilesForBounds(degBounds, z, MAX_TILES_PER_LAYER);
        const desiredKeys = new Set(desired.map((t) => tileKey(layer.config.id, t.z, t.x, t.y)));

        for (const [, entry] of cache.entries()) {
            if (entry.z !== layer.minZoom || entry.state !== 'ready' || entry.inScene) continue;
            for (const mesh of entry.meshes) this.scene.add(mesh);
            entry.inScene = true;
        }

        const protectedKeys = new Set<string>();

        for (const t of desired) {
            const key = tileKey(layer.config.id, t.z, t.x, t.y);
            let entry = cache.get(key);
            if (!entry) {
                entry = this.createPendingEntry(t.z, t.x, t.y, key);
                cache.set(key, entry);
                void this.requestTile(layer, entry);
            }
            if (entry.state === 'ready' && !entry.inScene) {
                for (const mesh of entry.meshes) this.scene.add(mesh);
                entry.inScene = true;
            }
            entry.markedForDisposal = false;

            if (!entry.inScene) {
                for (let a = parentOf(t); a; a = parentOf(a)) {
                    protectedKeys.add(tileKey(layer.config.id, a.z, a.x, a.y));
                }
            }
        }

        for (const [key, entry] of [...cache.entries()]) {
            if (desiredKeys.has(key) || !entry.inScene) continue;

            if (entry.z === layer.minZoom) {
                entry.markedForDisposal = false;
                continue;
            }

            if (protectedKeys.has(key)) {
                entry.markedForDisposal = false;
                continue;
            }

            if (entry.markedForDisposal) {
                for (const mesh of entry.meshes) this.scene.remove(mesh);
                entry.inScene = false;
            } else {
                entry.markedForDisposal = true;
            }
        }

        const tileCountsByZoom: Record<number, number> = {};
        for (const [, entry] of cache.entries()) {
            if (!entry.inScene) continue;
            tileCountsByZoom[entry.z] = (tileCountsByZoom[entry.z] ?? 0) + 1;
        }
        this.debugInfo.set(layer.config.id, { layerId: layer.config.id, effectiveZoom: z, tileCountsByZoom });
    }

    private createPendingEntry(z: number, x: number, y: number, key: string): TileEntry {
        return {
            z,
            x,
            y,
            key,
            meshes: [],
            state: 'pending',
            inScene: false,
            markedForDisposal: false,
        };
    }

    private async requestTile(layer: LayerRuntime, entry: TileEntry): Promise<void> {
        try {
            const result = await this.pool.decode({
                url: layer.url,
                z: entry.z,
                x: entry.x,
                y: entry.y,
            });
            this.failures.delete(entry.key);
            this.buildMeshes(layer, entry, result);
        } catch (err) {
            const attempts = (this.failures.get(entry.key) ?? 0) + 1;
            this.failures.set(entry.key, attempts);

            if (attempts < MAX_TILE_ATTEMPTS) {
                this.caches.get(layer.config.id)?.delete(entry.key);
                this.disposeEntry(entry);
            } else {
                console.error('[TileManager] decode failed', layer.config.id, entry.z, entry.x, entry.y, err);
                entry.state = 'empty';
            }
        }
    }

    private buildMeshes(layer: LayerRuntime, entry: TileEntry, result: DecodeResult): void {
        const b = tileToLonLatBounds(entry.z, entry.x, entry.y);
        const lonMinR = b.lonMin * DEG2RAD;
        const lonMaxR = b.lonMax * DEG2RAD;
        const lon = new THREE.Vector2((lonMinR + lonMaxR) / 2, (lonMaxR - lonMinR) / 2);

        const n = 2 ** entry.z;
        const mercTop = entry.y / n;
        const mercBottom = (entry.y + 1) / n;
        const mercY = new THREE.Vector2((mercTop + mercBottom) / 2, (mercBottom - mercTop) / 2);

        const isVisible = this.layerVisibility.get(layer.config.id) ?? true;

        for (const mesh of result.layers) {
            const style = layer.config.styles.find((s) => s.name === mesh.name);
            if (!style) continue;
            const material = this.materials.get(this.styleKey(layer, style));
            if (!material) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('a_quantCoord', new THREE.Int16BufferAttribute(mesh.positions, 2, true));
            geo.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(new Float32Array((mesh.positions.length / 2) * 3), 3)
            );
            geo.setIndex(new THREE.Uint32BufferAttribute(mesh.indices, 1));

            const obj = new THREE.Mesh(geo, material);
            obj.frustumCulled = false;
            obj.visible = isVisible;
            obj.renderOrder = style.order * 1000 + entry.z;
            obj.onBeforeRender = () => {
                material.uniforms.u_tileLon.value.copy(lon);
                material.uniforms.u_tileMercY.value.copy(mercY);
                material.uniformsNeedUpdate = true;
            };
            entry.meshes.push(obj);
        }

        entry.state = entry.meshes.length ? 'ready' : 'empty';
    }

    private disposeEntry(entry: TileEntry): void {
        for (const mesh of entry.meshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        entry.meshes.length = 0;
    }
}