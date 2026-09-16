/**
 * session-store.ts
 *
 * Persists "what the user was looking at" — camera position, basemap,
 * projection, graticule, which panels were open, finished measurements —
 * to localStorage, so a page refresh restores the previous session instead
 * of resetting to hardcoded defaults. Deliberately NOT persisted: the
 * path/polygon tool's armed/drawing state (restoring "mid-draw" on load
 * would silently put the user in drawing mode).
 *
 * Every write goes through dispatchSessionAction() with a typed
 * SessionAction — never a raw partial patch — so the debounce policy for a
 * given kind of change (immediate for a discrete click, debounced for
 * something that fires many times a second like the camera) is declared
 * once, centrally, in ACTION_DEBOUNCE_MS below, instead of being decided
 * ad hoc at each call site (which is how the previous version of this file
 * silently dropped camera writes — see CesiumCanvas's scheduleSaveCamera
 * comment for the actual failure mode that forced this rewrite).
 *
 * A module-private `cached` copy is merged into on every dispatch so
 * independent callers (camera, basemap, measurements...) don't clobber each
 * other's fields — safe because every call here runs synchronously to
 * completion on one thread, with no await between reading and writing
 * `cached`.
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

/** Wire format for a finished path/polygon — raw vertices only, so restore
 *  recomputes area/perimeter/heading/distance from the same measure.ts
 *  functions used live instead of trusting stale formatted strings. */
export interface PersistedMeasurementRecord {
	id: string;
	type: "path" | "polygon";
	label: string;
	/** [longitude, latitude] pairs, degrees, in the order they were placed. */
	positions: [number, number][];
}

/** Wire format for one active data layer — layer id (from the frontend
 *  data-layers-catalog registry, not any backend catalog) plus its
 *  user-controlled visibility. Array order is stack order, bottom to top,
 *  matching DataLayerManager's own `layers` array. No opacity field: every
 *  layer renders at its catalog defaultOpacity (now always 1) and there's
 *  no UI to change it per-layer, so there's nothing to persist. */
export interface PersistedActiveLayer {
	id: string;
	visible: boolean;
}

export interface PersistedSession {
	camera?: PersistedCameraView;
	/** Numeric ProjectionType (0 = Sphere, 1 = Equirectangular) — kept as a
	 *  plain number here so this module doesn't need to import the enum. */
	projection?: number;
	basemapId?: string;
	graticuleOn?: boolean;
	layersOpen?: boolean;
	measurements?: PersistedMeasurementRecord[];
	layers?: PersistedActiveLayer[];
	activeLayersPanelCollapsed?: boolean;
	/** ISO 8601 — the shared time-slider position applied to every active
	 *  layer that supports one (see DataLayerManager.setGlobalTime). */
	layerTimeIso?: string;
}

export enum SessionActionType {
	CameraChanged = "CAMERA_CHANGED",
	BasemapChanged = "BASEMAP_CHANGED",
	ProjectionChanged = "PROJECTION_CHANGED",
	GraticuleToggled = "GRATICULE_TOGGLED",
	LayersPanelToggled = "LAYERS_PANEL_TOGGLED",
	MeasurementAdded = "MEASUREMENT_ADDED",
	MeasurementRemoved = "MEASUREMENT_REMOVED",
	MeasurementsCleared = "MEASUREMENTS_CLEARED",
	LayersChanged = "LAYERS_CHANGED",
	ActiveLayersPanelCollapsed = "ACTIVE_LAYERS_PANEL_COLLAPSED",
	LayerTimeChanged = "LAYER_TIME_CHANGED",
}

export type SessionAction =
	| { type: SessionActionType.CameraChanged; payload: PersistedCameraView }
	| { type: SessionActionType.BasemapChanged; payload: string }
	| { type: SessionActionType.ProjectionChanged; payload: number }
	| { type: SessionActionType.GraticuleToggled; payload: boolean }
	| { type: SessionActionType.LayersPanelToggled; payload: boolean }
	| { type: SessionActionType.MeasurementAdded; payload: PersistedMeasurementRecord }
	| { type: SessionActionType.MeasurementRemoved; payload: string }
	| { type: SessionActionType.MeasurementsCleared }
	| { type: SessionActionType.LayersChanged; payload: PersistedActiveLayer[] }
	| { type: SessionActionType.ActiveLayersPanelCollapsed; payload: boolean }
	| { type: SessionActionType.LayerTimeChanged; payload: string };

/** Debounce delay per action type, in ms — absent/0 means "write immediately".
 *  Only CameraChanged is high-frequency (fires continuously while
 *  panning/zooming); everything else is a discrete, infrequent click, so
 *  there's no reason to delay it. */
