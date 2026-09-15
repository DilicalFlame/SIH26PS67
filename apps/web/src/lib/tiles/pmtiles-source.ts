/**
 * pmtiles-source.ts
 *
 * Resolves a configured layer's MinIO URL and reads its PMTiles header
 * (once, on the main thread) to learn the tileset's real min/max zoom —
 * actual tile bytes are fetched inside tile.worker.ts, off the main thread.
 */

import { PMTiles } from 'pmtiles';
import { PUBLIC_TILES_BASE_URL } from '$env/static/public';
import type { TileLayerConfig } from './layers.config';

export interface LayerRuntime {
	config: TileLayerConfig;
	url: string;
	minZoom: number;
	maxZoom: number;
}

export function resolveLayerUrl(config: TileLayerConfig): string {
	const base = PUBLIC_TILES_BASE_URL.replace(/\/$/, '');
	const path = config.objectPath.replace(/^\//, '');
	return `${base}/${path}`;
}

export async function resolveLayer(config: TileLayerConfig): Promise<LayerRuntime> {
	const url = resolveLayerUrl(config);
	const pm = new PMTiles(url);
	const header = await pm.getHeader();
	return {
		config,
		url,
		// The configured floor wins: it exists to keep tiles small enough that
		// projecting only their vertices doesn't facet the globe, even though
		// the archive offers coarser levels.
		minZoom: Math.max(config.minZoom, header.minZoom ?? 0),
		maxZoom: Math.min(config.maxZoom, header.maxZoom ?? config.maxZoom),
	};
}
