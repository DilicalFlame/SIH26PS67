import { describe, expect, it } from 'vitest';
import * as Cesium from 'cesium';
import {
	geodesicDistanceMeters,
	pathLengthMeters,
	polygonAreaSquareMeters,
	headingDegrees,
	formatDistance,
	formatArea,
	formatHeading
} from './measure';

function carto(lonDeg: number, latDeg: number): Cesium.Cartographic {
	return Cesium.Cartographic.fromDegrees(lonDeg, latDeg);
}

describe('geodesicDistanceMeters', () => {
	it('matches the well-known ~111.32km per degree of longitude at the equator', () => {
		const d = geodesicDistanceMeters(carto(0, 0), carto(1, 0));
		expect(d).toBeCloseTo(111319, -3); // within ~1km
	});

	it('matches ~110.57km per degree of latitude near the equator (WGS84 flattening)', () => {
		const d = geodesicDistanceMeters(carto(0, 0), carto(0, 1));
		expect(d).toBeGreaterThan(110_000);
		expect(d).toBeLessThan(111_000);
	});

	it('is zero for two identical points', () => {
		expect(geodesicDistanceMeters(carto(12, 34), carto(12, 34))).toBeCloseTo(0, 3);
	});
});

describe('pathLengthMeters', () => {
	it('sums consecutive segments rather than measuring endpoint-to-endpoint', () => {
		const viaWaypoint = pathLengthMeters([carto(0, 0), carto(1, 0), carto(1, 1)]);
		const direct = geodesicDistanceMeters(carto(0, 0), carto(1, 1));
		// The detour through (1,0) must be longer than the direct hop.
		expect(viaWaypoint).toBeGreaterThan(direct);
	});

	it('is 0 for fewer than two points', () => {
		expect(pathLengthMeters([])).toBe(0);
		expect(pathLengthMeters([carto(0, 0)])).toBe(0);
	});
});

describe('polygonAreaSquareMeters', () => {
	it('agrees with a flat-plane approximation for a small square (curvature negligible at this scale)', () => {
		// ~1.1km x 1.1km square near the equator, where lon/lat degrees are
		// both ~111.32km — flat and geodesic area should agree closely.
		const side = 0.01;
		const ring = [carto(0, 0), carto(side, 0), carto(side, side), carto(0, side)];
		const area = polygonAreaSquareMeters(ring);

		const metersPerDegree = 111_319;
		const flatApprox = (side * metersPerDegree) ** 2;
		expect(area).toBeGreaterThan(flatApprox * 0.98);
		expect(area).toBeLessThan(flatApprox * 1.02);
	});

	it('is winding-order independent', () => {
		const side = 0.02;
		const ccw = [carto(10, 10), carto(10 + side, 10), carto(10 + side, 10 + side), carto(10, 10 + side)];
		const cw = [...ccw].reverse();
		expect(polygonAreaSquareMeters(ccw)).toBeCloseTo(polygonAreaSquareMeters(cw), 0);
	});

	it('is 0 for fewer than three points', () => {
		expect(polygonAreaSquareMeters([carto(0, 0), carto(1, 1)])).toBe(0);
	});

	it('still tracks the flat approximation reasonably at a full-degree scale', () => {
		// 1° x 1° box at the equator — curvature effects are still small here
		// (well under 1%), so this is a meaningful cross-check at a scale
		// 100x larger than the tiny-square test above.
		const ring = [carto(0, 0), carto(1, 0), carto(1, 1), carto(0, 1)];
		const area = polygonAreaSquareMeters(ring);
		const flatApprox = 111_319 ** 2;
		expect(area).toBeGreaterThan(flatApprox * 0.98);
		expect(area).toBeLessThan(flatApprox * 1.02);
	});
});

describe('headingDegrees', () => {
	it('is ~90° (due east) for a step along the equator', () => {
		expect(headingDegrees(carto(0, 0), carto(1, 0))).toBeCloseTo(90, 0);
	});
	it('is ~0° (due north) for a step straight up in latitude', () => {
		expect(headingDegrees(carto(0, 0), carto(0, 1))).toBeCloseTo(0, 0);
	});
	it('is ~180° (due south) for a step straight down in latitude', () => {
		expect(headingDegrees(carto(0, 1), carto(0, 0))).toBeCloseTo(180, 0);
	});
	it('is always in [0, 360)', () => {
		const h = headingDegrees(carto(5, 5), carto(-5, -5));
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(360);
	});
});

describe('formatHeading', () => {
	it('shows 2 decimal places with a degree sign', () => {
		expect(formatHeading(91.8598)).toBe('91.86°');
		expect(formatHeading(0)).toBe('0.00°');
	});
});

describe('formatDistance', () => {
	it('shows meters below 1km', () => {
		expect(formatDistance(850)).toBe('850 m');
		expect(formatDistance(4)).toBe('4 m');
	});
	it('shows km with 2 decimals at/above 1km', () => {
		expect(formatDistance(1240)).toBe('1.24 km');
		expect(formatDistance(1000)).toBe('1.00 km');
	});
});

describe('formatArea', () => {
	it('shows m² below 1km²', () => {
		expect(formatArea(850)).toBe('850 m²');
	});
	it('shows km² with 2 decimals at/above 1km²', () => {
		expect(formatArea(2_450_000)).toBe('2.45 km²');
	});
});
