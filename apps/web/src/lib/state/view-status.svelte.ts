/** Low-frequency (~15fps) camera-derived readout, written once per animate()
 *  tick from GlobeCanvas and read reactively by StatusBar. Module-level
 *  $state is appropriate here: it's only ever written from the browser
 *  render loop, and there is exactly one GlobeCanvas instance in the app. */
export const viewStatus = $state({
	altitudeKm: 0,
	scaleBarLabel: '',
	scaleBarWidthPx: 0,
});
