/**
 * path-measure-tool.ts
 *
 * Google-Earth-style "add path or polygon" tool: click to place vertices,
 * see a live running distance + heading while it's an open path, click back
 * on the first vertex to close it into a polygon (switches the live readout
 * to area + perimeter - see measure.ts for the geodesic/spherical-excess
 * math). Plain Cesium - no Svelte here - so CesiumCanvas just owns one
 * instance and mirrors its state into the UI via the onUpdate callback, the
 * same shape as switchBasemap()'s relationship to BasemapPicker.
 *
 * The shape being drawn stays "in progress" (editable, not yet added to
 * `finished`) through closing the loop - matching Google Earth's own
 * panel, which keeps showing Length/Heading or Area/Perimeter and only
 * commits the shape when you press Done. That's also why closing the loop
 * and finishing are two separate steps here (setClosed() vs finishCurrent()):
 * closing swaps the live line for a polygon fill so the area reads correctly,
 * but the shape can still be undone back into an open path before Done.
 *
 * Interaction (mode "path", the default - see ShapeMode below):
 *   - left click            add a vertex; if within CLOSE_LOOP_PIXEL_THRESHOLD
 *                            of the first vertex with >= 3 already placed,
 *                            closes the loop into a polygon instead
 *   - right click / Enter   finish (commit) the current shape as-is
 *   - Backspace              undo - reopens a just-closed loop, or undoes the
 *                            last placed vertex of an open path
 *   - Escape                 cancel the current in-progress shape
 *
 * Modes "rectangle" and "ellipse" (set via setMode(), from Toolbar's shape
 * dropdown) are a different interaction entirely - press-drag-release, like
 * every other map-drawing tool's rectangle/ellipse tool - rather than
 * click-click-click: left-down anchors a corner (rectangle) or center
 * (ellipse), mouse-move live-updates the shape from anchor to cursor, and
 * left-up commits it. Holding Shift while dragging constrains the shape to a
 * square/circle (checked live on every mouse-move, so toggling Shift
 * mid-drag updates the preview immediately). Both modes reuse the exact
 * "closed shape" machinery path/polygon mode already has (`this.closed`,
 * `this.positions`, the CallbackProperty-backed polygonEntity, finishCurrent's
 * closed branch) - a rectangle/ellipse is just a polygon ring computed from
 * the drag instead of from click-placed vertices, so nothing downstream
 * (area/perimeter math, persistence, restore, the finished-shapes list) needs
 * to know the difference.
 *
 * Finished shapes stay on the map (with a permanent label) until clearAll()
 * or the tool instance is destroyed; only the shape actively being drawn is
 * discarded by cancel/deactivate.
 */
import * as Cesium from "cesium";
import {
	pathLengthMeters,
	polygonAreaSquareMeters,
	headingDegrees,
	formatDistance,
	formatArea,
	formatHeading,
	geodesicDistanceMeters,
	EARTH_RADIUS_M,
} from "$lib/geo/measure";
import {
	dispatchSessionAction,
	SessionActionType,
	type PersistedMeasurementRecord,
} from "$lib/state/session-store";

/** The shape tool's selected drawing mode - see the header comment for how
 *  "rectangle"/"ellipse" differ from "path"'s click-to-place interaction.
 *  Not the same as FinishedMeasurement.type below: drawing in "path" mode
 *  can still finish as either a "path" (open) or "polygon" (closed loop). */
export type ShapeMode = "path" | "rectangle" | "ellipse";

export interface FinishedMeasurement {
	/** Stable, opaque id for backend correlation - from a monotonic counter, never reused. */
	id: string;
	type: "path" | "polygon" | "rectangle" | "ellipse";
	/** Display name, sequential per type - "Path 1", "Polygon 2", ... */
	label: string;
	/** Primary metric: formatted length (path) or area (polygon). */
	primary: string;
	/** Secondary metric: formatted heading (path) or perimeter (polygon). */
	secondary: string;
	vertexCount: number;
	/** [longitude, latitude] degree pairs, open ring (first point is not
	 *  repeated at the end) - same shape as PersistedMeasurementRecord.positions
	 *  in session-store.ts. Added for the "Data layers" picker's polygon
	 *  area-of-interest filter (see DataLayersCatalog.svelte), which needs
	 *  real geometry to compute a bounding box from; nothing else in this
	 *  module previously needed to expose coordinates past persistFinished(). */
	positions: [number, number][];
}

export interface MeasureState {
	/** Tool armed - clicks on the globe are being captured for drawing. */
	active: boolean;
	/** At least one vertex placed in the shape currently being drawn. */
	drawing: boolean;
	vertexCount: number;
	/** True once hovering close enough to the first vertex to close the loop. */
	canClose: boolean;
	/** True once the loop has been closed into a polygon (still in progress, not yet committed). */
	closed: boolean;
	/** Formatted running length of the open path (live, includes the segment to the cursor). */
	length: string;
	/** Formatted forward heading of the last segment of the open path. */
	heading: string;
	/** Formatted area, once closed. */
	area: string;
	/** Formatted perimeter, once closed. */
	perimeter: string;
	/** Completed shapes still on the map, in the order they were created. */
	finished: FinishedMeasurement[];
}

