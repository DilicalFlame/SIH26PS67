import * as THREE from 'three';
import { env } from '$env/dynamic/public';
import { ProjectionType } from '$lib/types/projection';
import { computeVisibleBounds, type LonLatBoundsRad } from '$lib/tiles/projection-math';
import pointVertSrc from '$lib/shaders/point.vert.glsl';
import pointFragSrc from '$lib/shaders/point.frag.glsl';

export interface FloatPosition {
	id?: string | number;
	lon: number;
	lat: number;
}

export interface PointLayerFrameParams {
	rotMat3: THREE.Matrix3;
	scale: number;
	aspect: number;
	projectionA: ProjectionType;
	projectionB: ProjectionType;
	blend: number;
	pan: THREE.Vector2;
}

export type FloatFetcher = (bounds: LonLatBoundsRad, signal: AbortSignal) => Promise<FloatPosition[]>;

const DEG2RAD = Math.PI / 180;
const FETCH_DEBOUNCE_MS = 180;

function defaultFloatFetcher(bounds: LonLatBoundsRad, signal: AbortSignal): Promise<FloatPosition[]> {
	const url = new URL(env.PUBLIC_FLOATS_URL || '/api/floats', window.location.origin);
	url.searchParams.set('lonMin', String(bounds.lonMin / DEG2RAD));
	url.searchParams.set('lonMax', String(bounds.lonMax / DEG2RAD));
	url.searchParams.set('latMin', String(bounds.latMin / DEG2RAD));
	url.searchParams.set('latMax', String(bounds.latMax / DEG2RAD));

	return fetch(url, { signal }).then(async (response) => {
		if (!response.ok) throw new Error(`Float request failed: ${response.status}`);
		const payload: unknown = await response.json();
		if (Array.isArray(payload)) return payload as FloatPosition[];
		if (payload && typeof payload === 'object' && 'floats' in payload) {
			const floats = (payload as { floats?: unknown }).floats;
			if (Array.isArray(floats)) return floats as FloatPosition[];
		}
		throw new Error('Float response must be an array or an object with a floats array');
	});
}

/** GPU-projected, viewport-driven marker layer for Argo positions. */
export class PointLayer {
	private readonly points: THREE.Points;
	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.ShaderMaterial;
	private readonly fetcher: FloatFetcher;
	private fetchTimer: ReturnType<typeof setTimeout> | undefined;
	private abortController: AbortController | undefined;
	private requestId = 0;
	private lastBoundsKey = '';

	constructor(scene: THREE.Scene, fetcher: FloatFetcher = defaultFloatFetcher) {
		this.fetcher = fetcher;
		this.geometry = new THREE.BufferGeometry();
		this.setPositions([]);
		this.material = new THREE.ShaderMaterial({
			vertexShader: pointVertSrc,
			fragmentShader: pointFragSrc,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			uniforms: {
				u_globeRotation: { value: new THREE.Matrix3() },
				u_projectionTypeA: { value: ProjectionType.Sphere },
				u_projectionTypeB: { value: ProjectionType.Sphere },
				u_blend: { value: 0 },
				u_scale: { value: 1 },
				u_aspect: { value: 1 },
				u_pan: { value: new THREE.Vector2() },
				u_sphereWeight: { value: 1 },
				u_pointSize: { value: 8 },
				u_color: { value: new THREE.Color(0xffcf4a) },
			},
		});
		this.points = new THREE.Points(this.geometry, this.material);
		this.points.frustumCulled = false;
		this.points.renderOrder = 10;
		scene.add(this.points);
	}

	update(params: PointLayerFrameParams): void {
		const uniforms = this.material.uniforms;
		uniforms.u_globeRotation.value.copy(params.rotMat3);
		uniforms.u_projectionTypeA.value = params.projectionA;
		uniforms.u_projectionTypeB.value = params.projectionB;
		uniforms.u_blend.value = params.blend;
		uniforms.u_scale.value = params.scale;
		uniforms.u_aspect.value = params.aspect;
		uniforms.u_pan.value.copy(params.pan);
		uniforms.u_sphereWeight.value =
			(params.projectionA === ProjectionType.Sphere ? 1 - params.blend : 0) +
			(params.projectionB === ProjectionType.Sphere ? params.blend : 0);

		const dominant = params.blend < 0.5 ? params.projectionA : params.projectionB;
		const bounds = computeVisibleBounds({
			rotMat3: params.rotMat3,
			scale: params.scale,
			aspect: params.aspect,
			projectionType: dominant,
			pan: params.pan,
		});
		const boundsKey = [bounds.lonMin, bounds.lonMax, bounds.latMin, bounds.latMax]
			.map((value) => value.toFixed(5)).join(',');
		if (boundsKey !== this.lastBoundsKey) this.scheduleFetch(bounds, boundsKey);
	}

	dispose(): void {
		if (this.fetchTimer) clearTimeout(this.fetchTimer);
		this.abortController?.abort();
		this.points.parent?.remove(this.points);
		this.geometry.dispose();
		this.material.dispose();
	}

	private scheduleFetch(bounds: LonLatBoundsRad, boundsKey: string): void {
		this.lastBoundsKey = boundsKey;
		if (this.fetchTimer) clearTimeout(this.fetchTimer);
		this.fetchTimer = setTimeout(() => void this.fetch(bounds), FETCH_DEBOUNCE_MS);
	}

	private async fetch(bounds: LonLatBoundsRad): Promise<void> {
		this.abortController?.abort();
		const controller = new AbortController();
		this.abortController = controller;
		const requestId = ++this.requestId;
		try {
			const positions = await this.fetcher(bounds, controller.signal);
			if (requestId === this.requestId) this.setPositions(positions);
		} catch (error) {
			if (!controller.signal.aborted) console.error('[PointLayer] Failed to load floats', error);
		}
	}

	private setPositions(positions: FloatPosition[]): void {
		const lonLat = new Float32Array(positions.length * 2);
		for (let index = 0; index < positions.length; index += 1) {
			lonLat[index * 2] = positions[index].lon * DEG2RAD;
			lonLat[index * 2 + 1] = positions[index].lat * DEG2RAD;
		}
		this.geometry.setAttribute('a_lonLat', new THREE.Float32BufferAttribute(lonLat, 2));
		this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions.length * 3), 3));
	}
}