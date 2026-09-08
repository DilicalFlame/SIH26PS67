/**
 * projection-math.ts
 *
 * CPU-side mirror of the inverse of globe.vert.glsl's projectMap()/toNDC()
 * pipeline. Used only to decide which tiles are needed (visible-bbox +
 * cursor-ray unprojection for prefetch) — the actual rendering math lives
 * exclusively in the shader and is untouched by this module.
 */

import * as THREE from 'three';
import { ProjectionType } from '$lib/types/projection';

const PI = Math.PI;
/** Web Mercator's usual latitude cutoff — the tile pyramid stops here. */
const MAX_LAT_RAD = 85.0511 * (PI / 180);

export interface CameraState {
	rotMat3: THREE.Matrix3;
	scale: number;
	aspect: number;
	projectionType: ProjectionType;
	/** Flat-projection pan, in map units. The globe is navigated by rotation. */
	pan?: THREE.Vector2;
}

export interface LonLatBoundsRad {
	lonMin: number;
	lonMax: number;
	latMin: number;
	latMax: number;
}

/** Inverse of projectMap()+toNDC() for a single projection. Returns rotated-frame (lon,lat) radians, or null if the NDC point falls outside the projected shape. */
function inverseProject(
	ndcX: number,
	ndcY: number,
	pType: ProjectionType,
	scale: number,
	aspect: number,
	panX = 0,
	panY = 0
): { lon: number; lat: number } | null {
	if (pType === ProjectionType.Sphere) {
		const x = (ndcX * aspect) / scale;
		const y = ndcY / scale;
		const r2 = x * x + y * y;
		if (r2 > 1) return null;
		const rx = Math.sqrt(Math.max(0, 1 - r2));
		return { lon: Math.atan2(x, rx), lat: Math.asin(Math.max(-1, Math.min(1, y))) };
	}

	// The map wraps east-west, so x is deliberately not clamped — longitudes
	// beyond ±180° are meaningful and tilesForBounds normalizes them.
	const x = ndcX / scale + panX;
	const y = Math.max(-0.5, Math.min(0.5, ndcY / (aspect * scale) + panY));
	return { lon: x * PI, lat: y * PI };
}

/** Undo the trackball rotation (r = R*p in the shader, so p = R^T * r for an orthonormal R). */
function unrotate(lonR: number, latR: number, rotMat3: THREE.Matrix3): { lon: number; lat: number } {
	const cLat = Math.cos(latR);
	const r = new THREE.Vector3(cLat * Math.cos(lonR), cLat * Math.sin(lonR), Math.sin(latR));
	const inv = rotMat3.clone().transpose();
	const p = r.applyMatrix3(inv);
	return { lon: Math.atan2(p.y, p.x), lat: Math.asin(Math.max(-1, Math.min(1, p.z))) };
}

/**
 * NDC point -> unit vector in the ROTATED frame (i.e. before undoing the
 * trackball). Used for cursor-anchored zoom: the anchor correction is a
 * rotation between the directions the cursor pointed at before and after a
 * scale change, which is projection-agnostic because all four projections
 * run through the same rotate-then-project pipeline.
 */
export function viewDirection(ndcX: number, ndcY: number, cam: CameraState): THREE.Vector3 | null {
	const proj = inverseProject(ndcX, ndcY, cam.projectionType, cam.scale, cam.aspect);
	if (!proj) return null;
	const cLat = Math.cos(proj.lat);
	return new THREE.Vector3(cLat * Math.cos(proj.lon), cLat * Math.sin(proj.lon), Math.sin(proj.lat));
}

/** NDC point -> true (unrotated) geographic lon/lat, in radians. */
export function unprojectPoint(
	ndcX: number,
	ndcY: number,
	cam: CameraState
): { lon: number; lat: number } | null {
	const proj = inverseProject(ndcX, ndcY, cam.projectionType, cam.scale, cam.aspect,
		cam.pan?.x ?? 0, cam.pan?.y ?? 0);
	if (!proj) return null;
	return cam.projectionType === ProjectionType.Sphere
		? unrotate(proj.lon, proj.lat, cam.rotMat3)
		: proj;
}

const SAMPLE_STEPS = 6;
const SPHERE_SAMPLES = 24;

/**
 * Approximate visible lon/lat bounds by sampling the boundary of whatever is
 * SMALLER on screen — the projected content's own edge, or the viewport.
 *
 * Sampling the sphere's silhouette is only correct while the whole globe fits
 * on screen. Once zoomed in far enough that the viewport sits inside the
 * projected disk, the visible region is the viewport rectangle instead, and
 * sampling the silhouette yields a wildly oversized bbox (hence over-fetching
 * and coverage holes). Good enough for tile selection either way — this does
 * not need pixel-perfect accuracy.
 */
