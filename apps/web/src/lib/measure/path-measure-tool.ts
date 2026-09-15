/**
 * path-measure-tool.ts
 *
 * Google-Earth-style "add path or polygon" tool: click to place vertices,
 * see a live running distance + heading while it's an open path, click back
 * on the first vertex to close it into a polygon (switches the live readout
 * to area + perimeter — see measure.ts for the geodesic/spherical-excess
 * math). Plain Cesium — no Svelte here — so CesiumCanvas just owns one
 * instance and mirrors its state into the UI via the onUpdate callback, the
 * same shape as switchBasemap()'s relationship to BasemapPicker.
 *
 * The shape being drawn stays "in progress" (editable, not yet added to
 * `finished`) through closing the loop — matching Google Earth's own
 * panel, which keeps showing Length/Heading or Area/Perimeter and only
 * commits the shape when you press Done. That's also why closing the loop
 * and finishing are two separate steps here (setClosed() vs finishCurrent()):
 * closing swaps the live line for a polygon fill so the area reads correctly,
 * but the shape can still be undone back into an open path before Done.
 *
 * Interaction:
 *   - left click            add a vertex; if within CLOSE_LOOP_PIXEL_THRESHOLD
 *                            of the first vertex with >= 3 already placed,
 *                            closes the loop into a polygon instead
 *   - right click / Enter   finish (commit) the current shape as-is
 *   - Backspace              undo — reopens a just-closed loop, or undoes the
 *                            last placed vertex of an open path
 *   - Escape                 cancel the current in-progress shape
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
} from "$lib/geo/measure";
import {
	dispatchSessionAction,
	SessionActionType,
	type PersistedMeasurementRecord,
} from "$lib/state/session-store";

export interface FinishedMeasurement {
	/** Stable, opaque id for backend correlation — from a monotonic counter, never reused. */
	id: string;
	type: "path" | "polygon";
	/** Display name, sequential per type — "Path 1", "Polygon 2", ... */
	label: string;
	/** Primary metric: formatted length (path) or area (polygon). */
	primary: string;
	/** Secondary metric: formatted heading (path) or perimeter (polygon). */
	secondary: string;
	vertexCount: number;
}

export interface MeasureState {
	/** Tool armed — clicks on the globe are being captured for drawing. */
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

// Committed geometry (placed, immovable) — fixed, high-contrast.
const LINE_COLOR = Cesium.Color.fromCssColorString("#ffcc33");
const FILL_COLOR = Cesium.Color.fromCssColorString("#ffcc33").withAlpha(0.25);
// The live rubber-band segment (last placed vertex -> cursor) is not yet a
// placed point, so it reads as a thin, greyed-out line instead — dark rather
// than light so it stays visible against light basemap imagery/ocean too.
const PREVIEW_LINE_COLOR = Cesium.Color.fromCssColorString("#3a3a3a").withAlpha(0.85);

const VERTEX_FILL_COLOR = Cesium.Color.WHITE;
const VERTEX_OUTLINE_COLOR = LINE_COLOR;
const VERTEX_OUTLINE_COLOR_CLOSE = Cesium.Color.fromCssColorString("#33ff77");

// Hover highlight for a finished shape, toggled from the panel's list rows.
const HIGHLIGHT_COLOR = Cesium.Color.WHITE;
const HIGHLIGHT_FILL_COLOR = Cesium.Color.fromCssColorString("#ffcc33").withAlpha(0.45);

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

/** [longitude, latitude] degree pairs — the wire format persisted to
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

	private positions: Cesium.Cartesian3[] = [];
	private previewPosition: Cesium.Cartesian3 | undefined;
	private canClose = false;
	private closed = false;

	private committedEntity?: Cesium.Entity;
	private previewEntity?: Cesium.Entity;
	private polygonEntity?: Cesium.Entity;
	private vertexEntities: Cesium.Entity[] = [];

	// Finished shapes — keyed by id so individual rows in the panel's list
	// can be zoomed to, highlighted, or removed independently. Map preserves
	// insertion order, which is what the list renders in.
	private finished = new Map<string, { meta: FinishedMeasurement; entities: Cesium.Entity[] }>();
	// Monotonic — never reused, even after a mid-list delete (a stable id is
	// the whole point of "identifier to recognize in backend"). Separate
	// per-type counters drive the display label ("Path 1", "Polygon 2").
	private nextMeasurementId = 1;
	private nextPathNumber = 1;
	private nextPolygonNumber = 1;

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

	activate(): void {
		if (this._active) return;
		this._active = true;
		this.viewer.scene.canvas.style.cursor = "crosshair";

		this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
		this.handler.setInputAction(this.onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
		this.handler.setInputAction(this.onMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
		this.handler.setInputAction(this.onRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

		this.keydownListener = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.cancelCurrent();
			else if (e.key === "Enter") this.finishCurrent();
			else if (e.key === "Backspace" || e.key === "Delete") this.undoLastVertex();
		};
		window.addEventListener("keydown", this.keydownListener);

		this.emitState();
	}

	deactivate(): void {
		if (!this._active) return;
		this.cancelCurrent();
		this.handler?.destroy();
		this.handler = undefined;
		if (this.keydownListener) window.removeEventListener("keydown", this.keydownListener);
		this.keydownListener = undefined;
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
		dispatchSessionAction({ type: SessionActionType.MeasurementsCleared });
		this.emitState();
	}

	/** Removes a single finished measurement by id — leaves the rest and their numbering untouched. */
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
		// rows) — not an error worth surfacing.
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
	 * restored one — matters because ids/labels are otherwise only ever
	 * handed out by finishCurrent() in-process. Call once, right after
	 * construction, before the tool is activated.
	 */
	restoreFinished(records: PersistedMeasurementRecord[]): void {
		let maxId = 0;
		let maxPathNumber = 0;
		let maxPolygonNumber = 0;

		for (const record of records) {
			if (record.positions.length < 2) continue; // guards a corrupt/hand-edited blob
			const cartesians = record.positions.map(([lon, lat]) =>
				Cesium.Cartesian3.fromDegrees(lon, lat),
			);
			const cartographics = cartesians.map(toCartographic);

			let entity: Cesium.Entity;
			let primary: string;
			let secondary: string;
			if (record.type === "polygon" && cartesians.length >= 3) {
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
				},
			});

