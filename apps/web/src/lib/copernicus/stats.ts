/** Min/max/mean over whatever non-null samples a chart currently has —
 *  each analysis-page chart computes its own (over what it's actually
 *  displaying), rather than one page-level panel blending three different
 *  sample sets together. */
export interface SampleStats {
	min: number;
	max: number;
	avg: number;
	count: number;
}

export function computeStats(values: (number | null)[]): SampleStats | null {
	const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
	if (finite.length === 0) return null;
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	for (const v of finite) {
		if (v < min) min = v;
		if (v > max) max = v;
		sum += v;
	}
	return { min, max, avg: sum / finite.length, count: finite.length };
}
