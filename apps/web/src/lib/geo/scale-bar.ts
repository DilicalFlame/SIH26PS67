const NICE_KM = [
	0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
	20000,
];

/** Picks a "nice" round distance whose on-screen bar fits between minPx and
 *  maxPx, and returns both the value and its display label. */
export function pickNiceScale(
	kmPerPx: number,
	maxPx: number,
	minPx: number
): { km: number; label: string } {
	let chosen = NICE_KM[0];
	for (const km of NICE_KM) {
		if (km / kmPerPx > maxPx) break;
		chosen = km;
	}
	// If the largest value that fits is still a stubby bar, step up one
	// notch so it reads clearly rather than showing an under-minPx sliver.
	if (chosen / kmPerPx < minPx) {
		const i = NICE_KM.indexOf(chosen);
		if (i < NICE_KM.length - 1) chosen = NICE_KM[i + 1];
	}
	const label = chosen < 1 ? `${Math.round(chosen * 1000)} m` : `${chosen} km`;
	return { km: chosen, label };
}
