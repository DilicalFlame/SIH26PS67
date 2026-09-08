/**
 * geo-parser.ts
 *
 * Procedurally generates the lat/lon graticule as a THREE.LineSegments,
 * quantized to the same Int16/[-1,1] attribute layout the tile pipeline
 * uses (see tile.worker.ts) so it shares the shader path unchanged. The
 * graticule is cheap and resolution-independent, so unlike coastlines it is
 * not streamed as PMTiles — it's generated client-side, once.
 *
 * Attribute layout per vertex (Int16, GPU-normalized to [-1,1]):
 *   a_quantCoord     : this vertex, relative to the whole-world bbox
 *   a_quantCoordNext : partner vertex in the segment (antimeridian clipping)
 */

import * as THREE from 'three';

export interface GraticuleBuffers {
	graticule: THREE.LineSegments;
}

/** Grid spacing between graticule lines, and the sampling step along them. */
const GRID_STEP = 15;
const SAMPLE_STEP = 2;
/** Meridians stop short of the poles, where they converge into noise. */
const LAT_LIMIT = 80;

const DEG2RAD = Math.PI / 180;
const QUANT = 32767;

/** Whole-world bbox half-extent, radians — matches u_tileHalfExtent's convention. */
export const WORLD_HALF_EXTENT = { lon: Math.PI, lat: Math.PI / 2 };

function quantizeWorld(lonRad: number, latRad: number): [number, number] {
	const qx = Math.round((lonRad / WORLD_HALF_EXTENT.lon) * QUANT);
	const qy = Math.round((latRad / WORLD_HALF_EXTENT.lat) * QUANT);
	return [Math.max(-QUANT, Math.min(QUANT, qx)), Math.max(-QUANT, Math.min(QUANT, qy))];
}

/**
 * Build graticule lines sampled densely enough to look curved.
 *
 * d3-geo's geoGraticule() is not usable here: it emits meridians with only
 * three points (pole, equator, pole) because it assumes the renderer performs
 * adaptive resampling, as d3's own path generator does. This shader draws
 * every segment as a straight screen-space line, so those meridians render as
 * long chords slicing across the globe.
 */
function graticuleRings(): number[][][] {
	const rings: number[][][] = [];

	for (let lon = -180; lon <= 180; lon += GRID_STEP) {
		const meridian: number[][] = [];
		for (let lat = -LAT_LIMIT; lat <= LAT_LIMIT; lat += SAMPLE_STEP) {
			meridian.push([lon, lat]);
		}
		meridian.push([lon, LAT_LIMIT]);
		rings.push(meridian);
	}

	for (let lat = -LAT_LIMIT; lat <= LAT_LIMIT; lat += GRID_STEP) {
		const parallel: number[][] = [];
		for (let lon = -180; lon <= 180; lon += SAMPLE_STEP) {
			parallel.push([lon, lat]);
		}
		parallel.push([180, lat]);
		rings.push(parallel);
	}

	return rings;
}

function coordinatesToQuantSegments(rings: number[][][]): { coord: Int16Array; next: Int16Array } {
	let totalVerts = 0;
	for (const ring of rings) if (ring.length >= 2) totalVerts += (ring.length - 1) * 2;

	const coord = new Int16Array(totalVerts * 2);
	const next = new Int16Array(totalVerts * 2);
	let i = 0;

	for (const ring of rings) {
		for (let j = 0; j < ring.length - 1; j++) {
			const [lon0, lat0] = quantizeWorld(ring[j][0] * DEG2RAD, ring[j][1] * DEG2RAD);
			const [lon1, lat1] = quantizeWorld(ring[j + 1][0] * DEG2RAD, ring[j + 1][1] * DEG2RAD);

			coord[i * 2] = lon0;
			coord[i * 2 + 1] = lat0;
			next[i * 2] = lon1;
			next[i * 2 + 1] = lat1;
			i++;

			coord[i * 2] = lon1;
			coord[i * 2 + 1] = lat1;
			next[i * 2] = lon0;
			next[i * 2 + 1] = lat0;
			i++;
		}
	}

	return { coord, next };
}

export function buildGraticule(material: THREE.ShaderMaterial): GraticuleBuffers {
	const { coord, next } = coordinatesToQuantSegments(graticuleRings());

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('a_quantCoord', new THREE.Int16BufferAttribute(coord, 2, true));
	geo.setAttribute('a_quantCoordNext', new THREE.Int16BufferAttribute(next, 2, true));
	geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((coord.length / 2) * 3), 3));

	const graticule = new THREE.LineSegments(geo, material);
	graticule.name = 'graticule';
	graticule.frustumCulled = false;

	return { graticule };
}
