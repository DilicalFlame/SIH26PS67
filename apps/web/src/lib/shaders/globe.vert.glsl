/**
 * globe.vert.glsl - line geometry (the graticule) through the shared
 * projection pipeline.
 *
 * Each vertex carries its segment partner (a_quantCoordNext) so the discard
 * tests can be made symmetrically for both ends of a segment. That matters:
 * deciding per vertex would leave one endpoint in place while the other is
 * pushed off-screen, and the rasteriser then draws a long streak between them.
 */

precision highp float;

#include ./lib/projection.glsl

// Int16, GPU-normalized to [-1,1], relative to this draw call's bbox.
attribute vec2 a_quantCoord;
attribute vec2 a_quantCoordNext;

uniform mat3  u_globeRotation;
uniform int   u_projectionTypeA;
uniform int   u_projectionTypeB;
uniform float u_blend;
uniform float u_scale;
uniform float u_aspect;
uniform vec2  u_pan;
uniform float u_worldShift;
uniform vec2  u_tileCenter;
uniform vec2  u_tileHalfExtent;

varying float v_alpha;

void main() {
    float lon  = u_tileCenter.x + a_quantCoord.x     * u_tileHalfExtent.x;
    float lat  = u_tileCenter.y + a_quantCoord.y     * u_tileHalfExtent.y;
    float lonN = u_tileCenter.x + a_quantCoordNext.x * u_tileHalfExtent.x;
    float latN = u_tileCenter.y + a_quantCoordNext.y * u_tileHalfExtent.y;

    vec3 r, rN;
    vec2 ndc = projectVertex(lon, lat, u_globeRotation,
                             u_projectionTypeA, u_projectionTypeB, u_blend,
                             u_scale, u_aspect, u_pan, u_worldShift, r);
    projectVertex(lonN, latN, u_globeRotation,
                  u_projectionTypeA, u_projectionTypeB, u_blend,
                  u_scale, u_aspect, u_pan, u_worldShift, rN);

    v_alpha = 1.0;

    float sw = sphereWeight(u_projectionTypeA, u_projectionTypeB, u_blend);

    // Antimeridian: on the globe a segment straddling ±180° has endpoints more
    // than π apart after rotation, and would be drawn straight across the map.
    // The flat map is unrotated and its longitudes stay continuous, so this
    // only applies while the globe is showing.
    float lonR  = atan(r.y,  r.x);
    float lonNR = atan(rN.y, rN.x);
    if (sw > 0.5 && abs(lonR - lonNR) > PROJ_PI) {
        v_alpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        return;
    }

    // Far side of the globe.
    float backDepth = min(r.x, rN.x);
    if (backDepth < -0.05 && sw > 0.95) {
        v_alpha = 0.0;
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        return;
    }

    // Fade rather than pop while the globe is only partly blended in.
    if (backDepth < 0.0 && sw > 0.0) v_alpha *= clamp(1.0 - sw, 0.0, 1.0);

    gl_Position = vec4(ndc, 0.0, 1.0);
}