const CLOSE_LOOP_PIXEL_THRESHOLD = 14;

// Committed geometry (placed, immovable) - fixed, high-contrast.
const LINE_COLOR = Cesium.Color.fromCssColorString("#ffcc33");
const FILL_COLOR = Cesium.Color.fromCssColorString("#ffcc33").withAlpha(0.25);
// The live rubber-band segment (last placed vertex -> cursor) is not yet a
// placed point, so it reads as a thin, greyed-out line instead - dark rather
// than light so it stays visible against light basemap imagery/ocean too.
const PREVIEW_LINE_COLOR = Cesium.Color.fromCssColorString("#3a3a3a").withAlpha(0.85);

const VERTEX_FILL_COLOR = Cesium.Color.WHITE;
const VERTEX_OUTLINE_COLOR = LINE_COLOR;
const VERTEX_OUTLINE_COLOR_CLOSE = Cesium.Color.fromCssColorString("#33ff77");

// Hover highlight for a finished shape, toggled from the panel's list rows.
const HIGHLIGHT_COLOR = Cesium.Color.WHITE;
const HIGHLIGHT_FILL_COLOR = Cesium.Color.fromCssColorString("#ffcc33").withAlpha(0.45);

/** Display-label prefix per closed-shape type - "Polygon 2", "Rectangle 1",
 *  "Ellipse 3", ... (see finishCurrent()'s closed branch / nextNumberFor()). */
const SHAPE_LABEL: Record<"polygon" | "rectangle" | "ellipse", string> = {
	polygon: "Polygon",
	rectangle: "Rectangle",
	ellipse: "Ellipse",
};

function toCartographic(p: Cesium.Cartesian3): Cesium.Cartographic {
	return Cesium.Cartographic.fromCartesian(p);
}

function centroidOf(points: Cesium.Cartesian3[]): Cesium.Cartesian3 {
	const sum = points.reduce(
		(acc, p) => Cesium.Cartesian3.add(acc, p, acc),
		new Cesium.Cartesian3(0, 0, 0),
	);
	return Cesium.Cartesian3.divideByScalar(sum, points.length, sum);
}

/** [longitude, latitude] degree pairs - the wire format persisted to
 *  localStorage (see session-store.ts's PersistedMeasurementRecord). */
function toLonLatPairs(points: Cesium.Cartesian3[]): [number, number][] {
	return points.map((p) => {
		const c = toCartographic(p);
		return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)];
	});
}

export class PathMeasureTool {
	private viewer: Cesium.Viewer;
	private onUpdate: (state: MeasureState) => void;
	private dataSource: Cesium.CustomDataSource;

	private handler?: Cesium.ScreenSpaceEventHandler;
	private keydownListener?: (e: KeyboardEvent) => void;
	private keyupListener?: (e: KeyboardEvent) => void;

	// Which shape the tool currently draws - see ShapeMode's doc comment.
	// Persists across activate/deactivate (picking "Rectangle" from the
	// dropdown then toggling the tool off and back on should still draw
	// rectangles), only ever changed by setMode().
	private mode: ShapeMode = "path";
	// Set from Shift keydown/keyup while a rectangle/ellipse mode is active -
	// checked live on every drag mouse-move (see rectangleRing/ellipseRing),
	// so holding/releasing Shift mid-drag updates the preview immediately.
	private shiftHeld = false;
	// The drag's start corner (rectangle) or center (ellipse) - set on
	// left-down, read on every subsequent move, cleared on left-up/cancel.
	// `undefined` doubles as "not currently dragging".
	private dragAnchor: Cesium.Cartographic | undefined;
	// The camera controller's own enableInputs value from just before a
	// rectangle/ellipse drag disabled it (see onLeftDown/restoreCameraInputs)
	// - `undefined` doubles as "no drag in progress to restore after".
	private cameraInputsEnabled: boolean | undefined;

	private positions: Cesium.Cartesian3[] = [];
	private previewPosition: Cesium.Cartesian3 | undefined;
	private canClose = false;
	private closed = false;

	private committedEntity?: Cesium.Entity;
	private previewEntity?: Cesium.Entity;
	private polygonEntity?: Cesium.Entity;
	private vertexEntities: Cesium.Entity[] = [];

	// Finished shapes - keyed by id so individual rows in the panel's list
	// can be zoomed to, highlighted, or removed independently. Map preserves
	// insertion order, which is what the list renders in.
	private finished = new Map<string, { meta: FinishedMeasurement; entities: Cesium.Entity[] }>();
	// Monotonic - never reused, even after a mid-list delete (a stable id is
	// the whole point of "identifier to recognize in backend"). Separate
	// per-type counters drive the display label ("Path 1", "Polygon 2", ...).
	private nextMeasurementId = 1;
	private nextPathNumber = 1;
	private nextPolygonNumber = 1;
	private nextRectangleNumber = 1;
	private nextEllipseNumber = 1;

	private _active = false;

	constructor(viewer: Cesium.Viewer, onUpdate: (state: MeasureState) => void) {
		this.viewer = viewer;
		this.onUpdate = onUpdate;
		this.dataSource = new Cesium.CustomDataSource("measurements");
		// Isolated from viewer.entities so a future placemark/data layer that
		// adds its own entities directly can't be swept up by clearAll().
		void this.viewer.dataSources.add(this.dataSource);
	}

