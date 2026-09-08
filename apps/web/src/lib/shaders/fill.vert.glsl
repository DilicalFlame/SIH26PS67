/**
 * fill.vert.glsl — polygon fills for one tile of one layer.
 *
 * Dequantizes tile-local Int16 positions back to lon/lat, then runs the shared
 * projection pipeline.
 *
 * The Y axis needs care: a slippy tile's local Y is linear in WEB MERCATOR Y,
 * not in latitude. Interpolating latitude linearly across a tile (the obvious
 * reading of the bbox) bends geometry increasingly toward the poles and makes
 * neighbouring tile rows disagree along their shared edge, which shows up as a
 * smeared band at every row boundary. So the tile carries its Mercator-Y range
 * instead, and latitude is recovered with the inverse Gudermannian.
 *
 * Two varyings serve the fragment shader:
 *   v_tileUV  tile-local [0,1] position, so the MVT buffer overhang can be
 *             clipped instead of overdrawing the neighbouring tile.
 *   v_sphere  unrotated unit-sphere position, so the far hemisphere can be
 *             decided per fragment.
 */

precision highp float;

#include ./lib/projection.glsl

attribute vec2 a_quantCoord; // Int16 normalized to [-1,1] across the tile

uniform mat3  u_globeRotation;
uniform int   u_projectionTypeA;
uniform int   u_projectionTypeB;
uniform float u_blend;
uniform float u_scale;
uniform float u_aspect;
uniform vec2  u_pan;       // flat-map pan, in map units
uniform vec2  u_tileLon;   // (centre, half-extent) in radians
uniform vec2  u_tileMercY; // (centre, half-extent) in normalized Mercator Y, 0 = north

varying vec2 v_tileUV;
varying vec3 v_sphere;

void main() {
    float lon = u_tileLon.x + a_quantCoord.x * u_tileLon.y;

    // +1 in quantized Y is the tile's north edge, which is the LOW end of
    // normalized Mercator Y — hence the subtraction.
    float mercY = u_tileMercY.x - a_quantCoord.y * u_tileMercY.y;
    float t = PROJ_PI * (1.0 - 2.0 * mercY);
    float lat = atan((exp(t) - exp(-t)) * 0.5); // atan(sinh(t)); GLSL ES 1.0 has no sinh

    v_tileUV = a_quantCoord * 0.5 + 0.5;
    v_sphere = lonLatToSphere(lon, lat);

    // One shift for the whole tile, derived from its centre, so the tile can
    // never be torn between two copies of the world.
    float worldShift = worldShiftFor(u_tileLon.x / PROJ_PI, u_pan.x);

    vec3 rotated;
    vec2 ndc = projectVertex(
        lon, lat,
        u_globeRotation,
        u_projectionTypeA, u_projectionTypeB, u_blend,
        u_scale, u_aspect, u_pan, worldShift,
        rotated
    );

    gl_Position = vec4(ndc, 0.0, 1.0);
}
