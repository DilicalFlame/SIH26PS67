/**
 * scalar-field.ts
 *
 * Renders a Float32 lat/lon grid (temperature, salinity, ...) from MinIO as a
 * colour-mapped field on the globe, in both projections. Implements the
 * frozen `ScalarFieldRenderer` interface in contracts §5.2 verbatim — the
 * layer-control UI is built against this exact method signature, so changing
 * it here breaks that side independently of anything visual.
 *
 * Geometry reuses geofill.vert.glsl's vertex projection path — the same
 * shader the south polar cap draws through (see polar-cap.ts) — rather than
 * re-deriving lon/lat -> NDC a third time. That shader only carries a dummy
 * `v_tileUV`, so it also passes through the raw `v_lonLat` this fragment
 * shader needs to recover real texture coordinates from `u_bboxRad`.
 */

import * as THREE from 'three';
import geoFillVertSrc from '$lib/shaders/geofill.vert.glsl';
import { PUBLIC_TILES_BASE_URL } from '$env/static/public';
import type { ScalarFieldLayerConfig } from '$lib/tiles/layers.config';

const DEG2RAD = Math.PI / 180;

/**
 * Default painter's-algorithm slot (#47). Coastline tiles use
 * `style.order * 1000 + zoom` (tile-manager.ts) with MAX_TILE_ZOOM = 14, so
 * anything below ~10-15k clears every coastline style at every zoom with
 * plenty of headroom for new tile styles. Point/marker layers (#51, #59) are
 * unbuilt, but the AC is "above coastlines, below markers" — leaving five
 * clear decades above this before markers would need to start justifies
 * reserving 10000 rather than crowding just past the tiles' current max.
 */
const DEFAULT_RENDER_ORDER = 10000;

const FRAGMENT_SHADER = `
    precision highp float;

    uniform sampler2D u_fieldTexture;
    uniform vec2  u_textureSize;
    uniform vec4  u_bboxRad;    // minLon, minLat, maxLon, maxLat (radians)
    uniform vec2  u_valueRange;
    uniform float u_opacity;
    uniform mat3  u_globeRotation;
    uniform float u_sphereWeight;

    varying vec3 v_sphere;
    varying vec2 v_lonLat;

    // Bilinear tap with NaN-aware weight renormalization: a missing corner
    // just softens that texel instead of retreating the field a full cell
    // (~25-50km at 0.25 deg) from every land boundary. Only discards when all
    // four corners are invalid. isnan() is unreliable across drivers — v != v
    // is the portable IEEE-754 NaN test (see #43's traps).
    bool sampleField(vec2 uv, out float value) {
        vec2 pixelCoord = uv * u_textureSize - 0.5;
        vec2 baseCoord = floor(pixelCoord);
        vec2 f = fract(pixelCoord);

        vec2 st00 = (baseCoord + vec2(0.5, 0.5)) / u_textureSize;
        vec2 st10 = (baseCoord + vec2(1.5, 0.5)) / u_textureSize;
        vec2 st01 = (baseCoord + vec2(0.5, 1.5)) / u_textureSize;
        vec2 st11 = (baseCoord + vec2(1.5, 1.5)) / u_textureSize;

        float v00 = texture2D(u_fieldTexture, st00).r;
        float v10 = texture2D(u_fieldTexture, st10).r;
        float v01 = texture2D(u_fieldTexture, st01).r;
        float v11 = texture2D(u_fieldTexture, st11).r;

        float w00 = (v00 == v00) ? (1.0 - f.x) * (1.0 - f.y) : 0.0;
        float w10 = (v10 == v10) ? f.x * (1.0 - f.y)         : 0.0;
        float w01 = (v01 == v01) ? (1.0 - f.x) * f.y         : 0.0;
        float w11 = (v11 == v11) ? f.x * f.y                 : 0.0;

        float wSum = w00 + w10 + w01 + w11;
        if (wSum < 1e-5) return false;

        float s00 = (v00 == v00) ? v00 : 0.0;
        float s10 = (v10 == v10) ? v10 : 0.0;
        float s01 = (v01 == v01) ? v01 : 0.0;
        float s11 = (v11 == v11) ? v11 : 0.0;

        value = (w00 * s00 + w10 * s10 + w01 * s01 + w11 * s11) / wSum;
        return true;
    }

    // Single placeholder gradient. The cmocean-accurate LUT registry
    // (thermal / haline / viridis / balance) ships with #44
    // (render/colormaps.ts); setColormap() will drive a texture lookup
    // instead of this once that lands. Not oceanographically calibrated.
    vec3 colormap(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c1 = mix(vec3(0.0, 0.2, 0.6), vec3(0.0, 0.6, 1.0), smoothstep(0.0, 0.25, t));
        vec3 c2 = mix(c1, vec3(0.1, 0.8, 0.3), smoothstep(0.25, 0.5, t));
        vec3 c3 = mix(c2, vec3(0.9, 0.8, 0.1), smoothstep(0.5, 0.75, t));
        return mix(c3, vec3(0.9, 0.1, 0.1), smoothstep(0.75, 1.0, t));
    }

    void main() {
        // Far hemisphere: the same recompute-per-fragment test fill.frag.glsl
        // uses, so the field's limb lines up exactly with the coastlines it
        // composites over instead of drifting across a triangle's chord.
        if (u_sphereWeight > 0.5 && (u_globeRotation * normalize(v_sphere)).x < 0.0) discard;

        vec2 uv = vec2(
            (v_lonLat.x - u_bboxRad.x) / (u_bboxRad.z - u_bboxRad.x),
            (v_lonLat.y - u_bboxRad.y) / (u_bboxRad.w - u_bboxRad.y)
        );
        uv.y = 1.0 - uv.y; // grid row 0 is the northernmost row

        float val;
        if (!sampleField(uv, val)) discard;

        float norm = clamp((val - u_valueRange.x) / max(1e-5, u_valueRange.y - u_valueRange.x), 0.0, 1.0);
        gl_FragColor = vec4(colormap(norm), u_opacity);
    }
`;

