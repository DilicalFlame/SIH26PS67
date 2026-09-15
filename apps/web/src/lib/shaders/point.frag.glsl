precision highp float;

uniform mat3  u_globeRotation;
uniform float u_sphereWeight;
uniform vec3  u_color;

varying vec3 v_sphere;

void main() {
    vec2 point = gl_PointCoord - 0.5;
    if (dot(point, point) > 0.25) discard;

    if (u_sphereWeight > 0.5 && (u_globeRotation * normalize(v_sphere)).x < 0.0) discard;

    gl_FragColor = vec4(u_color, 1.0);
}