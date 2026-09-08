/**
 * tile-math.ts
 *
 * Standard slippy-map (Web Mercator XYZ) tile <-> lon/lat conversions. This
 * is purely a spatial index for streaming PMTiles pyramids — it has nothing
 * to do with which of the 4 GPU projections is currently on screen (see
 * globe.vert.glsl). All angles here are degrees unless noted.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MAX_LAT = 85.0511;

export interface TileId {
	z: number;
	x: number;
	y: number;
}

export interface LonLatBounds {
	lonMin: number;
	lonMax: number;
	latMin: number;
	latMax: number;
}

/** Fractional tile coordinates for a lon/lat at zoom z. */
export function lonLatToTile(lonDeg: number, latDeg: number, z: number): { x: number; y: number } {
	const n = 2 ** z;
	const x = ((lonDeg + 180) / 360) * n;
	const latRad = Math.max(-MAX_LAT, Math.min(MAX_LAT, latDeg)) * DEG2RAD;
	const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
	return { x, y };
}

export function tileToLonLatBounds(z: number, x: number, y: number): LonLatBounds {
	const n = 2 ** z;
	const lonMin = (x / n) * 360 - 180;
	const lonMax = ((x + 1) / n) * 360 - 180;
	const latAt = (ty: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * RAD2DEG;
	return { lonMin, lonMax, latMin: latAt(y + 1), latMax: latAt(y) };
}

export function tileKey(layerId: string, z: number, x: number, y: number): string {
	return `${layerId}/${z}/${x}/${y}`;
}

export function parentOf(t: TileId): TileId | null {
	if (t.z <= 0) return null;
	return { z: t.z - 1, x: Math.floor(t.x / 2), y: Math.floor(t.y / 2) };
}

export function childrenOf(t: TileId): TileId[] {
	const z = t.z + 1;
	const x = t.x * 2;
	const y = t.y * 2;
	return [
		{ z, x, y },
		{ z, x: x + 1, y },
		{ z, x, y: y + 1 },
		{ z, x: x + 1, y: y + 1 },
	];
}

/** Tile index range covering `bounds` at zoom z, as counts plus start indices. */
function tileRange(bounds: LonLatBounds, z: number) {
	const n = 2 ** z;
	const lonSpan = bounds.lonMax - bounds.lonMin;
	const wholeWorld = lonSpan >= 359;

	const top = lonLatToTile(bounds.lonMin, bounds.latMax, z);
	const bot = lonLatToTile(bounds.lonMax, bounds.latMin, z);

	// latMax should map to the smaller y, but a degenerate or inverted bbox
	// (which polar views can produce) would otherwise yield y0 > y1 and an
	// empty loop — dropping every tile and blanking the map.
	let y0 = Math.floor(Math.min(top.y, bot.y));
	let y1 = Math.floor(Math.max(top.y, bot.y));
	y0 = Math.max(0, Math.min(n - 1, y0));
	y1 = Math.max(0, Math.min(n - 1, y1));

	let x0: number;
	let xCount: number;
	if (wholeWorld) {
		x0 = 0;
		xCount = n;
	} else {
		x0 = ((Math.floor(top.x) % n) + n) % n;
		const x1 = ((Math.floor(bot.x) % n) + n) % n;
		xCount = x1 >= x0 ? x1 - x0 + 1 : n - x0 + x1 + 1;
		// A span wider than the world would otherwise request duplicates.
		xCount = Math.min(xCount, n);
	}

	return { n, x0, xCount, y0, y1 };
}

/** How many tiles `bounds` needs at zoom z, without building the list. */
export function countTilesForBounds(bounds: LonLatBounds, z: number): number {
	const { xCount, y0, y1 } = tileRange(bounds, z);
	return xCount * (y1 - y0 + 1);
}

/**
 * Enumerate tiles overlapping a lon/lat bbox at zoom z, capped at maxTiles.
 * Handles antimeridian wraparound and whole-world bounds.
 */
export function tilesForBounds(bounds: LonLatBounds, z: number, maxTiles = 512): TileId[] {
	const { n, x0, xCount, y0, y1 } = tileRange(bounds, z);
	const tiles: TileId[] = [];
	for (let i = 0; i < xCount; i++) {
		const x = (x0 + i) % n;
		for (let y = y0; y <= y1; y++) {
			tiles.push({ z, x, y });
			if (tiles.length >= maxTiles) return tiles;
		}
	}
	return tiles;
}