/** 1x1 NaN texture so the material is valid (and invisible) before the first setLayer(). */
function makePlaceholderTexture(): THREE.DataTexture {
	const tex = new THREE.DataTexture(new Float32Array([NaN]), 1, 1, THREE.RedFormat, THREE.FloatType);
	tex.needsUpdate = true;
	return tex;
}

export class ScalarFieldRenderer {
	public readonly mesh: THREE.Mesh;

	private readonly material: THREE.ShaderMaterial;
	private readonly uniforms: Record<string, THREE.IUniform>;
	private geometry: THREE.BufferGeometry;
	private texture: THREE.DataTexture;

	private scene: THREE.Scene | null = null;
	private config: ScalarFieldLayerConfig | null = null;

	// Kept for sampleAt()'s CPU-side hover readout, mirroring what the GPU has bound.
	private rawData: Float32Array | null = null;
	private bboxRad: [number, number, number, number] = [0, 0, 0, 0];
	private gridWidth = 0;
	private gridHeight = 0;

	// #48: one in-flight grid fetch at a time. Aborting the previous controller
	// before starting a new one covers both required cases with the same
	// mechanism — dispose() abort-during-fetch, and setDepthIndex/setTimeIndex
	// called again before the first fetch lands (the second call must win, not
	// whichever response happens to arrive first).
	private abortController: AbortController | null = null;

	constructor() {
		this.geometry = new THREE.BufferGeometry();
		this.texture = makePlaceholderTexture();

		this.uniforms = {
			u_globeRotation: { value: new THREE.Matrix3() },
			u_projectionTypeA: { value: 0 },
			u_projectionTypeB: { value: 0 },
			u_blend: { value: 0.0 },
			u_scale: { value: 1.0 },
			u_aspect: { value: 1.0 },
			u_pan: { value: new THREE.Vector2(0, 0) },
			u_worldShift: { value: 0 },
			u_sphereWeight: { value: 1.0 },

			u_fieldTexture: { value: this.texture },
			u_textureSize: { value: new THREE.Vector2(1, 1) },
			u_bboxRad: { value: new THREE.Vector4(0, 0, 0, 0) },
			u_valueRange: { value: new THREE.Vector2(0, 1) },
			u_opacity: { value: 1.0 },
		};

		this.material = new THREE.ShaderMaterial({
			vertexShader: geoFillVertSrc,
			fragmentShader: FRAGMENT_SHADER,
			uniforms: this.uniforms,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
		});

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		// The shader derives position entirely from a_lonLat / the projection
		// uniforms, so Three's frustum culling (built on `position`/bounding
		// sphere) can't be trusted — see buildSouthPolarCap() for the same call.
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
		this.mesh.name = 'scalar-field';
		this.mesh.renderOrder = DEFAULT_RENDER_ORDER;
	}

