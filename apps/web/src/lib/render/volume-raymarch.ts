/**
 * volume-raymarch.ts
 *
 * A raymarched THREE.Data3DTexture volume, built as a BoxGeometry + custom
 * ShaderMaterial - the standard "cube raymarcher" technique (ray origin/
 * direction computed per-vertex in the box's own local space via
 * inverse(modelMatrix), so it works correctly from both outside and inside
 * the box), same approach as three.js's own webgl2_materials_texture3d
 * example. Chosen over marching-cubes isosurface extraction: isosurfaces
 * become a shader-uniform mode switch here instead of a second CPU-side
 * mesh-rebuild pipeline that would need to re-run on every threshold/count
 * slider change - see the plan this was built from for the full rationale.
 *
 * Requires WebGL2 (sampler3D/texture() need GLSL ES 3.00 - see
 * material.glslVersion below) - no WebGL1 fallback.
 */
import * as THREE from "three";

const vertexShader = /* glsl */ `
	out vec3 vOrigin;
	out vec3 vDirection;

	void main() {
		vec4 worldPosition = modelMatrix * vec4(position, 1.0);
		// cameraPosition is a built-in uniform three.js's renderer sets on
		// every draw call for any material that declares it - world space,
		// converted here to this box's own local space.
		vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
		vDirection = position - vOrigin;
		gl_Position = projectionMatrix * viewMatrix * worldPosition;
	}
`;

const fragmentShader = /* glsl */ `
	precision highp float;
	precision highp sampler3D;

	in vec3 vOrigin;
	in vec3 vDirection;
	out vec4 outColor;

	uniform sampler3D uVolume;
	uniform sampler2D uColormap;
	uniform float uOpacity;
	uniform vec3 uBoxSize;
	uniform float uDepthMinFrac;
	uniform float uDepthMaxFrac;
	// The drawn shape's own vertices (local x,z meters, same frame as
	// uBoxSize) - clips the raymarch to the actual polygon/rectangle/
	// ellipse footprint instead of its bounding-box rectangle. Fixed-size
	// array (GLSL requires a compile-time length); uPolygonCount says how
	// many entries are real - path-measure-tool.ts's ellipse mode draws a
	// 64-segment ring (ELLIPSE_SEGMENTS), the largest vertex count any
	// shape here produces, so that's the ceiling.
	const int MAX_POLY_VERTS = 64;
	uniform vec2 uPolygon[MAX_POLY_VERTS];
	uniform int uPolygonCount;

	// Standard PNPOLY crossing-number test, GLSL-ified: a fixed-length loop
	// (required - GLSL loop bounds must be compile-time constants) that
	// breaks early once it's covered uPolygonCount real vertices.
	bool pointInPolygon(vec2 p) {
		bool inside = false;
		int j = uPolygonCount - 1;
		for (int i = 0; i < MAX_POLY_VERTS; i++) {
			if (i >= uPolygonCount) break;
			vec2 vi = uPolygon[i];
			vec2 vj = uPolygon[j];
			if (((vi.y > p.y) != (vj.y > p.y)) &&
				(p.x < (vj.x - vi.x) * (p.y - vi.y) / (vj.y - vi.y) + vi.x)) {
				inside = !inside;
			}
			j = i;
		}
		return inside;
	}

	vec2 hitBox(vec3 orig, vec3 dir) {
		vec3 boxMin = -0.5 * uBoxSize;
		vec3 boxMax = 0.5 * uBoxSize;
		vec3 invDir = 1.0 / dir;
		vec3 t0 = (boxMin - orig) * invDir;
		vec3 t1 = (boxMax - orig) * invDir;
		vec3 tmin = min(t0, t1);
		vec3 tmax = max(t0, t1);
		float tNear = max(max(tmin.x, tmin.y), tmin.z);
		float tFar = min(min(tmax.x, tmax.y), tmax.z);
		return vec2(tNear, tFar);
	}

	void main() {
		vec3 rayDir = normalize(vDirection);
		vec2 bounds = hitBox(vOrigin, rayDir);
		if (bounds.x > bounds.y) discard;
		bounds.x = max(bounds.x, 0.0);

		const int STEPS = 96;
		float stepSize = (bounds.y - bounds.x) / float(STEPS);
		vec3 pos = vOrigin + bounds.x * rayDir;

		vec4 accumulated = vec4(0.0);
		for (int i = 0; i < STEPS; i++) {
			// Local frame is (x=East, y=Up, z=South) - see
			// cesium-local-frame.ts's header comment for why South, not
			// North. Row 0 of the fetched grid is the north edge, so
			// pos.z=-height/2 (north) must map to texCoord.y=0.
			vec3 texCoord = vec3(
				(pos.x + 0.5 * uBoxSize.x) / uBoxSize.x,
				(pos.z + 0.5 * uBoxSize.z) / uBoxSize.z,
				(0.5 * uBoxSize.y - pos.y) / uBoxSize.y
			);
			if (texCoord.z >= uDepthMinFrac && texCoord.z <= uDepthMaxFrac && pointInPolygon(pos.xz)) {
				float raw = texture(uVolume, texCoord).r;
				if (raw > 0.02) {
					vec3 color = texture(uColormap, vec2(raw, 0.5)).rgb;
					// Density only here - uOpacity is applied once, after the
					// loop, to the final accumulated alpha (see below). Baking
					// it into every step's alpha instead made the opacity
					// slider nearly a no-op: with up to STEPS=96 samples,
					// front-to-back accumulation saturates accumulated.a -> 1
					// almost regardless of how small each step's alpha is,
					// so scaling every step by uOpacity barely changed the
					// final result except at extreme (near-zero) values -
					// confirmed live (moving the slider produced no visible
					// change).
					float alpha = raw * 0.12;
					accumulated.rgb += (1.0 - accumulated.a) * alpha * color;
					accumulated.a += (1.0 - accumulated.a) * alpha;
					if (accumulated.a > 0.98) break;
				}
			}
			pos += rayDir * stepSize;
		}

		if (accumulated.a < 0.01) discard;
		// accumulated.rgb is premultiplied by accumulated.a (that's what the
		// front-to-back blend loop above builds) - un-premultiply before
		// scaling alpha by uOpacity, otherwise a low opacity would leave the
		// colour too bright for how transparent the pixel claims to be.
		vec3 straightRgb = accumulated.rgb / max(accumulated.a, 0.0001);
		outColor = vec4(straightRgb, accumulated.a * uOpacity);
	}
`;

