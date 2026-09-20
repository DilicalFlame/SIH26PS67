/**
 * fill.frag.glsl - flat colour for a polygon fill, with two clips.
 *
 * Both are done per fragment rather than per vertex: fills are triangles
 * spanning real area, so a per-vertex verdict would drop or keep whole
 * triangles and leave ragged edges where the true boundary runs through a
 * triangle's interior.
 */

precision highp float;

uniform vec3  u_color;
uniform float u_opacity;
uniform mat3  u_globeRotation;
uniform float u_sphereWeight; // 1 = orthographic globe, 0 = flat map

varying vec2 v_tileUV;
varying vec3 v_sphere;

void main() {
    // 1. Tile bounds. MVT geometry runs past the tile edge (the buffer), so
    //    without this every tile overdraws its neighbours - which doubles up
    //    wherever a retained parent tile is still under its children. The
    //    epsilon lets neighbours overlap by a hair, closing the sub-pixel
    //    seams an exact cut would leave between adjacent tiles.
    const float EDGE = 0.0015;
    if (v_tileUV.x < -EDGE || v_tileUV.x > 1.0 + EDGE ||
        v_tileUV.y < -EDGE || v_tileUV.y > 1.0 + EDGE) discard;

    // 2. Far hemisphere. Recomputing the rotated position per fragment (rather
    //    than interpolating a per-vertex verdict) puts the terminator exactly
    //    on the limb, so triangles spanning it are cut cleanly. Interpolating
    //    across a triangle gives a chord through the sphere, so normalize back
    //    onto the surface before the facing test.
    if (u_sphereWeight > 0.5 && (u_globeRotation * normalize(v_sphere)).x < 0.0) discard;

    gl_FragColor = vec4(u_color, u_opacity);
}
