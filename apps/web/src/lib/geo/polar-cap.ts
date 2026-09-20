/**
 * polar-cap.ts
 *
 * Web Mercator tiles stop at ±85.05°, so no tile covers the ground beneath
 * Antarctica - the south pole is a hole the tile pipeline can never fill. This
 * builds that cap analytically: a fan of triangles from the pole out to the
 * tile pyramid's southern edge, drawn with the ice colour underneath the real
 * ice tiles.
 */

import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
/** Matches the tile pyramid's cutoff, with a hair of overlap to avoid a seam. */
const CAP_EDGE_LAT = -85.0;
const LON_STEP = 2;

export function buildSouthPolarCap(material: THREE.ShaderMaterial): THREE.Mesh {
	const lonLat: number[] = [];
	const indices: number[] = [];

	// Vertex 0 is the pole; the rest ring the cap's edge.
	lonLat.push(0, -90 * DEG2RAD);
	let ring = 0;
	for (let lon = -180; lon <= 180; lon += LON_STEP) {
		lonLat.push(lon * DEG2RAD, CAP_EDGE_LAT * DEG2RAD);
		ring++;
		if (ring >= 2) indices.push(0, ring - 1, ring);
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('a_lonLat', new THREE.Float32BufferAttribute(lonLat, 2));
	// The shader derives position entirely from a_lonLat, but Three.js still
	// needs `position` to infer the draw range.
	geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((lonLat.length / 2) * 3), 3));
	geo.setIndex(indices);

	const mesh = new THREE.Mesh(geo, material);
	mesh.frustumCulled = false;
	mesh.name = 'south-polar-cap';
	return mesh;
}
