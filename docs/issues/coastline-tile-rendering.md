# Coastline tile rendering — known issues and investigation history

This documents three distinct problems found while investigating "spike"
artifacts and general glitching in the coastline layer (`apps/web/src/lib/tiles/tile-manager.ts`,
`tile.worker.ts`). They are unrelated to each other and should not be
conflated when investigating further.

## 1. Unresolved (reverted to original behavior): the min-zoom backstop spike

**Symptom:** at deep zoom, a long straight "spike" — a huge, thin triangle —
would sometimes cut across the correct coastline (first spotted near
Baie de Baly, Madagascar, ~16°S 45°E).

**Root cause:** `TileManager` keeps the whole world's min-zoom (z3) tiles
loaded as a permanent fallback layer ("the base level is always on screen"),
so a fast zoom/pan never shows bare ocean while detail streams in. The
add-side of `updateLayer` had no way to tell "still needed" apart from
"loaded a while ago," so a z3 tile stayed resident and rendered forever,
even once the accurate deep-zoom tile fully covering the same area had
loaded. z3's own simplified geometry for that area is never pixel-identical
to the fine tile's — confirmed directly by decoding the z3 Madagascar
`land` feature and finding a real, valid (non-self-intersecting) triangle
in its earcut output connecting ring vertex 151 (`(381, 1129)` tile-local,
≈49°E 11°S, near Madagascar's northern tip) to vertices 26 and 29
(`(155, 2362)` / `(129, 2366)`, ≈47°E 24°S, near the southern tip) — a
single triangle spanning nearly the whole island, which is a legitimate
triangulation of z3's own crude shape, not a bug in earcut or the decoder.
Once a much more accurate z13 tile loaded on top, that same triangle's edge
no longer lined up with the real coastline and stuck out as a spike over
what the fine tile correctly rendered as ocean.

**First fix attempt (reverted):** made z3 entries subject to the normal
per-tile disposal logic once no longer needed. This introduced a much
worse regression — the *addition* side of `updateLayer` still
unconditionally re-added any ready z3 tile every frame, so add and remove
could both happen inside the same `updateLayer()` call before render,
leaving the backstop absent at draw time far more often than intended and
exposing whatever inconsistent mix of stale tiles happened to be resident.

**Second fix attempt (also reverted):** gated the whole z3 layer on
`desired.some(t => !entry || !entry.inScene)` — "is any desired tile not
yet showing." This looked right in principle but had a one-line bug: a
tile whose fetch resolves to zero land geometry (pure ocean — a very
common outcome near any coastline) is marked `state: 'empty'` in
`tile.worker.ts`'s `decodeTileImpl`, and an `'empty'` tile can *never*
become `inScene` (nothing to add to the scene). Checking `!entry.inScene`
therefore treated every resolved-empty tile as a permanent, never-closing
gap, which pinned the z3 backstop on indefinitely almost everywhere near a
coast — exactly the widespread glitching (mixed zoom levels rendering
simultaneously, distorted-looking landmasses) reported after that attempt.

**Third fix attempt (also reverted):** same idea, corrected predicate — a
tile only counts as a gap while its request is genuinely still in flight:
```ts
const anyGap = desired.some((t) => {
	const entry = cache.get(tileKey(layer.config.id, t.z, t.x, t.y));
	return !entry || entry.state === 'pending';
});
```
`'ready'` and `'empty'` tiles are both treated as resolved. This passed
every scripted check run against it (the `TileDebugOverlay` "in scene"
tally correctly dropping `z3` within ~1s at a settled deep zoom over both
open ocean and the original Madagascar location, under heading rotation,
while panning, and correctly reappearing during a fast zoom burst) — but
the user reported it still glitched heavily in actual interactive use, in
ways the scripted checks didn't reproduce or catch. Rather than attempt a
fourth speculative change to the same function, `tile-manager.ts` was
reverted to be byte-for-byte identical to `main` again (the min-zoom
add/dispose logic, specifically) — the only remaining diff from `main` is
the purely additive, read-only `getDebugInfo()`/`TileDebugInfo` tally used
by the diagnostic overlay below, which cannot itself affect what's
rendered. **The original spike bug is present again and unfixed.** Three
attempts in this file have each either failed to fix it or introduced a
worse regression; the next attempt should not be another guess at the
`updateLayer` gap condition without first getting a live interactive
repro (not just scripted zoom/pan sequences) of exactly what "glitches a
lot" looks like, since the scripted verification above demonstrably did
not capture whatever the user is seeing.

## 2. Not a bug: z3's own simplification of large landmasses is very coarse

**Symptom:** at a whole-continent view (effective zoom 3), Africa can
render as a hard-edged, almost parallelogram-like shape rather than its
familiar outline.

This is the z3 tile's own geometry — confirmed by watching the debug
overlay report `in scene: z3:<n>` with the effective zoom genuinely at 3
(i.e. z3 *is* the correct tile for this view, not a leftover from issue
#1). Two contributing factors, not mutually exclusive:
- z3 tiles are large (each spans ~45°) and heavily simplified by whatever
  generated `coastlines.pmtiles`; a continent-sized feature can be reduced
  to very few vertices at this zoom, producing visibly straight edges.
- The base layer loads asynchronously on startup (`ensureBaseLayer()`,
  64 tiles across the whole world); a screenshot taken before all of them
  resolve will show a partial shape — one observed capture had only 5 of
  ~61 land/lake tiles marked `ready`, which by itself is enough to make a
  continent look wrong even with perfectly good per-tile data.

If z3's visual quality at whole-earth zoom matters going forward, the fix
is a better simplification pass on the source data at that zoom level, not
a change to `tile-manager.ts` — the manager is correctly showing exactly
the tile it's supposed to show here.

## 3. Not investigated further: heading rotation's effect on tile selection

The user reported glitching varying "on moving the globe or at different
values of heading." All three of the screenshots that prompted this
document showed the heading needle at (or very near) north, so this wasn't
directly reproduced — issue #1 above is confirmed to fully explain the
static repro cases. It remains possible that `computeVisibleBounds` (in
`projection-math.ts`), which several tile-manager decisions depend on,
computes a larger-than-necessary lon/lat bounding box for a
heading-rotated (tilted) circular viewport, which could push
`countTilesForBounds` over `MAX_TILES_PER_LAYER` and force a lower
effective zoom than the current scale would otherwise justify. This is a
hypothesis, not a confirmed finding — if glitching recurs specifically
when heading is non-zero, start by watching the `TileDebugOverlay`'s
effective-zoom reading while dragging the heading control at a fixed
scale, to see whether it drops on its own.

## Diagnostic tooling

`apps/web/src/lib/components/TileDebugOverlay.svelte` is a temporary,
purpose-built panel (top-left, red border) added for this investigation.
It reports the tile manager's *effective* zoom (post budget-backoff —
`TileManager.getDebugInfo()`, not a raw `zoomForScale()` recomputation,
which can disagree with what's actually being requested on wide/polar
views), the hovered tile's z/x/y, and a live per-zoom count of tiles
currently in the scene. That last figure is what actually answers "is a
stale zoom level still resident" — use it instead of eyeballing the
coastline shape. Delete the component and its two call sites in
`GlobeCanvas.svelte` (`pushTileDebugInfo()`, and the render in the
template) once no longer needed.
