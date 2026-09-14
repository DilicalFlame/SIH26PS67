import type { UiAction } from '$lib/types/ui-action';

/** Shared event channel so chat, clicks, keyboard shortcuts, and future
 *  plugins can all drive the map through one path, per contracts §5.4,
 *  without any of them touching map/GlobeCanvas code directly.
 *
 *  Dispatches are batched to the next animation frame via
 *  requestAnimationFrame rather than delivered instantly — nothing is
 *  dropped (unlike throttle/debounce), rapid-fire dispatches within one
 *  frame are simply grouped and delivered together. requestAnimationFrame
 *  also naturally pauses while the tab is backgrounded, which is a bonus,
 *  not something this file needs to handle itself. */
const subscribers = new Set<(action: UiAction) => void>();
let pendingActions: UiAction[] = [];
let flushScheduled = false;

function flush() {
	const actionsToRun = pendingActions;
	pendingActions = [];
	flushScheduled = false;
	for (const action of actionsToRun) {
		for (const handler of subscribers) {
			handler(action);
		}
	}
}

/** Called by anything that wants to trigger a map action: chat, a click
 *  handler, a keyboard shortcut. Queued, not delivered immediately —
 *  see file-level comment. */
export function dispatchUiAction(action: UiAction): void {
	pendingActions.push(action);
	if (!flushScheduled) {
		flushScheduled = true;
		requestAnimationFrame(flush);
	}
}

/** Called by anything that wants to react to map actions. Returns an
 *  unsubscribe function — call it when no longer needed, to avoid
 *  leaking a reference that outlives the component that created it. */
export function onUiAction(handler: (action: UiAction) => void): () => void {
	subscribers.add(handler);
	return () => subscribers.delete(handler);
}