const ACTION_DEBOUNCE_MS: Partial<Record<SessionActionType, number>> = {
	[SessionActionType.CameraChanged]: 500,
};

const STORAGE_KEY = "sih-viewer-session:v1";

function isFiniteCamera(value: unknown): value is PersistedCameraView {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (["longitude", "latitude", "height", "heading", "pitch", "roll"] as const).every(
		(key) => typeof v[key] === "number" && Number.isFinite(v[key]),
	);
}

function isFiniteLonLat(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number" &&
		Number.isFinite(value[0]) &&
		Number.isFinite(value[1])
	);
}

function isValidMeasurementRecord(value: unknown): value is PersistedMeasurementRecord {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		(v.type === "path" || v.type === "polygon") &&
		typeof v.label === "string" &&
		Array.isArray(v.positions) &&
		v.positions.length >= 2 &&
		v.positions.every(isFiniteLonLat)
	);
}

function isValidActiveLayer(value: unknown): value is PersistedActiveLayer {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === "string" && typeof v.visible === "boolean";
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
		if (Array.isArray(p.measurements)) {
			session.measurements = p.measurements.filter(isValidMeasurementRecord);
		}
		if (Array.isArray(p.layers)) {
			session.layers = p.layers.filter(isValidActiveLayer);
		}
		if (typeof p.activeLayersPanelCollapsed === "boolean") {
			session.activeLayersPanelCollapsed = p.activeLayersPanelCollapsed;
		}
		if (typeof p.layerTimeIso === "string") session.layerTimeIso = p.layerTimeIso;
		return session;
	} catch (err) {
		console.warn("[session-store] Failed to read persisted session, ignoring:", err);
		return {};
	}
}

let cached: PersistedSession = loadSession();

/** Test-only: re-syncs the in-memory cache from localStorage (or clears it,
 *  if localStorage was cleared first). Production code never calls this —
 *  `cached` is meant to persist for the page's whole lifetime — but without
 *  it, tests that clear localStorage in beforeEach still see state leak
 *  across cases via this module-private variable, since it's a singleton
 *  for the life of the test file, not per-test. */
export function __resetSessionCacheForTests(): void {
	cached = loadSession();
}

function write(): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
	} catch (err) {
		console.warn("[session-store] Failed to save session:", err);
	}
}

function applyAction(session: PersistedSession, action: SessionAction): PersistedSession {
	switch (action.type) {
		case SessionActionType.CameraChanged:
			return { ...session, camera: action.payload };
		case SessionActionType.BasemapChanged:
			return { ...session, basemapId: action.payload };
		case SessionActionType.ProjectionChanged:
			return { ...session, projection: action.payload };
		case SessionActionType.GraticuleToggled:
			return { ...session, graticuleOn: action.payload };
		case SessionActionType.LayersPanelToggled:
			return { ...session, layersOpen: action.payload };
		case SessionActionType.MeasurementAdded:
			return { ...session, measurements: [...(session.measurements ?? []), action.payload] };
		case SessionActionType.MeasurementRemoved:
			return {
				...session,
				measurements: (session.measurements ?? []).filter((m) => m.id !== action.payload),
			};
		case SessionActionType.MeasurementsCleared:
			return { ...session, measurements: [] };
		case SessionActionType.LayersChanged:
			return { ...session, layers: action.payload };
		case SessionActionType.ActiveLayersPanelCollapsed:
			return { ...session, activeLayersPanelCollapsed: action.payload };
		case SessionActionType.LayerTimeChanged:
			return { ...session, layerTimeIso: action.payload };
	}
}

const debounceTimers = new Map<SessionActionType, ReturnType<typeof setTimeout>>();

/** The one entry point for persisting a change. Merges `action` into the
 *  in-memory session immediately (so a later, differently-typed dispatch —
 *  e.g. toggling the graticule right after panning the camera — flushes the
 *  latest value of both, not a stale one) and writes to localStorage either
 *  right away or after ACTION_DEBOUNCE_MS[action.type], per action type. */
export function dispatchSessionAction(action: SessionAction): void {
	if (!browser) return;
	cached = applyAction(cached, action);

	const delay = ACTION_DEBOUNCE_MS[action.type];
	const pending = debounceTimers.get(action.type);
	if (pending) {
		clearTimeout(pending);
		debounceTimers.delete(action.type);
	}

	if (!delay) {
		write();
		return;
	}
	debounceTimers.set(
		action.type,
		setTimeout(() => {
			debounceTimers.delete(action.type);
			write();
		}, delay),
	);
}
