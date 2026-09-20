/** Shared numeric formatting for a sampled/scaled physical measurement -
 *  used by the colorbar's hover readout and the active-layers panel's
 *  per-point hover value, so a given number always reads identically
 *  wherever it's shown. Decimal count scales down as magnitude grows so a
 *  wave-height reading ("1.234 m") and an oxygen reading ("245 mmol m-3")
 *  each get a sensible number of significant digits instead of a fixed
 *  precision that's noisy for one and useless for the other. */
export function formatMeasurement(value: number): string {
	const abs = Math.abs(value);
	const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
	return value.toFixed(decimals);
}