	mount(scene: THREE.Scene): void {
		this.scene = scene;
		scene.add(this.mesh);
	}

	/**
	 * Explicit painter's-algorithm slot (#47) — set() rather than relying on
	 * insertion order, so stacking multiple fields (or moving one past
	 * coastlines/markers) doesn't depend on the order layers were mounted in.
	 * `transparent`/`depthWrite: false` are already set on the material
	 * (see the constructor), which is what lets two stacked, differently-
	 * ordered fields blend by opacity instead of occluding each other.
	 */
	setRenderOrder(order: number): void {
		this.mesh.renderOrder = order;
	}

	async setLayer(config: ScalarFieldLayerConfig): Promise<void> {
		this.config = { ...config };
		this.rebuildGeometry(config.meta.bbox, config.meta.width, config.meta.height);

		this.setValueRange(config.valueRange[0], config.valueRange[1]);
		this.setOpacity(config.opacity);
		this.setColormap(config.colormap);
		this.setVisible(config.visible);

		await this.loadGrid(config.depthIndex, config.timeIndex);
	}

	async setDepthIndex(i: number): Promise<void> {
		if (!this.config) throw new Error('[ScalarFieldRenderer] setDepthIndex() called before setLayer()');
		this.config.depthIndex = i;
		await this.loadGrid(i, this.config.timeIndex);
	}

	async setTimeIndex(i: number): Promise<void> {
		if (!this.config) throw new Error('[ScalarFieldRenderer] setTimeIndex() called before setLayer()');
		this.config.timeIndex = i;
		await this.loadGrid(this.config.depthIndex, i);
	}

	/** Uniform only, synchronous — must not trigger a fetch or a re-upload. */
	setValueRange(min: number, max: number): void {
		(this.uniforms.u_valueRange.value as THREE.Vector2).set(min, max);
	}

	/**
	 * Uniform only, synchronous — must not trigger a fetch or a re-upload.
	 * Every name currently renders through the one placeholder gradient in
	 * FRAGMENT_SHADER; real per-name LUT selection lands with #44.
	 */
	setColormap(name: string): void {
		if (this.config) this.config.colormap = name;
	}

	/** Uniform only, synchronous — must not trigger a fetch or a re-upload. */
	setOpacity(v: number): void {
		this.uniforms.u_opacity.value = v;
	}

	setVisible(v: boolean): void {
		this.mesh.visible = v;
	}

	/** CPU-side bilinear sample of the currently bound grid, for hover readouts. */
	sampleAt(lon: number, lat: number): number | null {
		if (!this.rawData || this.gridWidth === 0 || this.gridHeight === 0) return null;

		const [minLonR, minLatR, maxLonR, maxLatR] = this.bboxRad;
		const lonR = lon * DEG2RAD;
		const latR = lat * DEG2RAD;
		if (lonR < minLonR || lonR > maxLonR || latR < minLatR || latR > maxLatR) return null;

		const u = (lonR - minLonR) / (maxLonR - minLonR);
		const v = 1.0 - (latR - minLatR) / (maxLatR - minLatR);

		const px = u * this.gridWidth - 0.5;
		const py = v * this.gridHeight - 0.5;
		const x0 = Math.floor(px);
		const y0 = Math.floor(py);
		const fx = px - x0;
		const fy = py - y0;

		const at = (x: number, y: number): number => {
			const cx = Math.min(Math.max(x, 0), this.gridWidth - 1);
			const cy = Math.min(Math.max(y, 0), this.gridHeight - 1);
			return this.rawData![cy * this.gridWidth + cx];
		};

		const taps: [number, number][] = [
			[at(x0, y0), (1 - fx) * (1 - fy)],
			[at(x0 + 1, y0), fx * (1 - fy)],
			[at(x0, y0 + 1), (1 - fx) * fy],
			[at(x0 + 1, y0 + 1), fx * fy],
		];

		let sum = 0;
		let weight = 0;
		for (const [val, w] of taps) {
			if (Number.isNaN(val)) continue;
			sum += val * w;
			weight += w;
		}
		return weight > 1e-5 ? sum / weight : null;
	}

	dispose(): void {
		this.abortController?.abort();
		this.scene?.remove(this.mesh);
		this.geometry.dispose();
		this.material.dispose();
		this.texture.dispose();
	}

