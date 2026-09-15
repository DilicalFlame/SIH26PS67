/**
 * path-measure-tool.ts
 *
 * Google-Earth-style "add path or polygon" tool: click to place vertices,
 * see a live running distance while it's an open path, click back on the
 * first vertex to close it into a polygon (switches the live readout to
 * area — see measure.ts for the geodesic/spherical-excess math). Plain
 * Cesium — no Svelte here — so CesiumCanvas just owns one instance and
 * mirrors its state into the UI via the onUpdate callback, the same shape
 * as switchBasemap()'s relationship to BasemapPicker.
 *
 * Interaction:
 *   - left click            add a vertex (or close the loop, if within
 *                            CLOSE_LOOP_PIXEL_THRESHOLD of the first vertex
 *                            with >= 3 already placed)
 *   - right click / Enter   finish the current path as-is (open, not closed)
 *   - Backspace              undo the last placed vertex
 *   - Escape                 cancel the current in-progress shape
 * Finished shapes stay on the map (with a permanent label) until clearAll()
 * or the tool instance is destroyed; only the shape actively being drawn is
 * discarded by cancel/deactivate.
 */
import * as Cesium from "cesium";
import {
	pathLengthMeters,
	polygonAreaSquareMeters,
	formatDistance,
	formatArea,
} from "$lib/geo/measure";

export interface MeasureState {
	/** Tool armed — clicks on the globe are being captured for drawing. */
	active: boolean;
	/** At least one vertex placed in the shape currently being drawn. */
	drawing: boolean;
	vertexCount: number;
	/** True once hovering close enough to the first vertex to close the loop. */
	canClose: boolean;
	/** Live "Distance: 1.24 km" / "Area: 2.4 km²" readout for the shape in progress. */
	liveLabel: string;
	/** Number of completed (finished) shapes still on the map. */
	finishedCount: number;
}

const CLOSE_LOOP_PIXEL_THRESHOLD = 14;
const LINE_COLOR = Cesium.Color.fromCssColorString("#ffcc33");
const FILL_COLOR = Cesium.Color.fromCssColorString("#ffcc33").withAlpha(0.25);
const VERTEX_COLOR = Cesium.Color.fromCssColorString("#ffcc33");
const VERTEX_COLOR_CLOSE = Cesium.Color.fromCssColorString("#33ff77");

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

	private previewEntity?: Cesium.Entity;
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
		const pos = this.pickPosition(movement.position);
		if (!pos) return; // clicked off the globe

		if (this.positions.length >= 3 && this.canClose) {
			this.closeAsPolygon();
			return;
		}

		this.addVertex(pos);
	};

	private onMouseMove = (movement: Cesium.ScreenSpaceEventHandler.MotionEvent): void => {
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
			const first = this.vertexEntities[0];
			if (first?.point) {
				first.point.color = new Cesium.ConstantProperty(
					nowClose ? VERTEX_COLOR_CLOSE : VERTEX_COLOR,
				);
				first.point.pixelSize = new Cesium.ConstantProperty(nowClose ? 12 : 8);
			}
		}
		this.emitState();
	};

	private onRightClick = (): void => {
		this.finishCurrent();
	};

	// =========================================================================
	// Drawing state machine
	// =========================================================================
	private ensurePreviewEntity(): void {
		if (this.previewEntity) return;
		this.previewEntity = this.dataSource.entities.add({
			polyline: {
				positions: new Cesium.CallbackProperty(() => {
					const pts = [...this.positions];
					if (this.previewPosition) pts.push(this.previewPosition);
					return pts;
				}, false),
				width: 3,
				material: LINE_COLOR,
				clampToGround: false,
			},
		});
	}

	private addVertex(pos: Cesium.Cartesian3): void {
		this.positions.push(pos);
		this.ensurePreviewEntity();
		this.vertexEntities.push(
			this.dataSource.entities.add({
				position: pos,
				point: {
					pixelSize: 8,
					color: VERTEX_COLOR,
					outlineColor: Cesium.Color.BLACK,
					outlineWidth: 1,
					disableDepthTestDistance: Number.POSITIVE_INFINITY,
				},
			}),
		);
		this.emitState();
	}

	undoLastVertex(): void {
		if (this.positions.length === 0) return;
		this.positions.pop();
		const last = this.vertexEntities.pop();
		if (last) this.dataSource.entities.remove(last);
		if (this.positions.length === 0) {
			this.canClose = false;
			if (this.previewEntity) {
				this.dataSource.entities.remove(this.previewEntity);
				this.previewEntity = undefined;
			}
		}
		this.emitState();
	}

	/** Discards the shape currently being drawn (if any); finished shapes are untouched. */
	cancelCurrent(): void {
		if (this.previewEntity) {
			this.dataSource.entities.remove(this.previewEntity);
			this.previewEntity = undefined;
		}
		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);
		this.vertexEntities = [];
		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
		this.emitState();
	}

	finishCurrent(): void {
		if (this.positions.length < 2) {
			this.cancelCurrent();
			return;
		}
		const cartographics = this.positions.map(toCartographic);
		const distance = pathLengthMeters(cartographics);

		if (this.previewEntity) this.dataSource.entities.remove(this.previewEntity);
		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);

		const line = this.dataSource.entities.add({
			polyline: {
				positions: [...this.positions],
				width: 3,
				material: LINE_COLOR,
				clampToGround: false,
			},
			label: this.labelOptions(`Distance: ${formatDistance(distance)}`),
			position: this.centroid(),
		});
		this.finishedShapes.push(line);

		this.previewEntity = undefined;
		this.vertexEntities = [];
		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
		this.emitState();
	}

	private closeAsPolygon(): void {
		const cartographics = this.positions.map(toCartographic);
		const area = polygonAreaSquareMeters(cartographics);
		const perimeter = pathLengthMeters([...cartographics, cartographics[0]]);

		if (this.previewEntity) this.dataSource.entities.remove(this.previewEntity);
		for (const e of this.vertexEntities) this.dataSource.entities.remove(e);

		const polygon = this.dataSource.entities.add({
			polygon: {
				hierarchy: [...this.positions],
				material: FILL_COLOR,
				outline: true,
				outlineColor: LINE_COLOR,
				// Ground-clamped polygons (the default, with no explicit
				// height) can't render an outline — Cesium silently drops it
				// with a console warning. This app has no real terrain
				// (EllipsoidTerrainProvider), so pinning to the ellipsoid
				// surface at height 0 costs nothing and gets the outline back.
				height: 0,
			},
			label: this.labelOptions(
				`Area: ${formatArea(area)}\nPerimeter: ${formatDistance(perimeter)}`,
			),
			position: this.centroid(),
		});
		this.finishedShapes.push(polygon);

		this.previewEntity = undefined;
		this.vertexEntities = [];
		this.positions = [];
		this.previewPosition = undefined;
		this.canClose = false;
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
		let liveLabel = "";
		if (drawing) {
			if (this.canClose) {
				const area = polygonAreaSquareMeters(this.positions.map(toCartographic));
				liveLabel = `Area: ${formatArea(area)} — click to close`;
			} else {
				const pts = [...this.positions];
				if (this.previewPosition) pts.push(this.previewPosition);
				const distance = pathLengthMeters(pts.map(toCartographic));
				liveLabel = `Distance: ${formatDistance(distance)}`;
			}
		}
		this.onUpdate({
			active: this._active,
			drawing,
			vertexCount: this.positions.length,
			canClose: this.canClose,
			liveLabel,
			finishedCount: this.finishedShapes.length,
		});
	}
}
