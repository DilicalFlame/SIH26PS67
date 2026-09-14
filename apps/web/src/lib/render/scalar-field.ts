import * as THREE from 'three';
import geoFillVertSrc from '$lib/shaders/geofill.vert.glsl';

export interface ScalarFieldOptions {
    data: Float32Array;
    width: number;
    height: number;
    bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat] in degrees
    minValue?: number;
    maxValue?: number;
}

export class ScalarFieldRenderer {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;
    private geometry: THREE.BufferGeometry;
    private texture: THREE.DataTexture;
    private uniforms: Record<string, { value: any }>;

    constructor(options: ScalarFieldOptions) {
        const { width, height, data, bbox, minValue, maxValue } = options;

        // 1. Compute min/max if not provided, ignoring NaNs
        let min = minValue !== undefined ? minValue : Infinity;
        let max = maxValue !== undefined ? maxValue : -Infinity;
        if (minValue === undefined || maxValue === undefined) {
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                if (v === v) { // not NaN
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            }
            if (min === Infinity) min = 0;
            if (max === -Infinity) max = 1;
            if (min === max) max = min + 1;
        }

        // 2. Setup DataTexture (RedFormat + FloatType + NearestFilter as required by WebGL2 R32F)
        this.texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.needsUpdate = true;

        // 3. Build Grid Geometry over bbox, subdivided finely enough for smooth limb projection
        const [minLonDeg, minLatDeg, maxLonDeg, maxLatDeg] = bbox;
        const lonSegments = Math.max(20, Math.floor(width / 2));
        const latSegments = Math.max(20, Math.floor(height / 2));

        this.geometry = new THREE.PlaneGeometry(1, 1, lonSegments, latSegments);
        
        // Remap plane attributes to a_lonLat (radians)
        const posAttr = this.geometry.attributes.position;
        const lonLatArray = new Float32Array(posAttr.count * 2);

        const minLon = (minLonDeg * Math.PI) / 180;
        const maxLon = (maxLonDeg * Math.PI) / 180;
        const minLat = (minLatDeg * Math.PI) / 180;
        const maxLat = (maxLatDeg * Math.PI) / 180;

        for (let i = 0; i < posAttr.count; i++) {
            // PlaneGeometry ranges from x: [-0.5, 0.5], y: [-0.5, 0.5]
            const u = posAttr.getX(i) + 0.5;
            const v = posAttr.getY(i) + 0.5;

            const lon = minLon + u * (maxLon - minLon);
            const lat = minLat + v * (maxLat - minLat);

            lonLatArray[i * 2] = lon;
            lonLatArray[i * 2 + 1] = lat;
        }

        this.geometry.setAttribute('a_lonLat', new THREE.BufferAttribute(lonLatArray, 2));
        this.geometry.deleteAttribute('position');
        this.geometry.deleteAttribute('normal');
        this.geometry.deleteAttribute('uv');

        // 4. Custom Shader Material reusing geofill.vert.glsl and manual bilinear filtering in GLSL
        this.uniforms = {
            u_globeRotation:   { value: new THREE.Matrix3() },
            u_projectionTypeA: { value: 0 },
            u_projectionTypeB: { value: 0 },
            u_blend:           { value: 0.0 },
            u_scale:           { value: 1.0 },
            u_aspect:          { value: 1.0 },
            u_pan:             { value: new THREE.Vector2(0, 0) },
            u_worldShift:      { value: 0 },
            u_sphereWeight:    { value: 1.0 },
            
            u_fieldTexture:    { value: this.texture },
            u_textureSize:     { value: new THREE.Vector2(width, height) },
            u_valueRange:      { value: new THREE.Vector2(min, max) },
        };

        const fragmentShader = `
            precision highp float;

            uniform sampler2D u_fieldTexture;
            uniform vec2 u_textureSize;
            uniform vec2 u_valueRange;

            varying vec2 v_tileUV;
            varying vec3 v_sphere;

            // Manual bilinear filtering and NaN handling in GLSL for WebGL2 R32F
            float sampleField(vec2 uv) {
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

                // Check NaNs using v != v check as required
                bool n00 = (v00 != v00);
                bool n10 = (v10 != v10);
                bool n01 = (v01 != v01);
                bool n11 = (v11 != v11);

                if (n00 || n10 || n01 || n11) {
                    return 0.0 / 0.0; // Propagate NaN
                }

                float fx = mix(v00, v10, f.x);
                float fy = mix(v01, v11, f.x);
                return mix(fx, fy, f.y);
            }

            // Simple viridis/jet-like colormap approximation
            vec3 colormap(float t) {
                t = clamp(t, 0.0, 1.0);
                // Cool to warm gradient (Blue -> Cyan -> Green -> Yellow -> Red)
                vec3 c1 = mix(vec3(0.0, 0.0, 0.5), vec3(0.0, 0.5, 1.0), smoothstep(0.0, 0.25, t));
                vec3 c2 = mix(c1, vec3(0.0, 0.8, 0.2), smoothstep(0.25, 0.5, t));
                vec3 c3 = mix(c2, vec3(1.0, 0.9, 0.0), smoothstep(0.5, 0.75, t));
                return mix(c3, vec3(0.8, 0.0, 0.0), smoothstep(0.75, 1.0, t));
            }

            void main() {
                // Plane geometry maps standard UV directly from [0, 1] over the bbox
                vec2 uv = gl_FragCoord.xy; // Fallback or compute from varying if passed, 
                // Let's use standard screen-independent mapping via a custom varying or interpolated coords:
                // Since PlaneGeometry attributes map u/v linearly, let's pass v_uv from vertex shader:
            }
        `;

        // Refined vertex and fragment shaders ensuring clean attribute pipelines
        const refinedVertexShader = `
            precision highp float;
            #include ./lib/projection.glsl
            attribute vec2 a_lonLat;
            uniform mat3 u_globeRotation;
            uniform int u_projectionTypeA;
            uniform int u_projectionTypeB;
            uniform float u_blend;
            uniform float u_scale;
            uniform float u_aspect;
            uniform vec2 u_pan;
            uniform float u_worldShift;

            varying vec2 v_uv;
            varying vec3 v_sphere;

            void main() {
                float lon = a_lonLat.x;
                float lat = a_lonLat.y;

                // Recover plane normalized UV coordinates from lon/lat bounds
                float u = (lon - ${minLon.toFixed(6)}) / (${maxLon.toFixed(6)} - ${minLon.toFixed(6)});
                float v = (lat - ${minLat.toFixed(6)}) / (${maxLat.toFixed(6)} - ${minLat.toFixed(6)});
                v_uv = vec2(u, 1.0 - v); // flip v for standard texture orientation

                v_sphere = lonLatToSphere(lon, lat);

                vec3 rotated;
                vec2 ndc = projectVertex(
                    lon, lat,
                    u_globeRotation,
                    u_projectionTypeA, u_projectionTypeB, u_blend,
                    u_scale, u_aspect, u_pan, u_worldShift,
                    rotated
                );

                gl_Position = vec4(ndc, 0.0, 1.0);
            }
        `;

        const refinedFragmentShader = `
            precision highp float;
            uniform sampler2D u_fieldTexture;
            uniform vec2 u_textureSize;
            uniform vec2 u_valueRange;

            varying vec2 v_uv;
            varying vec3 v_sphere;

            float sampleField(vec2 uv) {
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

                // NaN safety check using v != v as specified
                if (!(v00 == v00) || !(v10 == v10) || !(v01 == v01) || !(v11 == v11)) {
                    return 0.0 / 0.0;
                }

                float fx = mix(v00, v10, f.x);
                float fy = mix(v01, v11, f.x);
                return mix(fx, fy, f.y);
            }

            vec3 colormap(float t) {
                t = clamp(t, 0.0, 1.0);
                vec3 c1 = mix(vec3(0.0, 0.2, 0.6), vec3(0.0, 0.6, 1.0), smoothstep(0.0, 0.25, t));
                vec3 c2 = mix(c1, vec3(0.1, 0.8, 0.3), smoothstep(0.25, 0.5, t));
                vec3 c3 = mix(c2, vec3(0.9, 0.8, 0.1), smoothstep(0.5, 0.75, t));
                return mix(c3, vec3(0.9, 0.1, 0.1), smoothstep(0.75, 1.0, t));
            }

            void main() {
                float val = sampleField(v_uv);

                // Handle NaN values by discarding transparently as requested
                if (!(val == val)) {
                    discard;
                }

                float norm = (val - u_valueRange.x) / max(1e-5, (u_valueRange.y - u_valueRange.x));
                vec3 color = colormap(norm);

                gl_FragColor = vec4(color, 0.85);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            vertexShader: refinedVertexShader,
            fragmentShader: refinedFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: this.uniforms,
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.renderOrder = 2; // Renders above coastlines/caps to prevent z-fighting
    }

    public setValueRange(min: number, max: number): void {
        this.uniforms.u_valueRange.value.set(min, max);
    }

    public updateData(data: Float32Array): void {
        this.texture.image.data = data;
        this.texture.needsUpdate = true;
    }
    public setRenderOrder(order: number): void {
        this.mesh.renderOrder = order;
    }

    public dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
    }
}