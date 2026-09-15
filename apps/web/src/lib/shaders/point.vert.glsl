/** Point markers projected by the same GPU path as map geometry. */

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
uniform float u_pointSize;

varying vec3 v_sphere;

void main() {
    float lon = a_lonLat.x;
    float lat = a_lonLat.y;
    v_sphere = lonLatToSphere(lon, lat);

    vec3 rotated;
    vec2 ndc = projectVertex(
        lon, lat,
        u_globeRotation,
        u_projectionTypeA, u_projectionTypeB, u_blend,
        u_scale, u_aspect, u_pan, worldShiftFor(lon / PROJ_PI, u_pan.x),
        rotated
    );

    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = u_pointSize;
}