<script lang="ts">
	/**
	 * TimeSlider.svelte
	 *
	 * Reusable date slider + play/pause, used both on the analysis page and
	 * (main-page.svelte, see ActiveLayersPanel) the globe itself. Two modes:
	 *  - Continuous (timeStart/timeEnd/timeStepSeconds): a step count derived
	 *    from a fixed-length period, so every reachable position is a value
	 *    the underlying WMTS layer actually has data for.
	 *  - Discrete (values): a genuinely non-uniform set of declared times
	 *    (e.g. a monthly climatology, which isn't a fixed second count -
	 *    calendar months vary in length) - steps directly through that list
	 *    instead of computing a position arithmetically. See
	 *    DataLayerCatalogEntry.timeValues's doc comment for why this exists.
	 *  Exactly one of the two should be passed; if `values` is non-empty it
	 *  takes precedence.
	 *
	 * Commits on release (`change`), not on every drag tick (`input`) - a
	 * date change invalidates every cached grid downstream (see
	 * copernicus-feature-info.ts's callers), so firing it continuously while
	 * dragging would multiply the request budget for no benefit; the local
	 * `draftIndex` still updates live so the label tracks the drag smoothly.
	 * Play mode advances one committed step at a time on an interval, giving
	 * each step's fetches a real window to resolve before the next fires.
	 */
	interface Props {
		timeStart?: string;
		timeEnd?: string;
		timeStepSeconds?: number;
		values?: string[];
		value: string;
		onChange: (isoDate: string) => void;
	}
	const { timeStart, timeEnd, timeStepSeconds, values, value, onChange }: Props = $props();

	const discreteValues = $derived(values && values.length > 0 ? values : null);
	const startMs = $derived(timeStart ? new Date(timeStart).getTime() : 0);
	const endMs = $derived(timeEnd ? new Date(timeEnd).getTime() : 0);
	const stepMs = $derived((timeStepSeconds ?? 0) * 1000);
	const stepCount = $derived(
		discreteValues ? discreteValues.length - 1 : Math.max(1, Math.round((endMs - startMs) / stepMs)),
	);

	function isoToIndex(iso: string): number {
		const ms = new Date(iso).getTime();
		// Defensive: an unparseable `value` (a blank/corrupt string slipping
		// through) must never propagate a NaN into draftIndex - that would
		// make `label`'s new Date(...).toISOString() throw synchronously.
		if (Number.isNaN(ms)) return 0;
		if (discreteValues) {
			let bestIndex = 0;
			let bestDiff = Infinity;
			discreteValues.forEach((candidate, i) => {
				const diff = Math.abs(new Date(candidate).getTime() - ms);
				if (diff < bestDiff) {
					bestDiff = diff;
					bestIndex = i;
				}
			});
			return bestIndex;
		}
		return Math.min(stepCount, Math.max(0, Math.round((ms - startMs) / stepMs)));
	}
	function indexToIso(index: number): string {
		if (discreteValues) return discreteValues[Math.min(index, discreteValues.length - 1)];
		// Copernicus's WMTS matches TIME against its declared range as an
		// exact string in places - verified live that the millisecond-bearing
		// form of the exact lower bound (`…00.000Z`) is rejected as "out of
		// range" while the same instant without milliseconds (`…00Z`, the
		// format GetCapabilities itself declares bounds in) succeeds. Match
		// that canonical format rather than JS's default toISOString().
		return new Date(startMs + index * stepMs).toISOString().replace(/\.\d{3}Z$/, "Z");
	}

	let draftIndex = $state(0);
	// Keep the draft in sync when `value` changes from outside (e.g. session
	// restore) without fighting an in-progress drag.
	$effect(() => {
		draftIndex = isoToIndex(value);
	});

	let playing = $state(false);
	let playTimer: ReturnType<typeof setInterval> | undefined;

	function commit(index: number): void {
		draftIndex = index;
		onChange(indexToIso(index));
	}

	function togglePlay(): void {
		playing = !playing;
		if (playing) {
			playTimer = setInterval(() => {
				const next = draftIndex >= stepCount ? 0 : draftIndex + 1;
				commit(next);
			}, 1200);
		} else {
			clearInterval(playTimer);
		}
	}

	$effect(() => () => clearInterval(playTimer));

	const label = $derived(indexToIso(draftIndex).slice(0, 10));
</script>

<div class="time-slider">
	<button type="button" class="play-btn" onclick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
		{#if playing}
			<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<rect x="6" y="5" width="4" height="14" />
				<rect x="14" y="5" width="4" height="14" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M7 5v14l12-7Z" />
			</svg>
		{/if}
	</button>
	<input
		type="range"
		min="0"
		max={stepCount}
		value={draftIndex}
		oninput={(e) => (draftIndex = parseInt(e.currentTarget.value, 10))}
		onchange={(e) => commit(parseInt(e.currentTarget.value, 10))}
		aria-label="Time"
	/>
	<span class="date-label">{label}</span>
</div>

<style>
	.time-slider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.play-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.85);
		cursor: pointer;
	}
	.play-btn:hover {
		background: rgba(255, 255, 255, 0.16);
	}
	.play-btn svg {
		width: 0.85rem;
		height: 0.85rem;
	}

	.time-slider input[type="range"] {
		flex: 1;
		min-width: 0;
		height: 4px;
		appearance: none;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}
	.time-slider input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		background: #ffffff;
		border-radius: 50%;
	}

	.date-label {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.7);
		min-width: 5.5rem;
		text-align: right;
	}
</style>
