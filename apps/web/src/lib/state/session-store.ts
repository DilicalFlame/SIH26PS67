/**
 * session-store.ts
 *
 * Persists "what the user was looking at" — camera position, basemap,
 * projection, graticule, which panels were open — to localStorage, so a
 * page refresh restores the previous session instead of resetting to
 * hardcoded defaults. Deliberately NOT persisted: the path/polygon tool's
 * armed/drawing state (restoring "mid-draw" on load would silently put the
 * user in drawing mode) and finished measurement geometry (out of scope for
 * this pass — view/settings state only, not working data).
 *
 * One JSON blob under a single versioned key, read once per component at
 * mount (loadSession) and updated via patchSession/patchSessionDebounced as
 * things change. A module-private `cached` copy is merged into on every
 * patch so independent callers (camera, basemap, projection, layers...)
 * don't clobber each other's fields — safe because every call here runs
 * synchronously to completion on one thread, with no await between reading
 * and writing `cached`.
 */
import { browser } from "$app/environment";

export interface PersistedCameraView {
	/** Degrees. */
	longitude: number;
	/** Degrees. */
	latitude: number;
	/** Meters, ellipsoid height. */
	height: number;
	/** Radians. */
	heading: number;
	/** Radians. */
	pitch: number;
	/** Radians. */
	roll: number;
}

export interface PersistedSession {
	camera?: PersistedCameraView;
	/** Numeric ProjectionType (0 = Sphere, 1 = Equirectangular) — kept as a
	 *  plain number here so this module doesn't need to import the enum. */
	projection?: number;
	basemapId?: string;
	graticuleOn?: boolean;
	layersOpen?: boolean;
}

const STORAGE_KEY = "sih-viewer-session:v1";

function isFiniteCamera(value: unknown): value is PersistedCameraView {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (["longitude", "latitude", "height", "heading", "pitch", "roll"] as const).every(
		(key) => typeof v[key] === "number" && Number.isFinite(v[key]),
	);
}

/** Reads + sanitizes the persisted session. Never throws — a missing key,
 *  corrupt JSON, wrong shape, or a localStorage access error (private
 *  browsing, quota) all just fall back to an empty session, which every
 *  consumer already treats as "use the built-in default". */
export function loadSession(): PersistedSession {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const p = parsed as Record<string, unknown>;

		const session: PersistedSession = {};
		if (typeof p.projection === "number" && (p.projection === 0 || p.projection === 1)) {
			session.projection = p.projection;
		}
		if (typeof p.basemapId === "string") session.basemapId = p.basemapId;
		if (typeof p.graticuleOn === "boolean") session.graticuleOn = p.graticuleOn;
		if (typeof p.layersOpen === "boolean") session.layersOpen = p.layersOpen;
		if (isFiniteCamera(p.camera)) session.camera = p.camera;
		return session;
	} catch (err) {
		console.warn("[session-store] Failed to read persisted session, ignoring:", err);
		return {};
	}
}

let cached: PersistedSession = loadSession();

function write(): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
	} catch (err) {
		console.warn("[session-store] Failed to save session:", err);
	}
}

/** Merges `patch` into the persisted session and writes immediately — for
 *  infrequent changes (basemap pick, graticule toggle, panel open/close). */
export function patchSession(patch: Partial<PersistedSession>): void {
	if (!browser) return;
	cached = { ...cached, ...patch };
	write();
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Same as patchSession, but coalesces rapid-fire calls into one write
 *  `delayMs` after the last call — camera changes fire many times a second
 *  while dragging/zooming, and writing localStorage on every one of them is
 *  wasted work for a value that's only ever read back after a full reload. */
export function patchSessionDebounced(patch: Partial<PersistedSession>, delayMs = 500): void {
	if (!browser) return;
	cached = { ...cached, ...patch };
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(write, delayMs);
}
