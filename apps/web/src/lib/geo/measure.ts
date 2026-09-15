/**
 * measure.ts
 *
 * Geodesic distance and spherical-excess polygon area — the math behind the
 * path/polygon measuring tool. Distance uses Cesium's own ellipsoidal
 * geodesic (accurate on the real WGS84 ellipsoid, not a flat-plane
 * approximation); area uses the spherical-excess algorithm from Chamberlain
 * & Duquette, "Some Algorithms for Polygons on a Sphere" (JPL, 2007) — the
 * same method Turf.js and Leaflet.draw use for on-map area measurement, and
 * accurate to within a fraction of a percent for any polygon that isn't
 * absurdly large (WGS84's flattening is ~1/298, far below the precision
 * this tool needs to be useful).
 */
import * as Cesium from "cesium";

/** Mean Earth radius (m) — matches the widely-used convention for this
 *  spherical-excess formula (Turf.js's default `earthRadius`). */
const EARTH_RADIUS_M = 6371008.8;

/** Geodesic surface distance (m) between two points on the WGS84 ellipsoid. */
export function geodesicDistanceMeters(a: Cesium.Cartographic, b: Cesium.Cartographic): number {
	return new Cesium.EllipsoidGeodesic(a, b).surfaceDistance;
}

/** Total length (m) of an open path — sum of consecutive geodesic segments. */
export function pathLengthMeters(points: Cesium.Cartographic[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += geodesicDistanceMeters(points[i - 1], points[i]);
	}
	return total;
}

/**
 * Area (m²) of a closed polygon on the sphere. `points` are the ring's
 * vertices in order, WITHOUT repeating the first point at the end — the
 * closing edge is implied.
 */
export function polygonAreaSquareMeters(points: Cesium.Cartographic[]): number {
	const n = points.length;
	if (n < 3) return 0;
	let total = 0;
	for (let i = 0; i < n; i++) {
		const p1 = points[(i + n - 1) % n];
		const p2 = points[i];
		const p3 = points[(i + 1) % n];
		total += (p3.longitude - p1.longitude) * Math.sin(p2.latitude);
	}
	return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** e.g. "850 m" below 1km, "1.24 km" above. */
export function formatDistance(meters: number): string {
	if (meters < 1000) return `${Math.round(meters)} m`;
	return `${(meters / 1000).toFixed(2)} km`;
}

/** e.g. "850 m²" below 1km², "1.24 km²" above. */
export function formatArea(squareMeters: number): string {
	if (squareMeters < 1_000_000) return `${Math.round(squareMeters).toLocaleString()} m²`;
	return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
}
