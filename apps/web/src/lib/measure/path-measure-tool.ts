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
 * finishedShapes) through closing the loop — matching Google Earth's own
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
	/** Number of completed (finished) shapes still on the map. */
	finishedCount: number;
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

function toCartographic(p: Cesium.Cartesian3): Cesium.Cartographic {
	return Cesium.Cartographic.fromCartesian(p);
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
	private finishedShapes: Cesium.Entity[] = [];

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

	/** Removes every finished shape (not just the in-progress one). */
	clearAll(): void {
		this.cancelCurrent();
		this.dataSource.entities.removeAll();
		this.finishedShapes = [];
		this.emitState();
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

	/** Commits whatever exists — open path or closed polygon — into finishedShapes. */
	finishCurrent(): void {
		if (!this.closed && this.positions.length < 2) {
			this.cancelCurrent();
			return;
		}

		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);
		this.vertexEntities = [];

		if (this.closed) {
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
				label: this.labelOptions(
					`Area: ${formatArea(area)}\nPerimeter: ${formatDistance(perimeter)}`,
				),
				position: this.centroid(),
			});
			this.finishedShapes.push(polygon);
		} else {
			const cartographics = this.positions.map(toCartographic);
			const distance = pathLengthMeters(cartographics);

			this.removeCommittedEntities();

			const line = this.dataSource.entities.add({
				polyline: {
					positions: [...this.positions],
					width: 5,
					material: LINE_COLOR,
					clampToGround: false,
				},
				label: this.labelOptions(`Distance: ${formatDistance(distance)}`),
				position: this.centroid(),
			});
			this.finishedShapes.push(line);
		}

		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
		this.closed = false;
		this.emitState();
	}

	private centroid(): Cesium.Cartesian3 {
		const sum = this.positions.reduce(
			(acc, p) => Cesium.Cartesian3.add(acc, p, acc),
			new Cesium.Cartesian3(0, 0, 0),
		);
		return Cesium.Cartesian3.divideByScalar(sum, this.positions.length, sum);
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
			finishedCount: this.finishedShapes.length,
		});
	}
}
