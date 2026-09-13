<script lang="ts">
	interface Props {
		/** Incremental angle (radians), fired continuously while dragging. */
		onDrag: (deltaRad: number) => void;
		onResetNorth: () => void;
	}
	const { onDrag, onResetNorth }: Props = $props();

	let visible = $state(true);
	export function setVisible(v: boolean): void {
		visible = v;
	}

	let needleEl: HTMLDivElement | undefined = $state();
	export function setHeadingDeg(deg: number): void {
		if (needleEl) needleEl.style.transform = `rotate(${-deg}deg)`;
	}

	let knobEl: HTMLDivElement | undefined = $state();
	let dragging = false;
	let lastAngle = 0;

	function angleAt(clientX: number, clientY: number): number {
		const rect = knobEl!.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		return Math.atan2(clientY - cy, clientX - cx);
	}

	function onPointerDown(e: PointerEvent): void {
		if (!knobEl || e.button !== 0) return;
		dragging = true;
		lastAngle = angleAt(e.clientX, e.clientY);
		knobEl.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent): void {
		if (!dragging) return;
		const angle = angleAt(e.clientX, e.clientY);
		let delta = angle - lastAngle;
		if (delta > Math.PI) delta -= 2 * Math.PI;
		if (delta < -Math.PI) delta += 2 * Math.PI;
		lastAngle = angle;
		onDrag(-delta);
	}

	function onPointerUp(e: PointerEvent): void {
		dragging = false;
		if (knobEl?.hasPointerCapture(e.pointerId)) knobEl.releasePointerCapture(e.pointerId);
	}

	let menuOpen = $state(false);
	let menuX = $state(0);
	let menuY = $state(0);

	function onContextMenu(e: MouseEvent): void {
		e.preventDefault();
		menuX = e.clientX;
		menuY = e.clientY;
		menuOpen = true;
	}

	function onKeyDown(e: KeyboardEvent): void {
		const step = Math.PI / 36;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			onDrag(-step);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			onDrag(step);
		}
	}

	function closeMenu(): void {
		menuOpen = false;
	}

	function resetNorth(): void {
		onResetNorth();
		closeMenu();
	}
</script>

<svelte:window
	onclick={() => { if (menuOpen) closeMenu(); }}
	onkeydown={(e) => { if (menuOpen && e.key === 'Escape') closeMenu(); }}
/>

{#if visible}
	<div
		class="heading-control"
		bind:this={knobEl}
		role="slider"
		aria-label="Heading — drag to rotate, right-click to reset to north"
		aria-valuenow={0}
		tabindex="0"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		oncontextmenu={onContextMenu}
		onkeydown={onKeyDown}
	>
		<div class="needle" bind:this={needleEl}>
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<polygon points="12,2 15.5,12 12,10.5 8.5,12" fill="#ff5a5a" />
				<polygon points="12,22 15.5,12 12,13.5 8.5,12" fill="#d8dde3" />
				<circle cx="12" cy="12" r="1.4" fill="#0d0d0f" />
			</svg>
		</div>
	</div>
{/if}

{#if menuOpen}
	<div class="context-menu" style:left="{menuX}px" style:top="{menuY}px">
		<button type="button" onclick={resetNorth}>Reset to North</button>
	</div>
{/if}

<style>
	.heading-control {
		position: fixed;
		bottom: 3.25rem;
		right: 1.25rem;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
		cursor: grab;
		touch-action: none;
		user-select: none;
		z-index: 10;
	}

	.heading-control:active {
		cursor: grabbing;
	}

	.needle {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		will-change: transform;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8));
	}

	.context-menu {
		position: fixed;
		z-index: 20;
		background: rgba(20, 24, 30, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		padding: 0.25rem;
		font-family: 'Noto Sans', system-ui, sans-serif;
		font-size: 0.8rem;
	}

	.context-menu button {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.35rem;
		color: #fff;
		cursor: pointer;
	}

	.context-menu button:hover {
		background: rgba(255, 255, 255, 0.1);
	}
</style>