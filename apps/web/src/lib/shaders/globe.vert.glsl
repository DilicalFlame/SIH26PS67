/**
 * globe.vert.glsl — GPU map projection engine (v2)
 *
 * Pipeline per vertex:
 *   1. Read (lon, lat) in radians from a_geoCoord
 *   2. Convert to 3D unit-sphere Cartesian vector
 *   3. Apply u_globeRotation (trackball, always active)
 *   4. Back-project rotated vector → (lon', lat')
 *   5. Compute normalized map coords for projection A and B
 *   6. Convert each to NDC with correct viewport-AR correction
 *   7. Blend A → B with u_blend
 *   8. Antimeridian / backface cull: push degenerate vertices outside clip
 *
 * Projection IDs  (match ProjectionType enum in TypeScript):
 *   0 = Orthographic Sphere
 *   1 = Equirectangular (Plate Carrée)
 *   2 = Web Mercator
 *   3 = Mollweide
 *
 * Normalized map-coordinate convention for 2D projections:
 *   x ∈ [-1, +1]      full longitude range  (−π … +π)
 *   y ∈ [-0.5, +0.5]  latitude, in equal-geographic-scale units
 *   → natural 2:1 width:height rectangle, same for all three 2D modes
 *
 * NDC conversion:
 *   Sphere:  x_ndc = x * scale / aspect   (divide by aspect → circle on wide screen)
 *            y_ndc = y * scale
 *   2D:      x_ndc = x * scale
 *            y_ndc = y * aspect * scale    (multiply by aspect → 2:1 map fills viewport)
 */

precision highp float;

// ── Attributes ──────────────────────────────────────────────────────────────
attribute vec2 a_geoCoord;      // (lon_rad, lat_rad) — this vertex
attribute vec2 a_geoCoordNext;  // (lon_rad, lat_rad) — partner vertex in same segment

// ── Uniforms ────────────────────────────────────────────────────────────────
uniform mat3  u_globeRotation;     // trackball rotation, updated every frame
uniform int   u_projectionTypeA;   // source projection (0–3)
uniform int   u_projectionTypeB;   // target projection (0–3)
uniform float u_blend;             // 0 = fully A, 1 = fully B
uniform float u_scale;             // master map scale (0.82 → slight margin)
uniform float u_aspect;            // canvas width / height
uniform float u_isGraticule;       // 1.0 for graticule, 0.0 for borders

// ── Varyings ────────────────────────────────────────────────────────────────
varying float v_alpha;

// ============================================================================
// Mollweide auxiliary angle  θ  via Newton–Raphson
//   Solves:  2θ + sin(2θ) = π · sin(φ)
// ============================================================================
float mollweideTheta(float lat) {
    const float PI = 3.14159265358979;
    float target = PI * sin(lat);
    float theta  = lat;                        // good initial guess
    for (int i = 0; i < 12; i++) {
        float dt = -(2.0 * theta + sin(2.0 * theta) - target)
                    / (2.0 + 2.0 * cos(2.0 * theta));
        theta += dt;
        if (abs(dt) < 1.0e-7) break;
    }
    return clamp(theta, -1.5707963, 1.5707963);
}

// ============================================================================
// projectMap: (lon, lat, rotated-3D-point) → normalized 2D map coordinates
//
//   Sphere  → xy ∈ [-1,1]²
//   2D      → x  ∈ [-1,1],  y ∈ [-0.5,+0.5]
// ============================================================================
vec2 projectMap(int pType, float lon, float lat, vec3 p3d) {
    const float PI = 3.14159265358979;

    if (pType == 0) {
        // Orthographic sphere.  We use the pre-rotated 3D vector directly.
        //   p3d.y = cos(lat')·sin(lon')  → east  axis
        //   p3d.z = sin(lat')            → north axis
        return vec2(p3d.y, p3d.z);

    } else if (pType == 1) {
        // Plate Carrée / Equirectangular
        //   x = λ/π  ∈ [-1,+1]
        //   y = φ/π  ∈ [-0.5,+0.5]  (equal geographic scale: 1°x = 1°y)
        return vec2(lon / PI, lat / PI);

    } else if (pType == 2) {
        // Web Mercator — clamped to ±85.05° so the formula stays finite
        //   y = log(tan(π/4 + φ/2)) / (2π)  → ≈ 0.499 at φ = 85.05°
        float cLat = clamp(lat, -1.484422, 1.484422);
        float y    = log(tan(PI * 0.25 + cLat * 0.5)) / (2.0 * PI);
        return vec2(lon / PI, clamp(y, -0.5, 0.5));

    } else {
        // Mollweide equal-area ellipse
        //   x = λ·cos(θ)/π  ∈ [-1,+1]
        //   y = sin(θ)/2    ∈ [-0.5,+0.5]
        float theta = mollweideTheta(lat);
        return vec2(lon * cos(theta) / PI, sin(theta) * 0.5);
    }
}