export function computeVisibleBounds(cam: CameraState): LonLatBoundsRad {
	// The flat map: derive bounds from the visible map-space rectangle rather
	// than by unprojecting viewport corners, which can legitimately fall
	// outside the map (above the pole) where inverseProject clamps — silently
	// shrinking the bounds and starving the polar tile rows.
	if (cam.projectionType !== ProjectionType.Sphere) {
		const panX = cam.pan?.x ?? 0;
		const panY = cam.pan?.y ?? 0;
		const halfX = 1 / cam.scale;
		const halfY = 1 / (cam.aspect * cam.scale);

		// x is left unwrapped so a view straddling ±180° yields a continuous
		// range (e.g. 170°..190°); y is clamped to the poles.
		const yMin = Math.max(-0.5, panY - halfY);
		const yMax = Math.min(0.5, panY + halfY);

		return {
			lonMin: (panX - halfX) * PI,
			lonMax: (panX + halfX) * PI,
			latMin: Math.max(-MAX_LAT_RAD, yMin * PI),
			latMax: Math.min(MAX_LAT_RAD, yMax * PI),
		};
	}

	const pts: { lon: number; lat: number }[] = [];
	const tryPoint = (ndcX: number, ndcY: number) => {
		const proj = inverseProject(ndcX, ndcY, cam.projectionType, cam.scale, cam.aspect,
			cam.pan?.x ?? 0, cam.pan?.y ?? 0);
		if (!proj) return;
		// Flat projections are not rotated — see projectVertex in projection.glsl.
		pts.push(cam.projectionType === ProjectionType.Sphere
			? unrotate(proj.lon, proj.lat, cam.rotMat3)
			: proj);
	};

	// The orthographic frustum is [-aspect,aspect] x [-1,1] and the sphere is
	// drawn at radius u_scale, so the globe outruns the viewport once
	// scale exceeds the viewport's half-extents.
	const viewportInsideGlobe =
		cam.projectionType === ProjectionType.Sphere && cam.scale > Math.min(1, cam.aspect);

	if (cam.projectionType === ProjectionType.Sphere && !viewportInsideGlobe) {
		// The globe's NDC footprint is an ellipse — radius scale/aspect in x,
		// scale in y (see toNDC) — not the unit circle. Sampling a unit circle
		// puts almost every probe outside the disc, where inverseProject
		// correctly returns null, collapsing the bounds to a single point and
		// starving every tile row but one.
		tryPoint(0, 0);
		for (let i = 0; i < SPHERE_SAMPLES; i++) {
			const a = (i / SPHERE_SAMPLES) * PI * 2;
			tryPoint((Math.cos(a) * cam.scale * 0.999) / cam.aspect, Math.sin(a) * cam.scale * 0.999);
		}
	} else {
		// Viewport rectangle: border samples plus the centre. Every sample is
		// on the front hemisphere when zoomed in, so inverseProject handles
		// them unchanged.
		tryPoint(0, 0);
		for (let i = 0; i <= SAMPLE_STEPS; i++) {
			const t = (i / SAMPLE_STEPS) * 2 - 1;
			tryPoint(t, -1);
			tryPoint(t, 1);
			tryPoint(-1, t);
			tryPoint(1, t);
		}
	}

	if (!pts.length) {
		return { lonMin: -PI, lonMax: PI, latMin: -PI / 2, latMax: PI / 2 };
	}

	// Unwrap longitudes relative to the view centre (pts[0]) before taking the
	// bbox, so a view straddling the dateline yields a narrow wrapped range
	// (e.g. 170°..190°) instead of a spurious near-global one. tilesForBounds
	// normalizes out-of-range longitudes and handles wraparound.
	const refLon = pts[0].lon;
	let lonMin = Infinity;
	let lonMax = -Infinity;
	let latMin = Infinity;
	let latMax = -Infinity;
	for (const p of pts) {
		let lon = p.lon;
		while (lon - refLon > PI) lon -= 2 * PI;
		while (refLon - lon > PI) lon += 2 * PI;
		lonMin = Math.min(lonMin, lon);
		lonMax = Math.max(lonMax, lon);
		latMin = Math.min(latMin, p.lat);
		latMax = Math.max(latMax, p.lat);
	}

	// A view containing a pole spans every longitude, however narrow the
	// on-screen region looks — near the pole all meridians converge. Detect
	// that from the sampled spread and widen to the full range, otherwise the
	// bbox collapses to whichever meridians happened to be sampled and most of
	// the polar tiles are never requested.
	if (lonMax - lonMin > PI * 1.5 || !viewportInsideGlobe) {
		lonMin = -PI;
		lonMax = PI;
	}

	return {
		lonMin,
		lonMax,
		latMin: Math.max(-MAX_LAT_RAD, latMin),
		latMax: Math.min(MAX_LAT_RAD, latMax),
	};
}

/**
 * Pick a tile zoom level from the current scale, matching tile screen
 * footprint to a conventional 256px slippy tile. The orthographic camera
 * frustum is [-aspect,aspect]x[-1,1], so NDC x spans canvasWidthPx already
 * aspect-normalized — world width in px is canvasWidthPx * scale.
 */
export function zoomForScale(scale: number, canvasWidthPx: number): number {
	const worldPx = canvasWidthPx * scale;
	return Math.round(Math.log2(Math.max(1, worldPx / TILE_PX)));
}

const TILE_PX = 256;

/** Inverse of zoomForScale — the camera scale at which tile zoom `z` is requested. */
export function scaleForZoom(z: number, canvasWidthPx: number): number {
	return (TILE_PX * 2 ** z) / canvasWidthPx;
}