const MAX_POLY_VERTS = 64;

export interface VolumeMaterialHandle {
	material: THREE.ShaderMaterial;
	setOpacity: (opacity: number) => void;
	setColormap: (lut: THREE.DataTexture) => void;
	/** Both in [0, 1], shallow(0) -> deep(1) - clips the raymarch to a depth sub-range. */
	setDepthRange: (minFrac: number, maxFrac: number) => void;
}

export function createVolumeMaterial(
	volumeTexture: THREE.Data3DTexture,
	colormapLUT: THREE.DataTexture,
	opacity: number,
	/** The drawn shape's own vertices, local (x=East, z=South) meters -
	 *  clips the raymarch to the shape's real footprint. Silently
	 *  truncated to MAX_POLY_VERTS (only reachable by an ellipse, which
	 *  draws exactly that many). */
	polygonLocalXZ: [number, number][],
): VolumeMaterialHandle {
	// three.js uploads a vec2[] uniform from an array of THREE.Vector2 -
	// unused trailing entries (beyond polygonCount) stay (0,0), harmless
	// since the shader loop stops at uPolygonCount regardless.
	const polygonCount = Math.min(polygonLocalXZ.length, MAX_POLY_VERTS);
	const polygonVectors: THREE.Vector2[] = Array.from({ length: MAX_POLY_VERTS }, () => new THREE.Vector2());
	for (let i = 0; i < polygonCount; i++) {
		polygonVectors[i].set(polygonLocalXZ[i][0], polygonLocalXZ[i][1]);
	}

	const material = new THREE.ShaderMaterial({
		glslVersion: THREE.GLSL3,
		uniforms: {
			uVolume: { value: volumeTexture },
			uColormap: { value: colormapLUT },
			uOpacity: { value: opacity },
			uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
			uDepthMinFrac: { value: 0 },
			uDepthMaxFrac: { value: 1 },
			uPolygon: { value: polygonVectors },
			uPolygonCount: { value: polygonCount },
		},
		vertexShader,
		fragmentShader,
		side: THREE.BackSide,
		transparent: true,
		depthWrite: false,
	});

	return {
		material,
		setOpacity: (o) => {
			material.uniforms.uOpacity.value = o;
		},
		setColormap: (lut) => {
			material.uniforms.uColormap.value = lut;
		},
		setDepthRange: (minFrac, maxFrac) => {
			material.uniforms.uDepthMinFrac.value = minFrac;
			material.uniforms.uDepthMaxFrac.value = maxFrac;
		},
	};
}

/** width = east-west extent, depthTotal = shallow-to-deepest extent,
 *  height = north-south extent, all in local-space meters. Must match
 *  `uBoxSize` exactly - `createVolumeMesh` keeps the two in lockstep. */
export function createVolumeMesh(
	width: number,
	depthTotal: number,
	height: number,
	handle: VolumeMaterialHandle,
): THREE.Mesh {
	const geometry = new THREE.BoxGeometry(width, depthTotal, height);
	handle.material.uniforms.uBoxSize.value.set(width, depthTotal, height);
	return new THREE.Mesh(geometry, handle.material);
}