// ============================================================================
// toNDC: map coordinates → clip-space XY  (with viewport-AR correction)
// ============================================================================
vec2 toNDC(vec2 xy, int pType) {
    if (pType == 0) {
        // Sphere: divide x by aspect so the circle appears circular on screen.
        // (NDC x=1 spans W pixels, NDC y=1 spans H pixels; dividing x by W/H
        //  equalises the pixel scale on both axes.)
        return vec2(xy.x * u_scale / u_aspect, xy.y * u_scale);
    } else {
        // 2D: x fills full width at u_scale; y × aspect restores the 2:1 AR.
        // Derivation: the map rectangle is 2 units wide, 1 unit tall in map
        // space.  On a viewport of aspect A, matching pixel scales requires
        // y_ndc = y_map · A · scale  (verified to give 2:1 px AR for any A).
        return vec2(xy.x * u_scale, xy.y * u_aspect * u_scale);
    }
}

// ============================================================================
// main
// ============================================================================
void main() {
    const float PI = 3.14159265358979;

    // ── 1. Read geographic attributes ────────────────────────────────────────
    float lon  = a_geoCoord.x;
    float lat  = a_geoCoord.y;
    float lonN = a_geoCoordNext.x;
    float latN = a_geoCoordNext.y;

    // ── 2. Convert to unit-sphere Cartesian ──────────────────────────────────
    float cLat  = cos(lat);
    float cLatN = cos(latN);
    vec3 p  = vec3(cLat  * cos(lon),  cLat  * sin(lon),  sin(lat));
    vec3 pN = vec3(cLatN * cos(lonN), cLatN * sin(lonN), sin(latN));

    // ── 3. Apply trackball rotation ──────────────────────────────────────────
    vec3 r  = u_globeRotation * p;
    vec3 rN = u_globeRotation * pN;

    // ── 4. Back-project to (lon', lat') ─────────────────────────────────────
    float lonR  = atan(r.y,  r.x);
    float latR  = asin(clamp(r.z,  -1.0, 1.0));
    float lonNR = atan(rN.y, rN.x);

    // ── 5. Antimeridian clip ─────────────────────────────────────────────────
    // After rotation, a segment that straddles the ±180° meridian will have
    // its two endpoints with |Δlon| > π.  Both vertices push to (2,2,0,1)
    // so the hardware clipper discards the entire segment.
    if (abs(lonR - lonNR) > PI) {
        v_alpha     = 0.0;
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        return;
    }

    // ── 6. Sphere back-face culling ──────────────────────────────────────────
    // r.x is the "depth" component in our globe coordinate system.
    // r.x < 0 → point is on the far hemisphere (behind the globe).
    // We hide it only while primarily in sphere mode (sphereWeight > 0.5).
    float sphereWeight = 0.0;
    if (u_projectionTypeA == 0) sphereWeight += (1.0 - u_blend);
    if (u_projectionTypeB == 0) sphereWeight += u_blend;

    if (r.x < -0.05 && sphereWeight > 0.95) {
        v_alpha     = 0.0;
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        return;
    }

    // ── 7. Project both ends of the blend, convert to NDC ───────────────────
    vec2 mapA = projectMap(u_projectionTypeA, lonR, latR, r);
    vec2 mapB = projectMap(u_projectionTypeB, lonR, latR, r);

    // NDC is computed SEPARATELY for each projection (each has its own AR
    // correction), then linearly interpolated — gives a smooth screen-space
    // morph that keeps circles circular and 2D maps rectangular throughout.
    vec2 ndcA = toNDC(mapA, u_projectionTypeA);
    vec2 ndcB = toNDC(mapB, u_projectionTypeB);
    vec2 ndc  = mix(ndcA, ndcB, u_blend);

    // ── 8. Per-vertex alpha ──────────────────────────────────────────────────
    v_alpha = (u_isGraticule > 0.5) ? 0.32 : 1.0;

    // Gracefully fade out back-face vertices during a sphere↔2D transition
    if (r.x < 0.0 && sphereWeight > 0.0) {
        v_alpha *= clamp(1.0 - sphereWeight, 0.0, 1.0);
    }

    gl_Position = vec4(ndc, 0.0, 1.0);
}
