/**
 * projection.glsl - shared GPU map-projection engine.
 *
 * Included by the fill and line shaders (via vite-plugin-glsl #include) so the
 * two can never drift apart. Requires the includer to declare:
 *   uniform float u_scale;
 *   uniform float u_aspect;
 *
 * Projection IDs (match ProjectionType in TypeScript):
 *   0 = Orthographic globe (navigated by rotation)
 *   1 = Equirectangular map (navigated by panning, wraps east-west)
 *
 * Map-coordinate convention for the flat projection:
 *   x in [-1, +1]      one full turn of longitude
 *   y in [-0.5, +0.5]  latitude, equal geographic scale
 * so the world is a 2:1 rectangle and is WORLD_WIDTH wide in x.
 */

const float PROJ_PI = 3.14159265358979;
const float WORLD_WIDTH = 2.0;

/** (lon, lat, rotated 3D point) -> normalized 2D map coordinates. */
vec2 projectMap(int pType, float lon, float lat, vec3 p3d) {
    if (pType == 0) {
        // Orthographic globe: the rotated vector is already the projection.
        //   p3d.y = east axis, p3d.z = north axis
        return vec2(p3d.y, p3d.z);
    }
    return vec2(lon / PROJ_PI, lat / PROJ_PI);
}

/**
 * Map coordinates -> clip-space XY, with viewport aspect correction.
 * `pan` translates the flat projection; `worldShift` selects which east-west
 * copy of the world this primitive belongs to, which is what makes the map
 * scroll endlessly instead of ending at ±180°.
 */
vec2 toNDC(vec2 xy, int pType, float scale, float aspect, vec2 pan, float worldShift) {
    if (pType == 0) {
        // Divide x by aspect so the globe stays circular on a wide viewport.
        return vec2(xy.x * scale / aspect, xy.y * scale);
    }
    // The map is 2 units wide and 1 tall; multiplying y by aspect restores that
    // ratio in pixels for any viewport.
    vec2 p = vec2(xy.x + worldShift, xy.y) - pan;
    return vec2(p.x * scale, p.y * aspect * scale);
}

/** lon/lat (radians) -> unit sphere, in the globe's axis convention. */
vec3 lonLatToSphere(float lon, float lat) {
    float cLat = cos(lat);
    return vec3(cLat * cos(lon), cLat * sin(lon), sin(lat));
}

/**
 * Which east-west copy of the world a primitive at map-x `x` should be drawn
 * in, given the current pan. Computed once per primitive (per tile, or per
 * whole-world mesh) rather than per vertex: wrapping individual vertices would
 * tear any primitive straddling the wrap point in half across the screen.
 */
float worldShiftFor(float x, float panX) {
    return -WORLD_WIDTH * floor((x - panX) / WORLD_WIDTH + 0.5);
}

/**
 * Full vertex pipeline shared by fills and lines.
 *
 * The globe is navigated by rotation; the flat map is navigated by panning and
 * uses the vertex's own (unrotated, continuous) lon/lat. Keeping rotation off
 * the flat path is what makes it behave like a real map: rotating a sphere to
 * pan drags geometry over the poles and across the ±180° seam, where atan's
 * wrap puts a primitive's corners on opposite edges and it is drawn straight
 * across everything.
 */
vec2 projectVertex(
    float lon, float lat,
    mat3 rotation,
    int pTypeA, int pTypeB, float blend,
    float scale, float aspect, vec2 pan, float worldShift,
    out vec3 rotated
) {
    vec3 p = lonLatToSphere(lon, lat);
    rotated = rotation * p;

    vec2 ndcA = toNDC(projectMap(pTypeA, lon, lat, rotated), pTypeA, scale, aspect, pan, worldShift);
    vec2 ndcB = toNDC(projectMap(pTypeB, lon, lat, rotated), pTypeB, scale, aspect, pan, worldShift);
    return mix(ndcA, ndcB, blend);
}

/** How strongly the current morph state is the orthographic globe. */
float sphereWeight(int pTypeA, int pTypeB, float blend) {
    float w = 0.0;
    if (pTypeA == 0) w += 1.0 - blend;
    if (pTypeB == 0) w += blend;
    return clamp(w, 0.0, 1.0);
}