			const idNum = Number(record.id.replace(/^m-/, ""));
			if (Number.isFinite(idNum)) maxId = Math.max(maxId, idNum);
			const labelNum = Number(record.label.replace(/^\D+/, ""));
			if (Number.isFinite(labelNum)) {
				if (record.type === "polygon") maxPolygonNumber = Math.max(maxPolygonNumber, labelNum);
				else maxPathNumber = Math.max(maxPathNumber, labelNum);
			}
		}

		this.nextMeasurementId = Math.max(this.nextMeasurementId, maxId + 1);
		this.nextPathNumber = Math.max(this.nextPathNumber, maxPathNumber + 1);
		this.nextPolygonNumber = Math.max(this.nextPolygonNumber, maxPolygonNumber + 1);
		if (records.length > 0) this.emitState();
	}

	/** Persists a just-finished shape's raw vertices — called from
	 *  finishCurrent() only; restoreFinished() reconstructs from this same
	 *  wire format on the next load. */
	private persistFinished(
		id: string,
		type: "path" | "polygon",
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
		if (this.closed) return; // loop already closed — press Done to commit, or Backspace to reopen

		const pos = this.pickPosition(movement.position);
		if (!pos) return; // clicked off the globe

		if (this.positions.length >= 3 && this.canClose) {
			this.setClosed();
			return;
		}

		this.addVertex(pos);
	};

	private onMouseMove = (movement: Cesium.ScreenSpaceEventHandler.MotionEvent): void => {
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
		this.finishCurrent();
	};

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

	/** Committed (placed, immovable) segments — solid, high-contrast. */
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

	/** The live rubber-band segment (last placed vertex -> cursor) — thin, greyed-out. */
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

	/** Swaps the open-path preview for a polygon fill — the loop is closed but not yet committed. */
	private setClosed(): void {
		this.closed = true;
		this.canClose = false;
		this.styleFirstVertex(false);
		this.removeCommittedEntities();
		this.polygonEntity = this.dataSource.entities.add({
			polygon: {
				// CallbackProperty-backed hierarchy must itself return a
				// PolygonHierarchy, not a raw array — unlike polyline.positions,
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
				// can't render an outline — Cesium silently drops it with a
				// console warning. This app has no real terrain
				// (EllipsoidTerrainProvider), so pinning to the ellipsoid
				// surface at height 0 costs nothing and gets the outline back.
				height: 0,
			},
		});
		this.emitState();
	}

	/** Undoes setClosed() — back to an open, editable path. */
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
		this.emitState();
	}

	/** Commits whatever exists — open path or closed polygon — into `finished`. */
	finishCurrent(): void {
		if (!this.closed && this.positions.length < 2) {
			this.cancelCurrent();
			return;
		}

		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);
		this.vertexEntities = [];

		const id = `m-${this.nextMeasurementId++}`;

		if (this.closed) {
			const label = `Polygon ${this.nextPolygonNumber++}`;
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
				// Just the identifier on the map — full metrics live in the
				// panel's list now, so showing both would just duplicate text
				// floating over the shape.
				label: this.labelOptions(label),
				position: this.centroid(),
			});
			this.finished.set(id, {
				entities: [polygon],
				meta: {
					id,
					type: "polygon",
					label,
					primary: formatArea(area),
					secondary: formatDistance(perimeter),
					vertexCount: this.positions.length,
				},
			});
			this.persistFinished(id, "polygon", label, this.positions);
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
					: "—";

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