	get active(): boolean {
		return this._active;
	}

	get shapeMode(): ShapeMode {
		return this.mode;
	}

	/** Switches which shape left-drag/click draws - see ShapeMode's doc
	 *  comment. Discards whatever's mid-draw first (switching tools mid-shape
	 *  has no sensible "continue" behavior), but leaves finished shapes and
	 *  active/inactive state untouched - picking a new shape from the
	 *  dropdown while the tool is already active should let you start
	 *  drawing it immediately, not require toggling the tool off and on. */
	setMode(mode: ShapeMode): void {
		if (this.mode === mode) return;
		this.cancelCurrent();
		this.mode = mode;
	}

	activate(): void {
		if (this._active) return;
		this._active = true;
		this.viewer.scene.canvas.style.cursor = "crosshair";

		this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
		this.handler.setInputAction(this.onLeftDown, Cesium.ScreenSpaceEventType.LEFT_DOWN);
		this.handler.setInputAction(this.onLeftUp, Cesium.ScreenSpaceEventType.LEFT_UP);
		this.handler.setInputAction(this.onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
		this.handler.setInputAction(this.onMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
		this.handler.setInputAction(this.onRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
		// Cesium's ScreenSpaceEventHandler dispatches by (type, currently-held
		// modifier) pair - an action registered with no modifier (above) is
		// ONLY invoked while no modifier key is down. Without also
		// registering the SHIFT variant below, holding Shift mid-drag (the
		// whole point of rectangle/ellipse's square/circle constraint) would
		// silently stop delivering LEFT_DOWN/MOUSE_MOVE/LEFT_UP the instant
		// Shift goes down, freezing the drag until it's released. Both
		// variants call the exact same handlers - this tool's own
		// `shiftHeld` (tracked via plain window keydown/keyup, see below)
		// is what actually reads the modifier, not Cesium's dispatch.
		this.handler.setInputAction(
			this.onLeftDown,
			Cesium.ScreenSpaceEventType.LEFT_DOWN,
			Cesium.KeyboardEventModifier.SHIFT,
		);
		this.handler.setInputAction(
			this.onLeftUp,
			Cesium.ScreenSpaceEventType.LEFT_UP,
			Cesium.KeyboardEventModifier.SHIFT,
		);
		this.handler.setInputAction(
			this.onMouseMove,
			Cesium.ScreenSpaceEventType.MOUSE_MOVE,
			Cesium.KeyboardEventModifier.SHIFT,
		);

		this.keydownListener = (e: KeyboardEvent) => {
			if (e.key === "Shift") this.shiftHeld = true;
			else if (e.key === "Escape") this.cancelCurrent();
			// Enter/Backspace only mean something for path mode's
			// click-placed vertices - a rectangle/ellipse drag has no
			// per-vertex undo and commits on mouse-up, not Enter.
			else if (this.mode === "path" && e.key === "Enter") this.finishCurrent();
			else if (this.mode === "path" && (e.key === "Backspace" || e.key === "Delete")) {
				this.undoLastVertex();
			}
		};
		window.addEventListener("keydown", this.keydownListener);
		this.keyupListener = (e: KeyboardEvent) => {
			if (e.key === "Shift") this.shiftHeld = false;
		};
		window.addEventListener("keyup", this.keyupListener);

		this.emitState();
	}

	deactivate(): void {
		if (!this._active) return;
		this.cancelCurrent();
		this.handler?.destroy();
		this.handler = undefined;
		if (this.keydownListener) window.removeEventListener("keydown", this.keydownListener);
		this.keydownListener = undefined;
		if (this.keyupListener) window.removeEventListener("keyup", this.keyupListener);
		this.keyupListener = undefined;
		this.shiftHeld = false;
		this.viewer.scene.canvas.style.cursor = "";
		this._active = false;
		this.emitState();
	}

	toggle(): void {
		if (this._active) this.deactivate();
		else this.activate();
	}

	/** Removes every finished shape (not just the in-progress one) and resets numbering. */
	clearAll(): void {
		this.cancelCurrent();
		this.dataSource.entities.removeAll();
		this.finished.clear();
		this.nextMeasurementId = 1;
		this.nextPathNumber = 1;
		this.nextPolygonNumber = 1;
		this.nextRectangleNumber = 1;
		this.nextEllipseNumber = 1;
		dispatchSessionAction({ type: SessionActionType.MeasurementsCleared });
		this.emitState();
	}

	/** Removes a single finished measurement by id - leaves the rest and their numbering untouched. */
	removeMeasurement(id: string): void {
		const record = this.finished.get(id);
		if (!record) return;
		for (const e of record.entities) this.dataSource.entities.remove(e);
		this.finished.delete(id);
		dispatchSessionAction({ type: SessionActionType.MeasurementRemoved, payload: id });
		this.emitState();
	}

	/** Flies the camera to frame a single finished measurement. */
	flyToMeasurement(id: string): void {
		const record = this.finished.get(id);
		if (!record) return;
		// Rejects if interrupted by another flight (e.g. rapid clicks across
		// rows) - not an error worth surfacing.
		void this.viewer.flyTo(record.entities).catch(() => {});
	}

	/** Toggled on hover over a list row, so the map shape lights up to match. */
	setMeasurementHighlighted(id: string, highlighted: boolean): void {
		const record = this.finished.get(id);
		if (!record) return;
		for (const e of record.entities) {
			if (e.polyline) {
				e.polyline.material = new Cesium.ColorMaterialProperty(
					highlighted ? HIGHLIGHT_COLOR : LINE_COLOR,
				);
				e.polyline.width = new Cesium.ConstantProperty(highlighted ? 7 : 5);
			}
			if (e.polygon) {
				e.polygon.outlineColor = new Cesium.ConstantProperty(
					highlighted ? HIGHLIGHT_COLOR : LINE_COLOR,
				);
				e.polygon.material = new Cesium.ColorMaterialProperty(
					highlighted ? HIGHLIGHT_FILL_COLOR : FILL_COLOR,
				);
			}
		}
	}

	/**
	 * Rebuilds finished shapes from persisted records (session restore).
	 * Recomputes geometry/metrics from the raw positions rather than
	 * trusting anything precomputed, and advances the id/label counters past
	 * whatever's restored so a newly drawn shape can never collide with a
	 * restored one - matters because ids/labels are otherwise only ever
	 * handed out by finishCurrent() in-process. Call once, right after
	 * construction, before the tool is activated.
	 */
	restoreFinished(records: PersistedMeasurementRecord[]): void {
		let maxId = 0;
		let maxPathNumber = 0;
		let maxPolygonNumber = 0;
		let maxRectangleNumber = 0;
		let maxEllipseNumber = 0;

		for (const record of records) {
			if (record.positions.length < 2) continue; // guards a corrupt/hand-edited blob
			const cartesians = record.positions.map(([lon, lat]) =>
				Cesium.Cartesian3.fromDegrees(lon, lat),
			);
			const cartographics = cartesians.map(toCartographic);

			let entity: Cesium.Entity;
			let primary: string;
			let secondary: string;
			// Rectangle/ellipse are stored as plain closed rings, same as a
			// hand-drawn polygon (see finishCurrent()'s closed branch) - any
			// non-"path" type restores through this same polygon branch.
			if (record.type !== "path" && cartesians.length >= 3) {
				const area = polygonAreaSquareMeters(cartographics);
				const perimeter = pathLengthMeters([...cartographics, cartographics[0]]);
				entity = this.dataSource.entities.add({
					polygon: {
						hierarchy: cartesians,
						material: FILL_COLOR,
						outline: true,
						outlineColor: LINE_COLOR,
						height: 0,
					},
					label: this.labelOptions(record.label),
					position: centroidOf(cartesians),
				});
				primary = formatArea(area);
				secondary = formatDistance(perimeter);
			} else {
				const distance = pathLengthMeters(cartographics);
				const heading = formatHeading(
					headingDegrees(
						cartographics[cartographics.length - 2],
						cartographics[cartographics.length - 1],
					),
				);
				entity = this.dataSource.entities.add({
					polyline: {
						positions: cartesians,
						width: 5,
						material: LINE_COLOR,
						clampToGround: false,
					},
					label: this.labelOptions(record.label),
					position: centroidOf(cartesians),
				});
				primary = formatDistance(distance);
				secondary = heading;
			}

			this.finished.set(record.id, {
				entities: [entity],
				meta: {
					id: record.id,
					type: record.type,
					label: record.label,
					primary,
					secondary,
					vertexCount: cartesians.length,
					positions: record.positions,
				},
			});

			const idNum = Number(record.id.replace(/^m-/, ""));
			if (Number.isFinite(idNum)) maxId = Math.max(maxId, idNum);
			const labelNum = Number(record.label.replace(/^\D+/, ""));
			if (Number.isFinite(labelNum)) {
				if (record.type === "polygon") maxPolygonNumber = Math.max(maxPolygonNumber, labelNum);
				else if (record.type === "rectangle") maxRectangleNumber = Math.max(maxRectangleNumber, labelNum);
				else if (record.type === "ellipse") maxEllipseNumber = Math.max(maxEllipseNumber, labelNum);
				else maxPathNumber = Math.max(maxPathNumber, labelNum);
			}
		}

		this.nextMeasurementId = Math.max(this.nextMeasurementId, maxId + 1);
		this.nextPathNumber = Math.max(this.nextPathNumber, maxPathNumber + 1);
		this.nextPolygonNumber = Math.max(this.nextPolygonNumber, maxPolygonNumber + 1);
		this.nextRectangleNumber = Math.max(this.nextRectangleNumber, maxRectangleNumber + 1);
		this.nextEllipseNumber = Math.max(this.nextEllipseNumber, maxEllipseNumber + 1);
		if (records.length > 0) this.emitState();
	}

	/** Persists a just-finished shape's raw vertices - called from
	 *  finishCurrent() only; restoreFinished() reconstructs from this same
	 *  wire format on the next load. */
	private persistFinished(
		id: string,
		type: "path" | "polygon" | "rectangle" | "ellipse",
		label: string,
		positions: Cesium.Cartesian3[],
	): void {
		const record: PersistedMeasurementRecord = {
			id,
			type,
			label,
			positions: toLonLatPairs(positions),
		};
		dispatchSessionAction({ type: SessionActionType.MeasurementAdded, payload: record });
	}

	destroy(): void {
		this.deactivate();
		this.viewer.dataSources.remove(this.dataSource, true);
	}

	// =========================================================================
	// Picking
	// =========================================================================
	private pickPosition(windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
		return this.viewer.camera.pickEllipsoid(windowPosition, this.viewer.scene.globe.ellipsoid);
	}

	private screenDistanceToFirstVertex(windowPosition: Cesium.Cartesian2): number | undefined {
		if (this.positions.length === 0) return undefined;
		const firstScreen = Cesium.SceneTransforms.worldToWindowCoordinates(
			this.viewer.scene,
			this.positions[0],
		);
		if (!firstScreen) return undefined;
		return Cesium.Cartesian2.distance(firstScreen, windowPosition);
	}

	// =========================================================================
	// Input handlers
	// =========================================================================
	private onLeftClick = (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent): void => {
		if (this.mode !== "path") return; // rectangle/ellipse draw via down/move/up instead - see below

		if (this.closed) return; // loop already closed - press Done to commit, or Backspace to reopen

		const pos = this.pickPosition(movement.position);
		if (!pos) return; // clicked off the globe

		if (this.positions.length >= 3 && this.canClose) {
			this.setClosed();
			return;
		}

		this.addVertex(pos);
	};

	private onMouseMove = (movement: Cesium.ScreenSpaceEventHandler.MotionEvent): void => {
		if (this.mode !== "path") {
			if (!this.dragAnchor) return; // not currently dragging
			const pos = this.pickPosition(movement.endPosition);
			if (!pos) return;
			const current = toCartographic(pos);
			this.positions =
				this.mode === "rectangle"
					? this.rectangleRing(this.dragAnchor, current)
					: this.ellipseRing(this.dragAnchor, current);
			this.emitState();
			return;
		}

		if (this.closed) return; // no rubber-band once the loop is closed

		if (this.positions.length === 0) {
			this.canClose = false;
			return;
		}
		const pos = this.pickPosition(movement.endPosition);
		this.previewPosition = pos;

		const d = this.screenDistanceToFirstVertex(movement.endPosition);
		const nowClose = this.positions.length >= 3 && d !== undefined && d <= CLOSE_LOOP_PIXEL_THRESHOLD;
		if (nowClose !== this.canClose) {
			this.canClose = nowClose;
			this.styleFirstVertex(nowClose);
		}
		this.emitState();
	};

	private onRightClick = (): void => {
		if (this.mode === "path") this.finishCurrent();
	};

	private onLeftDown = (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent): void => {
		if (this.mode === "path") return;
		const pos = this.pickPosition(movement.position);
		if (!pos) return; // pressed down off the globe

		// Cesium's own screenSpaceCameraController listens to the exact same
		// raw left-drag this tool needs for rectangle/ellipse - left
		// enabled, the globe rotates under the cursor for the whole drag,
		// so every subsequent pickPosition() lands on a different point of
		// a MOVING globe instead of the same fixed one the shape is meant
		// to be drawn against (visible as wildly distorted geometry, worse
		// the more the camera happened to rotate). Disabled for the
		// duration of the drag, restored in onLeftUp/cancelCurrent - the
		// click-based path mode never hits this since a plain click has no
		// meaningful drag distance for the camera controller to react to.
		this.cameraInputsEnabled = this.viewer.scene.screenSpaceCameraController.enableInputs;
		this.viewer.scene.screenSpaceCameraController.enableInputs = false;

		this.dragAnchor = toCartographic(pos);
		// Reuses the same "closed shape" rendering/state machinery path mode's
		// setClosed() uses - see this.createPolygonEntity()'s doc comment.
		this.closed = true;
		this.polygonEntity = this.createPolygonEntity();
		this.positions = [pos]; // degenerate single point until the first move
		this.emitState();
	};

	private onLeftUp = (): void => {
		if (this.mode === "path" || !this.dragAnchor) return;
		this.restoreCameraInputs();
		this.dragAnchor = undefined;
		// A down+up with no real drag (a plain click) never got past the
		// degenerate single-point ring onLeftDown seeds - nothing worth
		// keeping, so this is a cancel, not a 0-area finished shape.
		if (this.positions.length < 3) {
			this.cancelCurrent();
			return;
		}
		this.finishCurrent();
	};

	/** Undoes onLeftDown's screenSpaceCameraController.enableInputs = false -
	 *  called from both a normal onLeftUp commit and cancelCurrent(), so an
	 *  Escape or a mid-drag deactivate() can never leave camera control
	 *  stuck disabled. Guarded by `cameraInputsEnabled` being set (only true
	 *  while a rectangle/ellipse drag is actually in progress) so calling it
	 *  when there was nothing to restore - cancelCurrent() runs on every
	 *  activate()/deactivate() even with no drag underway - is a no-op. */
	private restoreCameraInputs(): void {
		if (this.cameraInputsEnabled === undefined) return;
		this.viewer.scene.screenSpaceCameraController.enableInputs = this.cameraInputsEnabled;
		this.cameraInputsEnabled = undefined;
	}

	// =========================================================================
	// Drawing state machine
	// =========================================================================
	private styleFirstVertex(close: boolean): void {
		const first = this.vertexEntities[0];
		if (!first?.point) return;
		first.point.outlineColor = new Cesium.ConstantProperty(
			close ? VERTEX_OUTLINE_COLOR_CLOSE : VERTEX_OUTLINE_COLOR,
		);
		first.point.pixelSize = new Cesium.ConstantProperty(close ? 16 : 13);
	}

	/** Committed (placed, immovable) segments - solid, high-contrast. */
	private ensureCommittedEntity(): void {
		if (this.committedEntity) return;
		this.committedEntity = this.dataSource.entities.add({
			polyline: {
				positions: new Cesium.CallbackProperty(() => [...this.positions], false),
				width: 5,
				material: LINE_COLOR,
				clampToGround: false,
			},
		});
	}

	/** The live rubber-band segment (last placed vertex -> cursor) - thin, greyed-out. */
	private ensurePreviewEntity(): void {
		if (this.previewEntity) return;
		this.previewEntity = this.dataSource.entities.add({
			polyline: {
				positions: new Cesium.CallbackProperty(() => {
					if (this.closed || !this.previewPosition || this.positions.length === 0) return [];
					const last = this.positions[this.positions.length - 1];
					return [last, this.previewPosition];
				}, false),
				width: 2,
				material: PREVIEW_LINE_COLOR,
				clampToGround: false,
			},
		});
	}

	private removeCommittedEntities(): void {
		if (this.committedEntity) {
			this.dataSource.entities.remove(this.committedEntity);
			this.committedEntity = undefined;
		}
		if (this.previewEntity) {
			this.dataSource.entities.remove(this.previewEntity);
			this.previewEntity = undefined;
		}
	}

	private addVertex(pos: Cesium.Cartesian3): void {
		this.positions.push(pos);
		this.ensureCommittedEntity();
		this.ensurePreviewEntity();
		this.vertexEntities.push(
			this.dataSource.entities.add({
				position: pos,
				point: {
					pixelSize: 13,
					color: VERTEX_FILL_COLOR,
					outlineColor: VERTEX_OUTLINE_COLOR,
					outlineWidth: 3,
					disableDepthTestDistance: Number.POSITIVE_INFINITY,
				},
			}),
		);
		this.emitState();
	}

	/** A polygon entity whose hierarchy tracks `this.positions` live via
	 *  CallbackProperty - shared by path mode's setClosed() (loop just
	 *  closed, still editable) and rectangle/ellipse mode's onLeftDown
	 *  (drag just started) - both are "a closed ring that keeps changing
	 *  until the user commits it", just fed by different input. */
	private createPolygonEntity(): Cesium.Entity {
		return this.dataSource.entities.add({
			polygon: {
				// CallbackProperty-backed hierarchy must itself return a
				// PolygonHierarchy, not a raw array - unlike polyline.positions,
				// Cesium doesn't auto-wrap it on each dynamic re-evaluation, and
				// passing a plain array crashes PolygonGeometry.createGeometry.
				hierarchy: new Cesium.CallbackProperty(
					() => new Cesium.PolygonHierarchy([...this.positions]),
					false,
				),
				material: FILL_COLOR,
				outline: true,
				outlineColor: LINE_COLOR,
				// Ground-clamped polygons (the default, with no explicit height)
				// can't render an outline - Cesium silently drops it with a
				// console warning. This app has no real terrain
				// (EllipsoidTerrainProvider), so pinning to the ellipsoid
				// surface at height 0 costs nothing and gets the outline back.
				height: 0,
			},
		});
	}

	/** Swaps the open-path preview for a polygon fill - the loop is closed but not yet committed. */
	private setClosed(): void {
		this.closed = true;
		this.canClose = false;
		this.styleFirstVertex(false);
		this.removeCommittedEntities();
		this.polygonEntity = this.createPolygonEntity();
		this.emitState();
	}

	/** Undoes setClosed() - back to an open, editable path. */
	private reopen(): void {
		this.closed = false;
		if (this.polygonEntity) {
			this.dataSource.entities.remove(this.polygonEntity);
			this.polygonEntity = undefined;
		}
		this.ensureCommittedEntity();
		this.ensurePreviewEntity();
	}

	undoLastVertex(): void {
		// No per-vertex undo for a rectangle/ellipse drag - the closed-ring
		// reuse of `this.closed` would otherwise make this call reopen(),
		// which tears down the drag's polygon entity and leaves onMouseMove
		// updating `this.positions` with nothing rendering it.
		if (this.mode !== "path") return;
		if (this.closed) {
			this.reopen();
			this.emitState();
			return;
		}
		if (this.positions.length === 0) return;
		this.positions.pop();
		const last = this.vertexEntities.pop();
		if (last) this.dataSource.entities.remove(last);
		if (this.positions.length === 0) {
			this.canClose = false;
			this.removeCommittedEntities();
		}
		this.emitState();
	}

	/** Discards the shape currently being drawn (if any); finished shapes are untouched. */
	cancelCurrent(): void {
		this.removeCommittedEntities();
		if (this.polygonEntity) {
			this.dataSource.entities.remove(this.polygonEntity);
			this.polygonEntity = undefined;
		}
		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);
		this.vertexEntities = [];
		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
		this.closed = false;
		this.dragAnchor = undefined;
		this.restoreCameraInputs();
		this.emitState();
	}

	// =========================================================================
	// Rectangle/ellipse geometry - both build a Cartesian3 ring from the drag
	// anchor + current cursor, in a local flat-earth approximation around the
	// anchor (accurate enough for anything this tool draws; the same
	// approximation every simple map-drawing rectangle/ellipse tool makes).
	// Shift (this.shiftHeld) constrains to a square/circle, checked live so
	// toggling it mid-drag updates the preview immediately.
	// =========================================================================

	/** Meters-per-radian for longitude at `lat` - shrinks toward the poles
	 *  (a degree of longitude covers less real distance there); clamped away
	 *  from exactly 0 so a drag started at/near a pole can't divide by zero. */
	private static metersPerRadianLon(lat: number): number {
		return EARTH_RADIUS_M * Math.max(Math.cos(lat), 0.01);
	}

	private rectangleRing(anchor: Cesium.Cartographic, current: Cesium.Cartographic): Cesium.Cartesian3[] {
		let lonB = current.longitude;
		let latB = current.latitude;

		if (this.shiftHeld) {
			// Square: match the east-west span (in real meters, at the
			// anchor's latitude) to the already-dragged north-south span,
			// preserving the cursor's current side (sign) on each axis.
			const nsMeters = Math.abs(latB - anchor.latitude) * EARTH_RADIUS_M;
			const lonSign = Math.sign(lonB - anchor.longitude) || 1;
			lonB = anchor.longitude + (lonSign * nsMeters) / PathMeasureTool.metersPerRadianLon(anchor.latitude);
		}

		const lonA = anchor.longitude;
		const latA = anchor.latitude;
		return [
			Cesium.Cartesian3.fromRadians(lonA, latA),
			Cesium.Cartesian3.fromRadians(lonB, latA),
			Cesium.Cartesian3.fromRadians(lonB, latB),
			Cesium.Cartesian3.fromRadians(lonA, latB),
		];
	}

	private static readonly ELLIPSE_SEGMENTS = 64;

	private ellipseRing(center: Cesium.Cartographic, current: Cesium.Cartographic): Cesium.Cartesian3[] {
		const metersPerRadLon = PathMeasureTool.metersPerRadianLon(center.latitude);

		let semiMajor: number;
		let semiMinor: number;
		let rotation: number; // radians, from north, matching Cesium's EllipseGraphics convention
		if (this.shiftHeld) {
			// Circle: radius is the straight geodesic distance to the cursor.
			const radius = geodesicDistanceMeters(center, current);
			semiMajor = radius;
			semiMinor = radius;
			rotation = 0;
		} else {
			const ewMeters = Math.abs(current.longitude - center.longitude) * metersPerRadLon;
			const nsMeters = Math.abs(current.latitude - center.latitude) * EARTH_RADIUS_M;
			// EllipseGraphics/geometry requires semiMajorAxis >= semiMinorAxis -
			// when the drag is taller than it is wide, the real major axis
			// points north-south instead of east-west, so swap in a 90°
			// rotation to keep the ellipse's actual shape (not just its
			// bounding box) matching the drag.
			if (ewMeters >= nsMeters) {
				semiMajor = ewMeters;
				semiMinor = nsMeters;
				rotation = 0;
			} else {
				semiMajor = nsMeters;
				semiMinor = ewMeters;
				rotation = Math.PI / 2;
			}
		}
		// Degenerate (zero-size) axes would otherwise crash the geometry
		// below on the very first move right after left-down.
		semiMajor = Math.max(semiMajor, 1);
		semiMinor = Math.max(semiMinor, 1);

		const cosR = Math.cos(rotation);
		const sinR = Math.sin(rotation);
		const points: Cesium.Cartesian3[] = [];
		for (let i = 0; i < PathMeasureTool.ELLIPSE_SEGMENTS; i++) {
			const t = (i / PathMeasureTool.ELLIPSE_SEGMENTS) * 2 * Math.PI;
			const x = semiMajor * Math.cos(t);
			const y = semiMinor * Math.sin(t);
			// Rotate the local (east, north) offset, then convert meters to a
			// lon/lat delta at the center - the same flat-earth approximation
			// rectangleRing uses.
			const east = x * cosR - y * sinR;
			const north = x * sinR + y * cosR;
			points.push(
				Cesium.Cartesian3.fromRadians(
					center.longitude + east / metersPerRadLon,
					center.latitude + north / EARTH_RADIUS_M,
				),
			);
		}
		return points;
	}

	/** Commits whatever exists - open path or closed polygon - into `finished`. */
	finishCurrent(): void {
		if (!this.closed && this.positions.length < 2) {
			this.cancelCurrent();
			return;
		}

		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);
		this.vertexEntities = [];

		const id = `m-${this.nextMeasurementId++}`;
		const lonLatPositions = toLonLatPairs(this.positions);

		if (this.closed) {
			// Path mode's own closed loop finishes as "polygon"; a
			// rectangle/ellipse drag finishes as its own mode's type -
			// geometrically identical (a closed ring), just a different
			// label/icon/counter so the finished-shapes list can tell them
			// apart.
			const shapeType: "polygon" | "rectangle" | "ellipse" =
				this.mode === "rectangle" ? "rectangle" : this.mode === "ellipse" ? "ellipse" : "polygon";
			const label = `${SHAPE_LABEL[shapeType]} ${this.nextNumberFor(shapeType)}`;
			const cartographics = this.positions.map(toCartographic);
			const area = polygonAreaSquareMeters(cartographics);
			const perimeter = pathLengthMeters([...cartographics, cartographics[0]]);

			if (this.polygonEntity) this.dataSource.entities.remove(this.polygonEntity);
			this.polygonEntity = undefined;

			const polygon = this.dataSource.entities.add({
				polygon: {
					hierarchy: [...this.positions],
					material: FILL_COLOR,
					outline: true,
					outlineColor: LINE_COLOR,
					height: 0,
				},
				// Just the identifier on the map - full metrics live in the
				// panel's list now, so showing both would just duplicate text
				// floating over the shape.
				label: this.labelOptions(label),
				position: this.centroid(),
			});
			this.finished.set(id, {
				entities: [polygon],
				meta: {
					id,
					type: shapeType,
					label,
					primary: formatArea(area),
					secondary: formatDistance(perimeter),
					vertexCount: this.positions.length,
					positions: lonLatPositions,
				},
			});
			this.persistFinished(id, shapeType, label, this.positions);
		} else {
			const label = `Path ${this.nextPathNumber++}`;
			const cartographics = this.positions.map(toCartographic);
			const distance = pathLengthMeters(cartographics);
			const heading =
				cartographics.length >= 2
					? formatHeading(
							headingDegrees(
								cartographics[cartographics.length - 2],
								cartographics[cartographics.length - 1],
							),
						)
					: "-";

			this.removeCommittedEntities();

			const line = this.dataSource.entities.add({
				polyline: {
					positions: [...this.positions],
					width: 5,
					material: LINE_COLOR,
					clampToGround: false,
				},
				label: this.labelOptions(label),
				position: this.centroid(),
			});
			this.finished.set(id, {
				entities: [line],
				meta: {
					id,
					type: "path",
					label,
					primary: formatDistance(distance),
					secondary: heading,
					vertexCount: this.positions.length,
					positions: lonLatPositions,
				},
			});
			this.persistFinished(id, "path", label, this.positions);
		}

		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
		this.closed = false;
		this.emitState();
	}

	private centroid(): Cesium.Cartesian3 {
		return centroidOf(this.positions);
	}

	/** Returns the next display number for a closed-shape type and advances
	 *  that type's own counter - one independent sequence per type, same as
	 *  the pre-existing nextPathNumber/nextPolygonNumber. */
	private nextNumberFor(type: "polygon" | "rectangle" | "ellipse"): number {
		if (type === "rectangle") return this.nextRectangleNumber++;
		if (type === "ellipse") return this.nextEllipseNumber++;
		return this.nextPolygonNumber++;
	}

	private labelOptions(text: string): Cesium.LabelGraphics.ConstructorOptions {
		return {
			text,
			font: "600 13px sans-serif",
			style: Cesium.LabelStyle.FILL_AND_OUTLINE,
			fillColor: Cesium.Color.WHITE,
			outlineColor: Cesium.Color.BLACK,
			outlineWidth: 3,
			showBackground: true,
			backgroundColor: Cesium.Color.fromCssColorString("#14141980"),
			backgroundPadding: new Cesium.Cartesian2(6, 4),
			pixelOffset: new Cesium.Cartesian2(0, -12),
			verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
			disableDepthTestDistance: Number.POSITIVE_INFINITY,
		};
	}

	// =========================================================================
	// State readout
	// =========================================================================
	private emitState(): void {
		const drawing = this.positions.length > 0;
		let length = "";
		let heading = "";
		let area = "";
		let perimeter = "";

		if (this.closed) {
			const cartographics = this.positions.map(toCartographic);
			area = formatArea(polygonAreaSquareMeters(cartographics));
			perimeter = formatDistance(pathLengthMeters([...cartographics, cartographics[0]]));
		} else if (drawing) {
			const pts = [...this.positions];
			if (this.previewPosition) pts.push(this.previewPosition);
			length = formatDistance(pathLengthMeters(pts.map(toCartographic)));
			if (pts.length >= 2) {
				const a = toCartographic(pts[pts.length - 2]);
				const b = toCartographic(pts[pts.length - 1]);
				heading = formatHeading(headingDegrees(a, b));
			}
		}

		this.onUpdate({
			active: this._active,
			drawing,
			vertexCount: this.positions.length,
			canClose: this.canClose,
			closed: this.closed,
			length,
			heading,
			area,
			perimeter,
			finished: Array.from(this.finished.values(), (r) => r.meta),
		});
	}
}
