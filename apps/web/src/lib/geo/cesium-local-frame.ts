/**
 * cesium-local-frame.ts
 *
 * Converts Cesium camera state (world/ECEF) into meters in a local frame
 * centered at a shape's centroid, using Cesium's own East-North-Up
 * convention permuted to three.js's Y-up axis order (x=East, y=Up,
 * z=North) - the same convention VolumetricScene.svelte's own
 * toLocalMeters helper and volume-raymarch.ts's box geometry already use.
 *
 * Lets the "Visualise Data" 3D popout's three.js camera start exactly
 * where Cesium's own camera was framing the polygon, so the volume
 * visually "grows out of" the dimmed-everywhere-but-here globe underneath
 * (see PolygonDimOverlay.svelte) instead of jump-cutting to an unrelated
 * framing - a one-time sync, not a per-frame one, since Cesium's camera
 * inputs are disabled for the duration of the popout (see
 * CesiumCanvas.svelte's enterVolumeView/exitVolumeView).
 */
import * as Cesium from "cesium";

export interface LocalFrameCameraSnapshot {
	position: [number, number, number];
	target: [number, number, number];
	fovDeg: number;
}

export function captureLocalCameraSnapshot(
	viewer: Cesium.Viewer,
	centroid: Cesium.Cartesian3,
): LocalFrameCameraSnapshot | null {
	const frustum = viewer.camera.frustum;
	if (!(frustum instanceof Cesium.PerspectiveFrustum) || frustum.fovy === undefined) return null;

	const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(centroid);
	const fixedToEnu = Cesium.Matrix4.inverseTransformation(enuToFixed, new Cesium.Matrix4());
	const rotation = Cesium.Matrix4.getMatrix3(fixedToEnu, new Cesium.Matrix3());

	const toLocalPoint = (p: Cesium.Cartesian3): [number, number, number] => {
		const local = Cesium.Matrix4.multiplyByPoint(fixedToEnu, p, new Cesium.Cartesian3());
		return [local.x, local.z, local.y]; // ENU (East,North,Up) -> three.js (East,Up,North)
	};
	const toLocalDirection = (d: Cesium.Cartesian3): [number, number, number] => {
		const local = Cesium.Matrix3.multiplyByVector(rotation, d, new Cesium.Cartesian3());
		return [local.x, local.z, local.y];
	};

	const position = toLocalPoint(viewer.camera.positionWC);
	const direction = toLocalDirection(viewer.camera.directionWC);
	// Somewhere sensible for OrbitControls to orbit around - not an exact
	// ground-intersection point, just a point the same distance ahead
	// along the view direction as the camera already was from the
	// centroid, so the initial orbit radius feels right.
	const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, centroid);
	const target: [number, number, number] = [
		position[0] + direction[0] * distance,
		position[1] + direction[1] * distance,
		position[2] + direction[2] * distance,
	];

	return { position, target, fovDeg: Cesium.Math.toDegrees(frustum.fovy) };
}

/** Projected screen-space [x,y] pixels for each of a shape's vertices -
 *  drives PolygonDimOverlay's cutout. Computed once, right after the
 *  camera parks (same reasoning as captureLocalCameraSnapshot - the
 *  camera doesn't move again until exit), not per-frame. Returns null if
 *  any vertex fails to project (e.g. briefly mid-flight). */
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
