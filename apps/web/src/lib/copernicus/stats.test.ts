import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';

describe('computeStats', () => {
	it('returns null when every value is null', () => {
		expect(computeStats([null, null])).toBeNull();
	});

	it('returns null for an empty array', () => {
		expect(computeStats([])).toBeNull();
	});

	it('ignores nulls, computing over the rest', () => {
		const stats = computeStats([1, null, 3, 5, null]);
		expect(stats).toEqual({ min: 1, max: 5, avg: 3, count: 3 });
	});

	it('handles a single value', () => {
		expect(computeStats([7])).toEqual({ min: 7, max: 7, avg: 7, count: 1 });
	});
});
