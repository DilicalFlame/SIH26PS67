import { describe, expect, it } from 'vitest';
import { centroidOf, bboxOf, pointsAlongLine, gridWithinBBox } from './sample-grid';

describe('centroidOf', () => {
	it('averages the vertices', () => {
		expect(centroidOf([[0, 0], [2, 0], [1, 3]])).toEqual([1, 1]);
	});
});

describe('bboxOf', () => {
	it('finds the min/max extent', () => {
		expect(bboxOf([[-5, 2], [10, -3], [0, 8]])).toEqual({ west: -5, south: -3, east: 10, north: 8 });
	});
});

describe('pointsAlongLine', () => {
	it('places count evenly-spaced points across a straight two-vertex line', () => {
		const points = pointsAlongLine([[0, 0], [10, 0]], 5);
		expect(points).toHaveLength(5);
		expect(points[0]).toMatchObject({ lon: 0, lat: 0 });
		expect(points[4]).toMatchObject({ lon: 10, lat: 0 });
		expect(points[2].lon).toBeCloseTo(5, 5);
	});

	it('distanceDeg is monotonically non-decreasing along the line', () => {
		const points = pointsAlongLine([[0, 0], [3, 4], [3, 10]], 10);
		for (let i = 1; i < points.length; i++) {
			expect(points[i].distanceDeg).toBeGreaterThanOrEqual(points[i - 1].distanceDeg);
		}
	});

	it('handles a single-vertex degenerate case without throwing', () => {
		expect(pointsAlongLine([[5, 5]], 10)).toEqual([{ lon: 5, lat: 5, distanceDeg: 0 }]);
	});
});

describe('gridWithinBBox', () => {
	it('produces nx*ny cell-centered points strictly inside the bbox', () => {
		const bbox = { west: 0, south: 0, east: 10, north: 10 };
		const points = gridWithinBBox(bbox, 4, 2);
		expect(points).toHaveLength(8);
		for (const [lon, lat] of points) {
			expect(lon).toBeGreaterThan(bbox.west);
			expect(lon).toBeLessThan(bbox.east);
			expect(lat).toBeGreaterThan(bbox.south);
			expect(lat).toBeLessThan(bbox.north);
		}
		// First cell center: half a cell width/height in from the corner.
		expect(points[0]).toEqual([1.25, 2.5]);
	});
});
