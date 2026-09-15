<script lang="ts">
	import { tick } from "svelte";

	export interface ContextMenuItem {
		id: string;
		label: string;
		icon: "info" | "delete" | "compass";
		danger?: boolean;
		onSelect: () => void;
	}

	interface Props {
		/** Where the triggering click happened (clientX/clientY) — the menu
		 *  positions itself relative to this, then clamps/flips to stay on
		 *  screen once its real size is known (see $effect below). */
		x: number;
		y: number;
		items: ContextMenuItem[];
		onClose: () => void;
	}
	const { x, y, items, onClose }: Props = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let left = $state(0);
	let top = $state(0);
	// Rendered off-screen-invisible until positioned, so the unclamped
	// first-frame placement (which can overflow the viewport) is never
	// visible — a menu "knowing where to open" means it never flashes in
	// the wrong spot before correcting itself.
	let ready = $state(false);
	// The right-click that OPENS the menu is (empirically — this was not
	// what the DOM spec's synchronous-bubbling model would suggest, but
	// it's what actually happens here) still able to reach this
	// component's own window-level onclick/oncontextmenu the moment they
	// attach, because Svelte's effect flush can land inside the same
	// dispatch as the triggering event. A tick() (microtask) guard is NOT
	// enough to outrun that. A macrotask (setTimeout 0) is: it only runs
	// after the event loop has fully moved past the current task, i.e.
	// after every last echo of the opening event has been processed.
	let armed = $state(false);

	$effect(() => {
		// Re-run for every fresh open (x/y change on each right-click) —
		// referencing the props here (not just at declaration time) is what
		// makes this effect re-fire when a still-mounted ContextMenu gets
		// reused for a different click.
		left = x;
		top = y;
		ready = false;
		armed = false;
		const armTimer = setTimeout(() => {
			armed = true;
		}, 0);

		tick().then(() => {
			if (!menuEl) return;
			const rect = menuEl.getBoundingClientRect();
			const margin = 8;
			let nx = x;
			let ny = y;
			if (nx + rect.width + margin > window.innerWidth) nx = x - rect.width;
			if (ny + rect.height + margin > window.innerHeight) ny = y - rect.height;
			nx = Math.max(margin, Math.min(nx, window.innerWidth - rect.width - margin));
			ny = Math.max(margin, Math.min(ny, window.innerHeight - rect.height - margin));
			left = nx;
			top = ny;
			ready = true;
		});

		return () => clearTimeout(armTimer);
	});

	function select(item: ContextMenuItem): void {
		item.onSelect();
		onClose();
	}

	function closeIfArmed(): void {
		if (armed) onClose();
	}
</script>

<svelte:window
	onclick={closeIfArmed}
	oncontextmenu={closeIfArmed}
	onkeydown={(e) => {
		if (e.key === "Escape") onClose();
	}}
/>

<div
	class="context-menu"
	class:ready
	bind:this={menuEl}
	style:left="{left}px"
	style:top="{top}px"
	role="menu"
>
	{#each items as item (item.id)}
		<button
			type="button"
			class="menu-item"
			class:danger={item.danger}
			role="menuitem"
			onclick={() => select(item)}
		>
			<span class="menu-icon" aria-hidden="true">
				{#if item.icon === "info"}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M12 11v5M12 8v.01" />
					</svg>
				{:else if item.icon === "delete"}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M4 7h16" />
						<path d="M9 7V4h6v3" />
						<path d="M6 7l1 13h10l1-13" />
					</svg>
				{:else if item.icon === "compass"}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 6.5 14 13l-2-1.2-2 1.2 2-6.5Z" fill="currentColor" stroke="none" />
					</svg>
				{/if}
			</span>
			<span>{item.label}</span>
		</button>
	{/each}
</div>

<style>
	.context-menu {
		position: fixed;
		z-index: 50;
		min-width: 180px;
		background: rgba(20, 20, 25, 0.96);
		backdrop-filter: blur(18px) saturate(160%);
		-webkit-backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		padding: 0.3rem;
		font-family: inherit;
		font-size: 0.82rem;
		opacity: 0;
		transition: opacity 80ms ease;
	}
	.context-menu.ready {
		opacity: 1;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.5rem 0.65rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.9);
		font-family: inherit;
		font-size: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 120ms ease;
	}
	.menu-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.menu-item.danger {
		color: rgba(255, 138, 138, 0.95);
	}
	.menu-item.danger:hover {
		background: rgba(255, 138, 138, 0.16);
	}

	.menu-icon {
		width: 1.15rem;
		height: 1.15rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.menu-icon svg {
		width: 100%;
		height: 100%;
	}
</style>
