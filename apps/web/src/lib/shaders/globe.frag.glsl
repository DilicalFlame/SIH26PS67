/**
 * globe.frag.glsl
 *
 * Minimalist fragment shader for the world-border and graticule line segments.
 * Color is driven by uniforms so the same shader can tint borders vs. graticule.
 */

precision highp float;

uniform vec3  u_lineColor;   // RGB line color
uniform float u_globalAlpha; // master fade (used during projection morph)

varying float v_alpha;

void main() {
	float alpha = v_alpha * u_globalAlpha;
	if (alpha < 0.01) discard;
	gl_FragColor = vec4(u_lineColor, alpha);
}
