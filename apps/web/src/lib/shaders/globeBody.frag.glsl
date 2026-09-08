/**
 * globeBody.frag.glsl
 *
 * The ocean surface behind the land fills. Drawn as a full-screen quad: each
 * fragment tests membership of the projected map shape — a disc for the
 * orthographic globe, a horizontally-endless band for the flat map — and
 * blends shape A to shape B with u_blend so the ocean morphs in lockstep with
 * the fills.
 *
 * Flat colour by design. This sits under every data overlay the platform will
 * add later, so it stays quiet, and one flat fill is far cheaper than the
 * per-fragment lighting and procedural starfield this replaced.
 *
 * Shape extents mirror toNDC() in lib/projection.glsl exactly:
 *   globe : x_ndc = x*scale/aspect, y_ndc = y*scale         (unit disc)
 *   map   : x_ndc = x*scale,        y_ndc = y*aspect*scale  (y within ±0.5)
 */

precision highp float;

uniform vec3  u_ocean;
uniform float u_scale;
uniform float u_aspect;
uniform int   u_projectionTypeA;
uniform int   u_projectionTypeB;
uniform float u_blend;
uniform vec2  u_pan;

varying vec2 v_uv; // full-screen quad, in NDC space

/** Antialiased coverage of one projection's map shape. */
float coverage(int pType, vec2 ndc) {
    if (pType == 0) {
        vec2  p = vec2(ndc.x * u_aspect / u_scale, ndc.y / u_scale);
        float r = length(p);
        return 1.0 - smoothstep(1.0 - fwidth(r) * 1.5, 1.0, r);
    }

    // The map wraps east-west, so it has no left or right edge — only the
    // poles bound it.
    float y  = ndc.y / (u_aspect * u_scale) + u_pan.y;
    float d  = abs(y / 0.5);
    float fw = fwidth(d) * 1.5 + 1e-5;
    return 1.0 - smoothstep(1.0 - fw, 1.0, d);
}

void main() {
    float mask = mix(coverage(u_projectionTypeA, v_uv), coverage(u_projectionTypeB, v_uv), u_blend);
    if (mask < 0.004) discard;
    gl_FragColor = vec4(u_ocean, mask);
}
