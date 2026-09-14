/** 
 * Decimal degrees -> "D° MM' H" (e.g. 24° 15' N or 24° N when minutes are 0). 
 * Rounds to the nearest minute and carries 59.5'+ into the next whole degree so it never prints "24° 60' N".
 */
export function toDMSPart(deg: number, posLabel: string, negLabel: string): string {
    const hemi = deg >= 0 ? posLabel : negLabel;
    const abs = Math.abs(deg);
    let whole = Math.floor(abs);
    let minutes = Math.round((abs - whole) * 60);

    if (minutes === 60) {
        minutes = 0;
        whole += 1;
    }

    // Omit minutes if 0 for cleaner graticule labels (e.g., 24° N instead of 24° 00' N)
    if (minutes === 0) {
        return `${whole}° ${hemi}`;
    }

    return `${whole}° ${String(minutes).padStart(2, '0')}' ${hemi}`;
}

/** Formats latitude values into DMS notation (e.g. 45° N or 12° 30' S) */
export function formatLatDMS(latDeg: number): string {
    return toDMSPart(latDeg, 'N', 'S');
}

/** Formats longitude values into DMS notation (e.g. 90° E or 41° 38' W) */
export function formatLonDMS(lonDeg: number): string {
    const lonNorm = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
    return toDMSPart(lonNorm, 'E', 'W');
}

/** Formats a full lat/lon coordinate pair (e.g. 8° 13' S, 41° 38' W) */
export function formatLatLonDMS(latDeg: number, lonDeg: number): string {
    return `${formatLatDMS(latDeg)}, ${formatLonDMS(lonDeg)}`;
}