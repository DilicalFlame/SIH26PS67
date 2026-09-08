/**
 * tile.worker.ts
 *
 * Runs entirely off the main thread: fetches a tile's bytes via the PMTiles
 * range-request protocol, decodes the MVT (protobuf) payload, and triangulates
 * each polygon layer into GPU-ready fills.
 *
 * Fills rather than outlines: the source layers (land / lake / island_in_lake /
 * antarctica_*) are polygons, and drawing them as ring outlines makes every
 * coastline appear two or three times over — once from the tile itself, again
 * from its retained parent, and again from the neighbouring tile's buffer.
 * Opaque fills composite cleanly instead, which is how a normal vector basemap
 * renders this data.
 *
 * Positions stay quantized to Int16 in tile-local space (see the GPU
 * dequantization in fill.vert.glsl); results transfer back as transferable
 * ArrayBuffers, so no geometry is structured-clone copied.
 */

import * as Comlink from 'comlink';
import { PMTiles } from 'pmtiles';
import { VectorTile, classifyRings } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import earcut from 'earcut';

export interface DecodeRequest {
	url: string;
	z: number;
	x: number;
	y: number;
}

export interface LayerMesh {
	/** MVT layer name, e.g. "land" — maps to a style entry in layers.config.ts. */
	name: string;
	/** Int16 (x,y) pairs, normalized to [-1,1] across the tile's bbox. */
	positions: Int16Array;
	indices: Uint32Array;
}

export interface DecodeResult {
	layers: LayerMesh[];
}

const QUANT = 32767;

/**
 * MVT tiles carry geometry beyond their own bounds (the buffer), which is what
 * lets neighbouring tiles stitch. Positions can therefore land outside [-1,1];
 * the fragment shader clips each tile to its own bounds, so the overhang is
 * kept here rather than clamped, which would distort edge geometry.
 */
function quantize(norm01: number): number {
	const v = Math.round((norm01 * 2 - 1) * QUANT);
	return Math.max(-32768, Math.min(QUANT, v));
}

const sources = new Map<string, PMTiles>();
function getSource(url: string): PMTiles {
	let pm = sources.get(url);
	if (!pm) {
		pm = new PMTiles(url);
		sources.set(url, pm);
	}
	return pm;
}

async function decodeTileImpl(req: DecodeRequest): Promise<DecodeResult> {
	const source = getSource(req.url);
	const entry = await source.getZxy(req.z, req.x, req.y);
	if (!entry) return { layers: [] };

	const tile = new VectorTile(new PbfReader(new Uint8Array(entry.data as ArrayBuffer)));
	const layers: LayerMesh[] = [];

	for (const name of Object.keys(tile.layers)) {
		const layer = tile.layers[name];
		const extent = layer.extent;

		const positions: number[] = [];
		const indices: number[] = [];

		for (let i = 0; i < layer.length; i++) {
			const feature = layer.feature(i);
			if (feature.type !== 3) continue; // fills only

			// classifyRings splits the ring soup into polygons of
			// [exterior, ...holes] using ring winding, which is what earcut's
			// hole-index form expects.
			for (const polygon of classifyRings(feature.loadGeometry())) {
				const flat: number[] = [];
				const holes: number[] = [];

				for (let r = 0; r < polygon.length; r++) {
					if (r > 0) holes.push(flat.length / 2);
					for (const p of polygon[r]) {
						flat.push(p.x / extent, p.y / extent);
					}
				}
				if (flat.length < 6) continue;

				const tri = earcut(flat, holes.length ? holes : undefined, 2);
				if (!tri.length) continue;

				const base = positions.length / 2;
				for (let k = 0; k < flat.length; k += 2) {
					positions.push(quantize(flat[k]), quantize(1 - flat[k + 1])); // MVT y grows south
				}
				for (const idx of tri) indices.push(base + idx);
			}
		}

		if (indices.length) {
			layers.push({
				name,
				positions: Int16Array.from(positions),
				indices: Uint32Array.from(indices),
			});
		}
	}

	return { layers };
}

async function decodeTile(req: DecodeRequest): Promise<DecodeResult> {
	const result = await decodeTileImpl(req);
	const transfers: ArrayBuffer[] = [];
	for (const l of result.layers) {
		transfers.push(l.positions.buffer as ArrayBuffer, l.indices.buffer as ArrayBuffer);
	}
	return Comlink.transfer(result, transfers);
}

const api = { decodeTile };
export type TileWorkerApi = typeof api;

Comlink.expose(api);
