/** Decimal degrees -> "D° MM' H" (e.g. 24° 15' N). Rounds to the nearest
 *  minute and carries 59.5'+ into the next whole degree so it never prints
 *  "24° 60' N". */
function toDMSPart(deg: number, posLabel: string, negLabel: string): string {
	const hemi = deg >= 0 ? posLabel : negLabel;
	const abs = Math.abs(deg);
	let whole = Math.floor(abs);
	let minutes = Math.round((abs - whole) * 60);
	if (minutes === 60) {
		minutes = 0;
		whole += 1;
	}
	return `${whole}° ${String(minutes).padStart(2, '0')}' ${hemi}`;
}

export function formatLatLonDMS(latDeg: number, lonDeg: number): string {
	// Normalize longitude to (-180, 180] in case flat-mode unprojection
	// (endless east-west wrap) returns an out-of-range value.
	const lonNorm = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
	return `${toDMSPart(latDeg, 'N', 'S')}, ${toDMSPart(lonNorm, 'E', 'W')}`;
}
