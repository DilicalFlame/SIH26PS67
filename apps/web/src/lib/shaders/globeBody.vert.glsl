/**
 * globeBody.vert.glsl
 *
 * Shared by the ocean body and the atmosphere ring. Both are unit-radius
 * quads/circles scaled on the CPU to match u_scale, so all this needs to do
 * is pass through the unit-space position for the fragment shaders to use as
 * a disc coordinate.
 */

precision highp float;

varying vec2 v_uv;

void main() {
    v_uv = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