	private rebuildGeometry(bboxDeg: [number, number, number, number], width: number, height: number): void {
		const [minLonDeg, minLatDeg, maxLonDeg, maxLatDeg] = bboxDeg;
		const minLon = minLonDeg * DEG2RAD;
		const minLat = minLatDeg * DEG2RAD;
		const maxLon = maxLonDeg * DEG2RAD;
		const maxLat = maxLatDeg * DEG2RAD;
		this.bboxRad = [minLon, minLat, maxLon, maxLat];
		(this.uniforms.u_bboxRad.value as THREE.Vector4).set(minLon, minLat, maxLon, maxLat);

		// Subdivided finely enough that the projection blend stays smooth on
		// the sphere limb; deliberately independent of grid resolution — the
		// fragment shader's bilinear tap carries data detail, so this only
		// needs to bound projection curvature, not texel count.
		const lonSegments = Math.max(20, Math.floor(width / 2));
		const latSegments = Math.max(20, Math.floor(height / 2));
		const cols = lonSegments + 1;
		const rows = latSegments + 1;

		const lonLat = new Float32Array(cols * rows * 2);
		const indices: number[] = [];

		for (let row = 0; row < rows; row++) {
			const v = row / latSegments;
			const lat = minLat + v * (maxLat - minLat);
			for (let col = 0; col < cols; col++) {
				const u = col / lonSegments;
				const lon = minLon + u * (maxLon - minLon);
				const idx = row * cols + col;
				lonLat[idx * 2] = lon;
				lonLat[idx * 2 + 1] = lat;

				if (row < rows - 1 && col < cols - 1) {
					const a = idx;
					const b = idx + 1;
					const c = idx + cols;
					const d = idx + cols + 1;
					indices.push(a, c, b, b, c, d);
				}
			}
		}

		this.geometry.dispose();
		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute('a_lonLat', new THREE.BufferAttribute(lonLat, 2));
		// The shader derives position entirely from a_lonLat, but Three.js
		// still needs a `position` attribute to infer the draw range — see
		// tile-manager.ts's buildMeshes() and polar-cap.ts for the same fix.
		this.geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(new Float32Array(cols * rows * 3), 3)
		);
		this.geometry.setIndex(indices);
		this.mesh.geometry = this.geometry;

		this.gridWidth = width;
		this.gridHeight = height;
	}

	private async loadGrid(depthIndex: number, timeIndex: number): Promise<void> {
		if (!this.config) return;
		const meta = this.config.meta;
		// {tilesBase} is the only place the frontend learns where tiles live
		// (contracts §1) — everywhere else resolves it from PUBLIC_TILES_BASE_URL,
		// same as pmtiles-source.ts. {d}/{t} substitute array indices, not values (§4.3).
		const url = meta.gridUrlTemplate
			.replace('{tilesBase}', PUBLIC_TILES_BASE_URL.replace(/\/$/, ''))
			.replace('{d}', String(depthIndex))
			.replace('{t}', String(timeIndex));

		// #48: cancel whatever this renderer was still waiting on — a stale
		// request left running would otherwise race this one and could bind
		// its (older) grid last, or write into a texture/uniform this call
		// already disposed of.
		this.abortController?.abort();
		const controller = new AbortController();
		this.abortController = controller;

		let res: Response;
		try {
			res = await fetch(url, { signal: controller.signal });
		} catch (err) {
			if (controller.signal.aborted) return; // superseded or disposed — not a real failure
			throw err;
		}
		if (controller.signal.aborted) return;
		if (!res.ok) {
			throw new Error(`[ScalarFieldRenderer] grid fetch failed: ${url} (${res.status})`);
		}
		const data = new Float32Array(await res.arrayBuffer());
		if (controller.signal.aborted) return;

		this.rawData = data;
		(this.uniforms.u_textureSize.value as THREE.Vector2).set(meta.width, meta.height);

		this.texture.dispose();
		this.texture = new THREE.DataTexture(data, meta.width, meta.height, THREE.RedFormat, THREE.FloatType);
		// WebGL2 core only samples R32F with NEAREST; linear needs
		// OES_texture_float_linear, so the bilinear tap above is done by hand.
		this.texture.minFilter = THREE.NearestFilter;
		this.texture.magFilter = THREE.NearestFilter;
		this.texture.wrapS = THREE.ClampToEdgeWrapping;
		this.texture.wrapT = THREE.ClampToEdgeWrapping;
		this.texture.needsUpdate = true;
		this.uniforms.u_fieldTexture.value = this.texture;
	}
}
