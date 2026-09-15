/**
 * grid-texture.ts
 *
 * Fetches one `.f32` grid artifact (contracts §2) and builds the
 * `THREE.DataTexture` scalar-field.ts binds. Split out from scalar-field.ts
 * so the texture cache and prefetch manager (#45) can construct textures
 * for depth/time indices that aren't the one currently on screen, without
 * duplicating the fetch/abort/texture-parameter logic a second time.
 */

import * as THREE from 'three';

/** `{d}`/`{t}` substitute array indices, not values (§4.3) — `gridUrlTemplate`
 * must already have `{tilesBase}` resolved before this is called. */
export function buildGridUrl(resolvedGridUrlTemplate: string, depthIndex: number, timeIndex: number): string {
	return resolvedGridUrlTemplate.replace('{d}', String(depthIndex)).replace('{t}', String(timeIndex));
}

/**
 * Resolves to `null` — not a rejection — when `signal` was aborted either
 * before the fetch settled or while the response body was still arriving.
 * Callers must treat `null` as "superseded, nothing to bind", exactly like
 * scalar-field.ts's loadGrid() already did before this was extracted (#48).
 */
export async function fetchGridTexture(
	url: string,
	width: number,
	height: number,
	signal: AbortSignal
): Promise<THREE.DataTexture | null> {
	let res: Response;
	try {
		res = await fetch(url, { signal });
	} catch (err) {
		if (signal.aborted) return null;
		throw err;
	}
	if (signal.aborted) return null;
	if (!res.ok) {
		throw new Error(`[grid-texture] grid fetch failed: ${url} (${res.status})`);
	}
	const data = new Float32Array(await res.arrayBuffer());
	if (signal.aborted) return null;

	const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
	// WebGL2 core only samples R32F with NEAREST; linear needs
	// OES_texture_float_linear, so scalar-field.ts's fragment shader does the
	// bilinear tap by hand.
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.needsUpdate = true;
	return texture;
}
