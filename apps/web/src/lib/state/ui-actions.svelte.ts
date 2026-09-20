import type { UiAction } from '$lib/types/ui-action';

/** Shared event channel so chat, clicks, keyboard shortcuts, and future
 *  plugins can all drive the map through one path, per contracts §5.4,
 *  without any of them touching map/GlobeCanvas code directly.
 *
 *  Dispatches are batched to the next animation frame via
 *  requestAnimationFrame rather than delivered instantly - nothing is
 *  dropped (unlike throttle/debounce), rapid-fire dispatches within one
 *  frame are simply grouped and delivered together. requestAnimationFrame
 *  also naturally pauses while the tab is backgrounded, which is a bonus,
 *  not something this file needs to handle itself. */
const subscribers = new Set<(action: UiAction) => void>();
let pendingActions: UiAction[] = [];
let flushScheduled = false;

/** UiAction's `type` literals, mirrored here so dispatchUiAction can warn on
 *  an unrecognized one instead of trusting the static type - real dispatches
 *  can originate as JSON from the chat/agent tool boundary (contracts §4.7),
 *  which isn't guaranteed to match at runtime the way the type system
 *  promises. Keep in sync with ui-action.ts, whose own comment requires
 *  updating the contracts doc before a fourth variant is added anyway. */
const KNOWN_ACTION_TYPES = new Set<string>(['set_map_layer', 'fly_to', 'open_profile']);

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
 *  handler, a keyboard shortcut. Queued, not delivered immediately - see
 *  file-level comment. An action whose `type` isn't recognized warns and is
 *  dropped here rather than reaching subscribers or throwing. */
export function dispatchUiAction(action: UiAction): void {
	const type = (action as { type?: unknown } | null | undefined)?.type;
	if (typeof type !== 'string' || !KNOWN_ACTION_TYPES.has(type)) {
		console.warn('[ui-actions] dropping action with unrecognized type:', action);
		return;
	}
	pendingActions.push(action);
	if (!flushScheduled) {
		flushScheduled = true;
		requestAnimationFrame(flush);
	}
}

/** Called by anything that wants to react to map actions. Returns an
 *  unsubscribe function - call it when no longer needed, to avoid
 *  leaking a reference that outlives the component that created it. */
export function onUiAction(handler: (action: UiAction) => void): () => void {
	subscribers.add(handler);
	return () => subscribers.delete(handler);
}
