/**
 * cesium-local-frame.ts
 *
 * Converts Cesium camera state (world/ECEF) into meters in a local frame
 * centered at a shape's centroid: x=East, y=Up, z=South. Note South, not
 * North - Cesium's ENU is right-handed with East x North = Up, so the
 * *orientation-preserving* remap into three.js's right-handed Y-up
 * convention is (East, Up, -North), not (East, Up, North). Using +North
 * for z silently mirrors the frame (a reflection, not a rotation), which
 * happens to leave static point positions looking plausible but breaks
 * `camera.up`/`lookAt` the moment the view isn't simple top-down -
 * verified live (the volume appeared to fill the whole screen after
 * orbiting Cesium's camera away from straight-down). VolumetricScene.svelte's
 * own toLocalMeters helper and volume-raymarch.ts's box geometry use this
 * exact same (East, Up, South) convention - keep them in sync.
 *
 * Lets the "Visualise Data" 3D popout's three.js camera track Cesium's own
 * camera exactly, every frame - not a separate OrbitControls-driven
 * camera that only starts aligned and then drifts. Cesium's camera stays
 * fully interactive (pan/zoom/rotate) throughout the popout, and
 * VolumetricScene.svelte just mirrors wherever it currently is into the
 * volume's local frame, so the globe and the volume feel like one
 * continuous 3D space instead of two independently-navigable ones.
 */
import * as Cesium from "cesium";

export interface LocalFrameCameraSnapshot {
	position: [number, number, number];
	target: [number, number, number];
	up: [number, number, number];
	fovDeg: number;
}

/** Re-usable scratch objects - this is called every animation frame (see
 *  VolumetricScene.svelte's animate loop), so it must not allocate new
 *  Cesium math objects each call. Not thread-safe/re-entrant, but nothing
 *  here is called concurrently with itself. */
const scratchFixedToEnu = new Cesium.Matrix4();
const scratchRotation = new Cesium.Matrix3();
const scratchPoint = new Cesium.Cartesian3();

export function captureLocalCameraSnapshot(
	viewer: Cesium.Viewer,
	centroid: Cesium.Cartesian3,
): LocalFrameCameraSnapshot | null {
	const frustum = viewer.camera.frustum;
	if (!(frustum instanceof Cesium.PerspectiveFrustum) || frustum.fovy === undefined) return null;

	const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(centroid);
	const fixedToEnu = Cesium.Matrix4.inverseTransformation(enuToFixed, scratchFixedToEnu);
	const rotation = Cesium.Matrix4.getMatrix3(fixedToEnu, scratchRotation);

	const toLocalPoint = (p: Cesium.Cartesian3): [number, number, number] => {
		const local = Cesium.Matrix4.multiplyByPoint(fixedToEnu, p, scratchPoint);
		return [local.x, local.z, -local.y]; // ENU (East,North,Up) -> three.js (East,Up,South)
	};
	const toLocalDirection = (d: Cesium.Cartesian3): [number, number, number] => {
		const local = Cesium.Matrix3.multiplyByVector(rotation, d, scratchPoint);
		return [local.x, local.z, -local.y];
	};

	const position = toLocalPoint(viewer.camera.positionWC);
	const direction = toLocalDirection(viewer.camera.directionWC);
	const up = toLocalDirection(viewer.camera.upWC);
	// Somewhere sensible to look at - not an exact ground-intersection
	// point, just a point the same distance ahead along the view
	// direction as the camera already is from the centroid.
	const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, centroid);
	const target: [number, number, number] = [
		position[0] + direction[0] * distance,
		position[1] + direction[1] * distance,
		position[2] + direction[2] * distance,
	];

	return { position, target, up, fovDeg: Cesium.Math.toDegrees(frustum.fovy) };
}

/** Projected screen-space [x,y] pixels for each of a shape's vertices -
 *  drives PolygonDimOverlay's cutout. Cesium's camera stays fully
 *  interactive during the popout (see CesiumCanvas.svelte's
 *  enterVolumeView), so this is called every frame, same as
 *  captureLocalCameraSnapshot. Returns null if any vertex fails to
 *  project (e.g. briefly mid-flight, or panned off-screen). */
export function captureShapeScreenPoints(
	viewer: Cesium.Viewer,
	positions: [number, number][],
): [number, number][] | null {
	const points: [number, number][] = [];
	for (const [lon, lat] of positions) {
		const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat);
		const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, cartesian);
		if (!win) return null;
		points.push([win.x, win.y]);
	}
	return points;
}
