/**
 * layers.config.ts
 *
 * Registry of PMTiles sources served from MinIO, plus the style for each MVT
 * sub-layer inside them. Adding a new tileset (bathymetry, EEZ, political
 * boundaries, ...) is one entry here - no changes in tile-manager.ts, the
 * worker, or the shaders.
 */

import type { ScalarFieldMeta } from '$lib/types/scalar-field';

/**
 * Deepest tile zoom the data carries. The camera's max zoom is derived from
 * this (see GlobeCanvas.svelte) so camera zoom and tile detail stay in step.
 */
export const MAX_TILE_ZOOM = 14;

/**
 * Deepest CAMERA zoom to allow - one level past MAX_TILE_ZOOM. TileManager
 * already clamps its own tile requests to MAX_TILE_ZOOM (see updateLayer in
 * tile-manager.ts), so letting the camera go one level further is a plain
 * overzoom: the deepest available tile gets magnified past its native
 * resolution instead of the zoom simply hitting a wall, which is the same
 * trade-off every slippy-map viewer makes past a tileset's max zoom.
 */
export const MAX_CAMERA_ZOOM = MAX_TILE_ZOOM + 1;

/**
 * Shallowest zoom to request. Tiles at z0-2 span up to a quarter of the globe
 * each, and their triangles are then large enough that projecting only their
 * vertices visibly facets the sphere. Starting at z3 keeps every tile under
 * 45° across for a smooth limb, at trivial cost (a few KB per tile).
 */
export const MIN_TILE_ZOOM = 3;

export interface LayerStyle {
	/** MVT layer name inside the tile. */
	name: string;
	color: number;
	/**
	 * Painter's-algorithm order within a tileset: lakes must land on top of the
	 * landmass they sit in, islands on top of those lakes.
	 */
	order: number;
	opacity?: number;
}

export interface TileLayerConfig {
	id: string;
	/** Path relative to PUBLIC_TILES_BASE_URL. */
	objectPath: string;
	minZoom: number;
	maxZoom: number;
	styles: LayerStyle[];
}

/** See contracts §5.1. `meta` is fetched once from `/fields/{id}/meta` and handed in whole. */
export interface ScalarFieldLayerConfig {
	kind: 'scalar_field';
	id: string;
	meta: ScalarFieldMeta;
	colormap: string;
	valueRange: [number, number];
	opacity: number;
	visible: boolean;
	depthIndex: number;
	timeIndex: number;
}

// Pastel basemap: muted enough that ocean-data overlays (temperature,
// salinity, currents) will read clearly on top of it later.
export const OCEAN_COLOR = 0x8fb8d8;
export const VOID_COLOR = 0x0c1420;

export const TILE_LAYERS: TileLayerConfig[] = [
	{
		id: 'coastlines',
		objectPath: 'vector/coastlines/coastlines.pmtiles',
		minZoom: MIN_TILE_ZOOM,
		maxZoom: MAX_TILE_ZOOM,
		styles: [
			{ name: 'land', color: 0xe8e3d3, order: 0 },
			// Ice and the ground beneath it share a colour: they overlap almost
			// exactly, and two near-identical shades only ever showed up as a
			// web of hairlines where the upper layer's antialiased polygon
			// edges let the lower one through.
			{ name: 'antarctica_grounds', color: 0xf4f7fa, order: 1 },
			{ name: 'antarctica_ice', color: 0xf4f7fa, order: 2 },
			{ name: 'lake', color: 0x9cc4e0, order: 3 },
			{ name: 'island_in_lake', color: 0xe8e3d3, order: 4 },
			{ name: 'pond_in_island', color: 0x9cc4e0, order: 5 },
		],
	},
];
