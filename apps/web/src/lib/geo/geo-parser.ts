/**
 * geo-parser.ts
 *
 * Fetches /earth-topo.json, extracts world borders + graticule as two separate
 * THREE.LineSegments objects, and stores geographic coordinates (lon/lat in
 * radians) directly in GPU buffer attributes so all projection math can happen
 * in the vertex shader.
 *
 * Attribute layout per vertex:
 *   a_geoCoord     : vec2  (longitude_rad, latitude_rad)  — this vertex
 *   a_geoCoordNext : vec2  (longitude_rad, latitude_rad)  — partner vertex in the segment
 *                    Used for antimeridian clipping in the shader.
 */

import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoGraticule } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiLineString, LineString, GeoJsonObject } from 'geojson';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeoBuffers {
	/** World borders / coastlines from TopoJSON */
	borders: THREE.LineSegments;
	/** Latitude/longitude graticule grid */
	graticule: THREE.LineSegments;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Degrees → radians. */
const DEG2RAD = Math.PI / 180;

/**
 * Convert a GeoJSON MultiLineString (or LineString) coordinate array into a
 * flat Float32Array of [lon_rad, lat_rad] pairs, emitting LINE SEGMENTS
 * (pairs of vertices) rather than LINE STRIP.
 *
 * Also fills a parallel "next" array for antimeridian clipping — each vertex
 * knows the longitude of its segment partner.
 */
function coordinatesToSegments(
	rings: number[][][]
): { coord: Float32Array; next: Float32Array } {
	// Pre-count to avoid repeated allocation
	let totalVerts = 0;
	for (const ring of rings) {
		if (ring.length >= 2) totalVerts += (ring.length - 1) * 2;
	}

	const coord = new Float32Array(totalVerts * 2);
	const next = new Float32Array(totalVerts * 2);
	let i = 0;

	for (const ring of rings) {
		for (let j = 0; j < ring.length - 1; j++) {
			const [lon0, lat0] = ring[j];
			const [lon1, lat1] = ring[j + 1];
			const lon0r = lon0 * DEG2RAD;
			const lat0r = lat0 * DEG2RAD;
			const lon1r = lon1 * DEG2RAD;
			const lat1r = lat1 * DEG2RAD;

			// Start vertex
			coord[i * 2] = lon0r;
			coord[i * 2 + 1] = lat0r;
			next[i * 2] = lon1r;     // partner lon
			next[i * 2 + 1] = lat1r;
			i++;

			// End vertex
			coord[i * 2] = lon1r;
			coord[i * 2 + 1] = lat1r;
			next[i * 2] = lon0r;     // partner lon
			next[i * 2 + 1] = lat0r;
			i++;
		}
	}

	return { coord, next };
}

/** Collect all coordinate rings from a GeoJSON MultiLineString or LineString. */
function extractRings(geom: GeoJsonObject): number[][][] {
	if (!geom) return [];
	if (geom.type === 'MultiLineString') {
		return (geom as MultiLineString).coordinates;
	}
	if (geom.type === 'LineString') {
		return [(geom as LineString).coordinates];
	}
	return [];
}

/** Build a THREE.LineSegments from coordinate + next arrays. */
function buildLineSegments(
	coord: Float32Array,
	next: Float32Array,
	material: THREE.ShaderMaterial
): THREE.LineSegments {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('a_geoCoord', new THREE.Float32BufferAttribute(coord, 2));
	geo.setAttribute('a_geoCoordNext', new THREE.Float32BufferAttribute(next, 2));
	// Dummy position attribute required by Three.js (actual position is computed in shader)
	const positions = new Float32Array((coord.length / 2) * 3);
	geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	return new THREE.LineSegments(geo, material);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse world geometry from `/earth-topo.json` and produce two
 * GPU-ready LineSegments objects sharing the provided ShaderMaterial.
 */
export async function parseGeoBuffers(
	material: THREE.ShaderMaterial
): Promise<GeoBuffers> {
	// ── Fetch + parse TopoJSON ──────────────────────────────────────────────
	const response = await fetch('/earth-topo.json');
	if (!response.ok) throw new Error(`Failed to fetch earth-topo.json: ${response.status}`);
	const topo = (await response.json()) as Topology;

	// Pick the first geometry collection in the topology (typically "countries" or "land")
	const objectKeys = Object.keys(topo.objects);
	if (!objectKeys.length) throw new Error('earth-topo.json has no topology objects');

	// Merge all borders into a single MultiLineString via topojson.mesh
	const meshGeo = topojson.mesh(topo, topo.objects[objectKeys[0]] as GeometryCollection);
	const borderRings = extractRings(meshGeo as GeoJsonObject);

	// ── World borders ───────────────────────────────────────────────────────
	const { coord: borderCoord, next: borderNext } = coordinatesToSegments(borderRings);
	const borders = buildLineSegments(borderCoord, borderNext, material);
	borders.name = 'world-borders';
	borders.frustumCulled = false; // shader controls visibility

	// ── Graticule ───────────────────────────────────────────────────────────
	const graticuleFn = geoGraticule().step([15, 15]);
	const graticuleGeo = graticuleFn();
	const graticuleRings = extractRings(graticuleGeo as GeoJsonObject);
	const { coord: gratCoord, next: gratNext } = coordinatesToSegments(graticuleRings);
	const graticule = buildLineSegments(gratCoord, gratNext, material.clone());
	graticule.name = 'graticule';
	graticule.frustumCulled = false;

	return { borders, graticule };
}
