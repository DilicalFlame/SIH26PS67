import * as THREE from 'three';
import { globalTextureCache, type TextureCacheKey } from './texture-cache';
export interface PrefetchOptions {
  layerId: string;
  totalTimeSteps: number;
  depthLevels: number[];
  currentDepth: number;
  fetchFunction: (key: TextureCacheKey) => Promise<THREE.DataTexture>;
}

export class PrefetchManager {
  private activePrefetches = new Set<string>();

  public async prefetchTimeSeries(options: PrefetchOptions): Promise<void> {
    const { layerId, totalTimeSteps, currentDepth, fetchFunction } = options;

    // Prefetch the entire time dimension for the current depth first
    for (let time = 0; time < totalTimeSteps; time++) {
      const key: TextureCacheKey = { layerId, depth: currentDepth, time };
      const keyStr = `${layerId}:${currentDepth}:${time}`;

      if (!globalTextureCache.get(key) && !this.activePrefetches.has(keyStr)) {
        this.activePrefetches.add(keyStr);
        fetchFunction(key)
          .then((texture) => {
            globalTextureCache.set(key, texture);
          })
          .catch((err) => {
            console.warn(`Failed to prefetch time series for ${keyStr}:`, err);
          })
          .finally(() => {
            this.activePrefetches.delete(keyStr);
          });
      }
    }
  }

  public async prefetchDepthNeighbors(options: PrefetchOptions, hoveredDepth: number): Promise<void> {
    const { layerId, totalTimeSteps, fetchFunction } = options;

    // Prefetch depth neighbors on hover across time steps
    for (let time = 0; time < totalTimeSteps; time++) {
      const key: TextureCacheKey = { layerId, depth: hoveredDepth, time };
      const keyStr = `${layerId}:${hoveredDepth}:${time}`;

      if (!globalTextureCache.get(key) && !this.activePrefetches.has(keyStr)) {
        this.activePrefetches.add(keyStr);
        fetchFunction(key)
          .then((texture) => {
            globalTextureCache.set(key, texture);
          })
          .catch((err) => {
            console.warn(`Failed to prefetch depth neighbor for ${keyStr}:`, err);
          })
          .finally(() => {
            this.activePrefetches.delete(keyStr);
          });
      }
    }
  }
}

export const globalPrefetchManager = new PrefetchManager();