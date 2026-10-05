/**
 * geofill.vert.glsl - fills for geometry defined directly in lon/lat rather
 * than in tile-local coordinates.
 *
 * This exists for the south polar cap. Web Mercator tiles stop at ±85.05°, so
 * no tile covers the ground beneath Antarctica's ice - leaving a hole at the
 * pole that no amount of tile loading can fill. The cap is generated
 * analytically instead and drawn through this shader.
 *
 * `u_worldShift` picks which east-west copy of the world to draw in; whole-
 * world meshes are drawn once per visible copy rather than wrapped per vertex,
 * which would tear them at the wrap point.
 */

precision highp float;

#include ./lib/projection.glsl

attribute vec2 a_lonLat; // radians

uniform mat3  u_globeRotation;
uniform int   u_projectionTypeA;
uniform int   u_projectionTypeB;
uniform float u_blend;
uniform float u_scale;
uniform float u_aspect;
uniform vec2  u_pan;
uniform float u_worldShift;

varying vec2 v_tileUV;
varying vec3 v_sphere;
// Pass-through so fragment shaders that need real texture coordinates (e.g.
// scalar-field.ts) can derive their own UV from a bbox uniform, instead of
// re-deriving the vertex projection math in a second copy.
varying vec2 v_lonLat;

void main() {
    float lon = a_lonLat.x;
    float lat = a_lonLat.y;

    // The fragment shader's tile clip is meaningless here; sit safely inside it.
    v_tileUV = vec2(0.5);
    v_sphere = lonLatToSphere(lon, lat);
    v_lonLat = a_lonLat;

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
