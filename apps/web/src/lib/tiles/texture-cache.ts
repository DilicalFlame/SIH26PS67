import * as THREE from 'three';

export interface TextureCacheKey {
  layerId: string;
  depth: number;
  time: number;
}

export class TextureCache {
  private cache = new Map<string, THREE.DataTexture>();
  private accessOrder: string[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  private getKeyString(key: TextureCacheKey): string {
    return `${key.layerId}:${key.depth}:${key.time}`;
  }

  public get(key: TextureCacheKey): THREE.DataTexture | undefined {
    const keyStr = this.getKeyString(key);
    if (this.cache.has(keyStr)) {
      // Refresh access order for LRU
      this.accessOrder = this.accessOrder.filter((k) => k !== keyStr);
      this.accessOrder.push(keyStr);
      return this.cache.get(keyStr);
    }
    return undefined;
  }

  public set(key: TextureCacheKey, texture: THREE.DataTexture): void {
    const keyStr = this.getKeyString(key);

    if (this.cache.has(keyStr)) {
      this.cache.set(keyStr, texture);
      this.accessOrder = this.accessOrder.filter((k) => k !== keyStr);
      this.accessOrder.push(keyStr);
      return;
    }

    // Evict oldest if max size reached
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        const oldTexture = this.cache.get(oldestKey);
        if (oldTexture) {
          oldTexture.dispose(); // Prevent GPU memory leaks
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(keyStr, texture);
    this.accessOrder.push(keyStr);
  }

  public clear(): void {
    for (const texture of this.cache.values()) {
      texture.dispose();
    }
    this.cache.clear();
    this.accessOrder = [];
  }

  public setMaxSize(size: number): void {
    this.maxSize = size;
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        const oldTexture = this.cache.get(oldestKey);
        if (oldTexture) {
          oldTexture.dispose();
        }
        this.cache.delete(oldestKey);
      }
    }
  }

  public size(): number {
    return this.cache.size;
  }
}

export const globalTextureCache = new TextureCache(150);