/**
 * sample-grid.ts
 *
 * Turns a measurement's raw [lon, lat] vertices into the point grids
 * copernicus-feature-info.ts's fetchGrid() samples — centroid for a single
 * depth-profile point, evenly-spaced points along a path for a transect,
 * and an evenly-spaced grid within a polygon's bounding box for an areal
 * slice/point cloud. Plain geometry, no Cesium dependency (these work in
 * lon/lat degrees directly, same convention as PersistedMeasurementRecord).
 */

export type LonLat = [number, number];

/** Un-weighted mean of the vertices — good enough for "a representative
 *  point," not a true geodesic/area centroid (matches what the existing
 *  on-map label centroid in path-measure-tool.ts already does). */
export function centroidOf(positions: LonLat[]): LonLat {
	let sumLon = 0;
	let sumLat = 0;
	for (const [lon, lat] of positions) {
		sumLon += lon;
		sumLat += lat;
	}
	return [sumLon / positions.length, sumLat / positions.length];
}

export interface BBox {
	west: number;
	south: number;
	east: number;
	north: number;
}

export function bboxOf(positions: LonLat[]): BBox {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const [lon, lat] of positions) {
		west = Math.min(west, lon);
		east = Math.max(east, lon);
		south = Math.min(south, lat);
		north = Math.max(north, lat);
	}
	return { west, south, east, north };
}

export interface TransectPoint {
	lon: number;
	lat: number;
	/** Cumulative straight-line distance from the first vertex, in the same
	 *  degree units as the input — a plotting axis, not a geodesic distance
	 *  (the depth/slice views don't need true metres, just a consistent
	 *  along-line ordering). */
	distanceDeg: number;
}

/** `count` evenly-spaced points along an open path (straight-line
 *  interpolation between consecutive vertices — the same simplification
 *  the rest of this app's line-drawing already renders as, so a transect
 *  sampled this way matches what the user actually drew). */
export function pointsAlongLine(positions: LonLat[], count: number): TransectPoint[] {
	if (positions.length < 2 || count < 2) {
		const [lon, lat] = positions[0] ?? [0, 0];
		return [{ lon, lat, distanceDeg: 0 }];
	}

	const segmentLengths: number[] = [];
	let totalLength = 0;
	for (let i = 1; i < positions.length; i++) {
		const [lon1, lat1] = positions[i - 1];
		const [lon2, lat2] = positions[i];
		const length = Math.hypot(lon2 - lon1, lat2 - lat1);
		segmentLengths.push(length);
		totalLength += length;
	}

	const points: TransectPoint[] = [];
	for (let step = 0; step < count; step++) {
		const targetDistance = (totalLength * step) / (count - 1);
		let remaining = targetDistance;
		let segmentIndex = 0;
		while (
			segmentIndex < segmentLengths.length - 1 &&
			remaining > segmentLengths[segmentIndex]
		) {
			remaining -= segmentLengths[segmentIndex];
			segmentIndex++;
		}
		const segmentLength = segmentLengths[segmentIndex] || 1e-9;
		const t = Math.min(1, remaining / segmentLength);
		const [lon1, lat1] = positions[segmentIndex];
		const [lon2, lat2] = positions[segmentIndex + 1];
		points.push({
			lon: lon1 + (lon2 - lon1) * t,
			lat: lat1 + (lat2 - lat1) * t,
			distanceDeg: targetDistance,
		});
	}
	return points;
}

/** An `nx` x `ny` evenly-spaced grid of points covering `bbox`, inset half
 *  a cell from each edge (cell-center sampling, not the edges themselves —
 *  avoids every corner sample landing exactly on the polygon's own
 *  boundary, which is more likely to be a coastline/no-data edge case). */
export function gridWithinBBox(bbox: BBox, nx: number, ny: number): LonLat[] {
	const points: LonLat[] = [];
	const cellWidth = (bbox.east - bbox.west) / nx;
	const cellHeight = (bbox.north - bbox.south) / ny;
	for (let row = 0; row < ny; row++) {
		for (let col = 0; col < nx; col++) {
			points.push([bbox.west + cellWidth * (col + 0.5), bbox.south + cellHeight * (row + 0.5)]);
		}
	}
	return points;
}
