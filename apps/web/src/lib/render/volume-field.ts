/**
 * volume-field.ts
 *
 * Fetches a bulk multi-depth grid for the "Visualise Data" 3D popout from
 * the backend's POST /fields/volume (apps/api/app/api/v1/fields.py,
 * app/services/copernicus_volume.py), which fans the GetFeatureInfo
 * requests out server-side - see that module's header comment for why this
 * isn't done point-by-point from the browser the way
 * copernicus-feature-info.ts's fetchGrid does for the 2D analysis views.
 */
import * as THREE from "three";
import { env } from "$env/dynamic/public";
import type { CopernicusWmtsInfo } from "$lib/tiles/data-layers-catalog";
import { STANDARD_DEPTHS_M } from "$lib/copernicus/copernicus-feature-info";
import type { Bbox } from "$lib/measure/shape-layer-intersection";

const API_BASE_URL = env.PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// Coarse by design - width*height*depthCount is the exact upstream
// GetFeatureInfo request count (see MAX_POINTS/MAX_CONCURRENCY on the
// backend). Measured live against the real Copernicus WMTS: individual
// GetFeatureInfo requests run ~1-1.6s apiece even at the backend's
// deliberately-conservative concurrency of 8 (see copernicus_volume.py's
// own note on 429s at higher concurrency) - a 288-point grid (6x6x8) took
// ~58s end to end. 96 points (4x4x6) keeps a cold fetch closer to ~20s.
// Tune upward only after confirming against a real run, not just the
// request-count budget - this service's real latency is much higher than
// copernicus-feature-info.ts's lighter single-view research assumed.
const VOLUME_GRID_WIDTH = 4;
const VOLUME_GRID_HEIGHT = 4;
const VOLUME_DEPTH_COUNT = 6;

export interface VolumeGrid {
	width: number;
	height: number;
	depthCount: number;
	bbox: Bbox;
	/** Metres, negative-down, surface-first - same convention as STANDARD_DEPTHS_M. */
	depths: number[];
	time: string;
	valueMin: number;
	valueMax: number;
	/** Row-major [depth][row][col], row 0 = north edge. NaN for no-data
	 *  (kept as real NaN, not the wire's `null`, so trilinear-sample.ts and
	 *  the histogram can use plain arithmetic checks). */
	raw: Float32Array;
}

/** Evenly-spaced indices into STANDARD_DEPTHS_M (deduped, since a short
 *  STANDARD_DEPTHS_M or a small VOLUME_DEPTH_COUNT could round to repeats) -
 *  spans surface to the deepest standard level rather than sampling only
 *  the shallow end. */
function subsampleDepthIndices(count: number): number[] {
	const n = STANDARD_DEPTHS_M.length;
	const indices: number[] = [];
	for (let k = 0; k < count; k++) {
		indices.push(Math.round((k * (n - 1)) / (count - 1)));
	}
	return Array.from(new Set(indices));
}

interface VolumeGridResponseBody {
	width: number;
	height: number;
	depthCount: number;
	bbox: Bbox;
	depths: number[];
	time: string;
	valueMin: number;
	valueMax: number;
	values: (number | null)[];
}

export async function fetchVolumeGrid(
	wmts: CopernicusWmtsInfo,
	bbox: Bbox,
	isoTime: string,
	signal?: AbortSignal,
): Promise<VolumeGrid> {
	const depthIndices = subsampleDepthIndices(VOLUME_DEPTH_COUNT);
	const elevations = depthIndices.map((i) => String(STANDARD_DEPTHS_M[i]));

	const res = await fetch(`${API_BASE_URL}/fields/volume`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url: wmts.url,
			layer: wmts.layer,
			style: wmts.style,
			bbox,
			width: VOLUME_GRID_WIDTH,
			height: VOLUME_GRID_HEIGHT,
			time: isoTime,
			elevations,
		}),
		signal,
	});
	if (!res.ok) throw new Error(`Volume grid fetch failed: HTTP ${res.status}`);
	const body = (await res.json()) as VolumeGridResponseBody;

	const raw = new Float32Array(body.values.length);
	for (let i = 0; i < body.values.length; i++) {
		const v = body.values[i];
		raw[i] = v === null ? NaN : v;
	}

	return {
		width: body.width,
		height: body.height,
		depthCount: body.depthCount,
		bbox: body.bbox,
		depths: body.depths,
		time: body.time,
		valueMin: body.valueMin,
		valueMax: body.valueMax,
		raw,
	};
}

/** Normalizes to an 8-bit unorm `Data3DTexture` for free hardware trilinear
 *  filtering (WebGL2 only samples `R32F` at NEAREST without the
 *  OES_texture_float_linear extension - see grid-texture.ts's note on the
 *  same limitation for the 2D case) - `grid.raw`'s real float values stay
 *  available on the CPU side for the 2D slicer tool's trilinear sampling,
 *  which needs actual physical values, not renormalized bytes. */
export function buildData3DTexture(grid: VolumeGrid): THREE.Data3DTexture {
	const { width, height, depthCount, raw, valueMin, valueMax } = grid;
	const data = new Uint8Array(width * height * depthCount);
	const range = valueMax - valueMin || 1;
	for (let i = 0; i < raw.length; i++) {
		const v = raw[i];
		data[i] = Number.isNaN(v) ? 0 : Math.round(Math.min(1, Math.max(0, (v - valueMin) / range)) * 255);
	}

	const texture = new THREE.Data3DTexture(data, width, height, depthCount);
	texture.format = THREE.RedFormat;
	texture.type = THREE.UnsignedByteType;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.wrapR = THREE.ClampToEdgeWrapping;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
	return texture;
}
