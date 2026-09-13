# Thalassa - Master Issue Backlog

**Scope:** SIH26PS67 only. PS66 is Anirudh's, and appears here exactly once, as an integration point (T186).
**Team:** Devesh, Nandini, Kashish, Adrika, Alok.
**Horizon:** now → working deployed product, ~2 months.
**Count:** 214 issues across 6 milestones and 26 epics.

---

## How to use this document

**Create issues top to bottom, in order.** Dependencies always point backwards, so if you create them sequentially the numbering works out and nothing references an issue that doesn't exist yet.

**Numbering.** `T001` is a local reference. If your repo has zero issues today, `T001` becomes `#1` and every reference lines up. If you already have N issues, every reference is offset by N - note the offset at the top of the repo README and move on. Do not try to fix this by hand across 214 issues.

**Epics.** The 26 epics listed below should be created **first**, as issues of their own, before any task. Each epic gets the `epic` label and a task-list body linking its children. GitHub renders task lists as progress bars, which is how you'll see milestone health at a glance without a project-management tool.

**Fields.** Every issue block below gives you: area, size, milestone, dependencies, and demo-criticality. Those map one-to-one onto the `task.yml` template fields. The **Outcome** line goes in the Outcome field, **Notes** goes in Implementation notes, **AC** goes in Acceptance criteria.

**What "size" means.** XS < 2h · S ≈ half a day · M ≈ 1 day · L ≈ 2 days. Nothing here is larger than L; anything that would have been got split.

**Ordering caveat.** Creation order is not execution order. Execution order comes from the dependency graph and the lane assignments in `00-scope-and-milestones.md`. Appendix B gives a week-by-week execution view.

---

## Epics - create these 26 first

| # | Epic | Milestone | Children |
|---|---|---|---|
| E01 | Repository, CI, and developer environment | M0 | T001–T009 |
| E02 | Frozen contracts and data model | M0 | T010–T016 |
| E03 | Scalar field rendering engine | M1 | T017–T026 |
| E04 | Map controls and colorbar | M1 | T027–T034 |
| E05 | In-situ observation overlay | M1 | T035–T041 |
| E06 | Conversational AI foundation | M1 | T042–T050 |
| E07 | Application shell and layer management | M1 | T051–T058 |
| E08 | Demo readiness | M1 | T059–T063 |
| E09 | Tile serving: Martin and the Cache layer | M2 | T064–T074 |
| E10 | Reference geospatial datasets | M2 | T075–T088 |
| E11 | Bathymetry and terrain | M2 | T089–T096 |
| E12 | Volumetric and 3D visualization | M2 | T097–T108 |
| E13 | Data ingestion framework | M2 | T109–T119 |
| E14 | Projections and cartography | M2 | T120–T125 |
| E15 | Authentication and accounts | M2 | T126–T133 |
| E16 | Standards compliance (OGC / CF) | M2 | T134–T139 |
| E17 | Memory architecture and chat tree | M3 | T140–T150 |
| E18 | Agent tool surface | M3 | T151–T160 |
| E19 | Semantic search and vector index | M3 | T161–T166 |
| E20 | Projects, work, and activity model | M3 | T167–T175 |
| E21 | Knowledge graph and the "i" affordance | M3 | T176–T180 |
| E22 | Research paper authoring | M4 | T181–T195 |
| E23 | Citations and references | M4 | T196–T201 |
| E24 | Publishing and sharing | M4 | T202–T206 |
| E25 | Plugin architecture | M5 | T207–T210 |
| E26 | Deployment, performance, and hardening | M5 | T211–T214 |

Epic body template:

```markdown
**Goal:** <one sentence>
**Milestone:** M2
**Exit criteria:** <what must be true for this epic to close>

### Tasks
- [ ] #12
- [ ] #13
```

---

# M0 - Foundation

*Target: days 1–2. Exit criteria: nobody is blocked on anyone else.*

### T001 - Add the Task issue template
`area:infra` `size:S` `M0` · dep: none · demo: no

**Outcome:** The team can file structured implementation tasks.
**Notes:** Add `.github/ISSUE_TEMPLATE/task.yml` from the provided file. Update `config.yml` to add `contact_links` pointing at Discussions while keeping `blank_issues_enabled: false`. Drop `needs-triage` from self-authored tasks - a label present on every issue carries no information.
**AC:**
- [ ] Task template renders when opening a new issue
- [ ] `config.yml` has a Discussions contact link
- [ ] An existing issue can be refiled with the new template as a smoke test

---

### T002 - Create labels and milestones
`area:infra` `size:S` `M0` · dep: none · demo: no

**Outcome:** Work can be filtered by type, area, size, and demo-criticality.
**Notes:** Full list in `02-labels-and-setup.md`. Type labels (`task`, `bug`, `enhancement`, `documentation`, `performance`, `spike`, `epic`), nine `area:*`, five status labels, four `size:*`. Six milestones with real due dates. The `demo-critical` label earns its red - in the last 48 hours before any demo it's the only filter anyone should use.
**AC:**
- [ ] All type, area, status, size labels created
- [ ] Six milestones exist with due dates
- [ ] `epic` label exists

---

### T003 - Create the project board
`area:infra` `size:XS` `M0` · dep: T002 · demo: no

**Outcome:** Work status is visible without asking anyone.
**Notes:** Five columns: Backlog → Ready → In progress → In review → Done. Two rules that matter more than the tool: "Ready" means genuinely unblocked (dependencies landed, design exists, contract frozen), and WIP limit of 2 per person. Five people × three open branches is how a sprint ends with nothing mergeable.
**AC:**
- [ ] Board exists with five columns
- [ ] Auto-add rule moves new issues to Backlog
- [ ] WIP limit of 2 documented in the board description

---

### T004 - CI workflow: lint, typecheck, test
`area:infra` `size:S` `M0` · dep: none · demo: no

**Outcome:** A PR that breaks the build cannot merge silently.
**Notes:** `.github/workflows/ci.yml` on `pull_request` and push to `main`. Two jobs. **web:** pnpm with cache, `pnpm --filter web check`, `pnpm --filter web test`. **python:** `uv sync` in `apps/api`, then `ruff check`, `mypy`, `pytest`. Use path filters so a design-only PR skips the matrix. Keep it under 3 minutes or people start bypassing it.
**AC:**
- [ ] A TypeScript error fails CI
- [ ] A ruff violation fails CI
- [ ] Typical PR completes in under 3 minutes
- [ ] Caches are warm on the second run

---

### T005 - Protect `main`
`area:infra` `size:XS` `M0` · dep: T004 · demo: no

**Outcome:** `main` is always deployable.
**Notes:** No direct pushes. CI required. One approval required. Allow self-merge after approval - with five people on five-day cycles, a strict review queue stalls you harder than an unreviewed merge hurts. Require linear history to keep `git log` legible.
**AC:**
- [ ] Direct push to `main` is rejected
- [ ] PR cannot merge with failing CI
- [ ] Branch deletion on merge is automatic

---

### T006 - CONTRIBUTING.md and repo conventions
`area:docs` `size:XS` `M0` · dep: none · demo: no

**Outcome:** Nobody has to ask how to run the project or name a branch.
**Notes:** Use the block in `02-labels-and-setup.md` §5. Put the WSL/ext4 warning in the first screen - it's a documented 10–40× penalty on this codebase and every new contributor will hit it. Include the `code .` from native WSL bash instruction; opening via `\\wsl.localhost\` from PowerShell silently creates a Windows-side session with 9P bridge overhead.
**AC:**
- [ ] `CONTRIBUTING.md` covers setup, branching, PR rules, commit format
- [ ] WSL filesystem warning is prominent
- [ ] `README.md` links to it and to `docs/planning/`

---

### T007 - Complete docker-compose: api service and consolidated env
`area:infra` `size:S` `M0` · dep: none · demo: yes

**Outcome:** `docker compose up` brings up the whole backend stack identically for everyone.
**Notes:** `compose.yml` currently has postgres, minio, minio-init only. Add an `api` service with a dev Dockerfile and reload bind-mount. Move `admin@123` out of `compose.yml` and `scripts/upload-tiles.sh` into a root `.env`. Keep `web` on the host via `pnpm dev` - containerising the frontend for dev costs HMR speed and buys nothing. Add healthcheck-gated `depends_on` so api doesn't start before Postgres accepts connections.
**AC:**
- [ ] `docker compose up -d` starts postgres, minio, minio-init, api
- [ ] API reaches Postgres and MinIO by service name
- [ ] No credentials hardcoded in tracked files
- [ ] Root `.env.example` documents every variable

---

### T008 - Structured logging and request tracing in the API
`area:backend` `size:S` `M0` · dep: T010 · demo: no

**Outcome:** A failing request can be diagnosed from logs alone.
**Notes:** `structlog` or stdlib logging with a JSON formatter. Middleware assigns a request id, logs method, path, status, duration. Log slow queries above 500 ms. Do not log request bodies (they will contain chat content). This costs an hour now and saves hours during M2 integration.
**AC:**
- [ ] Every request logs id, method, path, status, duration
- [ ] Unhandled exceptions log a stack trace with the request id
- [ ] Log level is env-configurable

---

### T009 - Frontend error boundary and dev diagnostics
`area:frontend` `size:S` `M0` · dep: none · demo: yes

**Outcome:** A component crash shows a readable message instead of a blank canvas.
**Notes:** SvelteKit `+error.svelte` plus a component-level boundary around the canvas. WebGL context loss is a real failure mode on laptops with hybrid graphics - listen for `webglcontextlost` and show a "reload" prompt rather than freezing. This one matters for a live demo.
**AC:**
- [ ] A thrown error in a panel doesn't blank the app
- [ ] WebGL context loss shows a recovery prompt
- [ ] Errors log to console with component context in dev

---

### T010 - FastAPI app factory, settings, and CORS
`area:backend` `size:S` `M0` · dep: none · demo: yes

**Outcome:** The API has a real structure instead of a `print("Hello from api!")` stub.
**Notes:** `apps/api/app/main.py` is currently empty. Create `create_app()` with a pydantic-settings object reading the env vars in contracts §1, CORS allowing `WEB_ORIGIN`, and an `/api/v1` router. One router module per group: `catalog.py`, `fields.py`, `observations.py`, `auth.py`, `chat.py`.
**AC:**
- [ ] `uv run uvicorn app.main:app` serves `/api/v1`
- [ ] Settings load from env with sane defaults
- [ ] CORS allows the web dev origin, rejects others
- [ ] `/docs` renders

---

### T011 - Health endpoint with dependency checks
`area:backend` `size:XS` `M0` · dep: T010 · demo: no

**Outcome:** One call tells you whether Postgres and MinIO are reachable.
**Notes:** `GET /api/v1/healthz` → `{ status, db, storage }`. Used by compose healthchecks, by the deploy target in M5, and by whoever is debugging at 2am.
**AC:**
- [ ] Returns 200 with per-dependency booleans
- [ ] Returns 503 when a dependency is down
- [ ] Does not require auth

---

### T012 - Freeze the API contract as stubs returning fixtures ⭐
`area:contracts` `size:M` `M0` · dep: T010 · demo: yes
**Blocks:** T017, T027, T035, T042, T051, T140, T167

**Outcome:** Every endpoint in contracts §4 exists and returns valid fixture data.
**Notes:** The single highest-leverage task in the project. Four people are blocked until it lands. Define every Pydantic response model now, matching the TypeScript interfaces exactly - if they disagree, the contract doc wins. Every route returns a fixture from `fixtures/*.json` at repo root, shared with the frontend so mock and stub cannot drift. Real implementations arrive in T013+ and M1.
**AC:**
- [ ] Every endpoint in contracts §4 responds with a schema-valid fixture
- [ ] `/docs` shows all routes with correct response models
- [ ] Fixtures live in `fixtures/` and are importable by the frontend
- [ ] A contract test asserts fixture ↔ model agreement

---

### T013 - Postgres schema v1 with Alembic
`area:backend` `size:M` `M0` · dep: T007 · demo: yes
**Blocks:** T036, T043, T126, T167, T181

**Outcome:** The full schema from contracts §3 creates from zero with one command.
**Notes:** Add `alembic`, `sqlalchemy[asyncio]`, `asyncpg`, `geoalchemy2`. One initial migration creating **every** table including the M4 ones - additive migrations later hurt far less than rewrites. `CREATE EXTENSION postgis` and `pgcrypto`. Create the GIST index on `profiles.location` and the btree on `profile_levels(profile_id, depth)` in the same migration; adding indexes to populated tables is slower.
**AC:**
- [ ] `alembic upgrade head` creates every table on an empty DB
- [ ] Geometry columns are SRID 4326
- [ ] Indexes from contracts §3 exist
- [ ] `alembic downgrade base` runs clean

---

### T014 - Database reset and seed scaffolding
`area:infra` `size:S` `M0` · dep: T013 · demo: yes

**Outcome:** One command restores a known-good database in under 30 seconds.
**Notes:** `scripts/db_reset.sh`: drop, create, migrate, seed. The seed at this stage creates only the demo user and an empty catalog; real seeding lands in T063. Truncate-and-repopulate rather than upsert - idempotent and easier to reason about under pressure.
**AC:**
- [ ] Resets to clean state in under 30 seconds
- [ ] Idempotent across repeated runs
- [ ] Prints a row-count summary

---

### T015 - Shared TypeScript types generated from OpenAPI
`area:contracts` `size:S` `M0` · dep: T012 · demo: no

**Outcome:** Frontend types cannot drift from the API.
**Notes:** `openapi-typescript` against the running API's schema, output to `apps/web/src/lib/api/types.ts`, committed. Add a CI check that regeneration produces no diff - that check is what actually prevents drift; the generation alone doesn't.
**AC:**
- [ ] Types generate from the live OpenAPI schema
- [ ] Generated file is committed
- [ ] CI fails if the committed file is stale

---

### T016 - Typed API client with mock switching
`area:frontend` `size:S` `M0` · dep: T015 · demo: yes

**Outcome:** Components fetch through one typed client that can serve fixtures instead of the network.
**Notes:** `apps/web/src/lib/api/client.ts`. Reads `PUBLIC_API_BASE_URL`. When `PUBLIC_USE_MOCKS=true`, returns fixtures from `fixtures/`. **Branch on mocks exactly once, at the fetch layer** - never inside a component, or you'll be unpicking it for weeks. Central error handling maps the standard error envelope to typed exceptions.
**AC:**
- [ ] All endpoints callable through the client with full typing
- [ ] Mock mode serves fixtures without network
- [ ] Errors surface as typed exceptions carrying the error code
- [ ] No component imports `fetch` directly

---

# M1 - Demonstrable vertical slice

*The internals demo lives here, but so does the foundation of everything after it. These aren't throwaway.*

## E03 - Scalar field rendering engine

### T017 - ScalarFieldRenderer: render a Float32 grid on the globe ⭐ CRITICAL PATH
`area:rendering` `size:L` `M1` · dep: none · demo: yes
**Blocks:** T018–T034, T097–T108

**Outcome:** A `.f32` grid from MinIO renders as a colour-mapped field on the globe, in both projections.
**Notes:** New `apps/web/src/lib/render/scalar-field.ts` implementing the frozen interface in contracts §5.2. Geometry is a lat/lon grid mesh over the field bbox, subdivided finely enough that the projection blend stays smooth on the sphere limb. **Reuse the vertex projection path from `geofill.vert.glsl`** - do not write a third copy of the projection math. Texture: `THREE.DataTexture`, `RedFormat` + `FloatType`, `NearestFilter`, `ClampToEdgeWrapping`.
**Traps:** WebGL2 core samples `R32F` with NEAREST only; linear needs `OES_texture_float_linear`, and at 0.25° the stair-stepping is visible. Do the bilinear tap manually in GLSL. `isnan()` is unreliable across drivers - use `if (!(v == v)) discard;`.
**AC:**
- [ ] Grid loads and renders in under 500 ms warm
- [ ] NaN cells transparent, not black or zero
- [ ] Correct in Globe, Equirectangular, and mid-blend
- [ ] Composites over coastlines without z-fighting
- [ ] `setValueRange()` / `setColormap()` change display with zero network traffic
- [ ] No visible 0.25° stair-stepping at moderate zoom

---

### T018 - Colormap registry and LUT textures
`area:rendering` `size:S` `M1` · dep: none · demo: yes

**Outcome:** Named colormaps available as cached 256×1 LUT textures.
**Notes:** `apps/web/src/lib/render/colormaps.ts` per contracts §5.3. Ship `thermal`, `haline`, `viridis`, `balance`. **Use cmocean stop values** - thermal for temperature and haline for salinity is the oceanographic convention, and a domain judge will notice if you use matplotlib defaults instead. Cache each LUT; don't rebuild per bind. No dependency on T017, so it can run in parallel.
**AC:**
- [ ] Four colormaps by name
- [ ] `toLUTTexture()` returns a cached DataTexture
- [ ] Unit test asserts endpoint colours

---

### T019 - Texture cache and prefetch manager
`area:rendering` `size:M` `M1` · dep: T017 · demo: yes

**Outcome:** Depth and time changes feel instant because adjacent textures are already on the GPU.
**Notes:** LRU over `(layer, depth, time)` keys, mirroring the pattern in the existing `tile-cache.ts`. At 96 KB per grid, a 60-step time series is under 6 MB - **prefetch the entire time dimension on layer load**. Prefetch depth neighbours on hover. Explicit `dispose()` on eviction; Three.js textures leak GPU memory if you only drop the reference.
**AC:**
- [ ] Full time series prefetched on layer load
- [ ] Depth/time change hits cache with no network request
- [ ] Evicted textures are disposed, verified against `renderer.info.memory`
- [ ] Cache size is configurable

---

### T020 - Field value sampling on the CPU
`area:rendering` `size:S` `M1` · dep: T017 · demo: no

**Outcome:** `sampleAt(lon, lat)` returns the field value under a point.
**Notes:** Reads the retained `Float32Array`, not the GPU texture - reading back from GPU stalls the pipeline. Bilinear interpolate, return `null` over NaN. Used by the hover readout, by area statistics in M2, and eventually by the agent.
**AC:**
- [ ] Returns correct interpolated values against a known grid
- [ ] Returns null over no-data
- [ ] Handles antimeridian and bbox edges
- [ ] Unit tested

---

### T021 - Field layer z-ordering and blending
`area:rendering` `size:S` `M1` · dep: T017 · demo: yes

**Outcome:** Multiple layers composite in a predictable, controllable order.
**Notes:** The vector tile manager already uses painter's-algorithm ordering by style order then tile zoom. Scalar fields need to slot into the same scheme. Set `renderOrder` explicitly per layer rather than relying on insertion order. `transparent: true` with `depthWrite: false` for translucent fields, or they occlude each other wrongly.
**AC:**
- [ ] Field renders above coastlines, below markers
- [ ] Two stacked fields blend by opacity in configured order
- [ ] Reordering in the layer panel changes draw order
- [ ] No z-fighting at any zoom

---

### T022 - Field loading and error states
`area:frontend` `size:S` `M1` · dep: T017 · demo: yes

**Outcome:** A slow or failed grid fetch is visible, not a silent blank.
**Notes:** Skeleton or spinner while the first grid loads. A failed fetch shows a retry affordance on the layer card. Abort in-flight requests when the layer is removed - `AbortController`, or a fast demo operator will queue a dozen orphaned fetches.
**AC:**
- [ ] Loading state during first fetch
- [ ] Failed fetch shows a retryable error on the layer card
- [ ] Removing a layer aborts in-flight requests
- [ ] Retry works without a page reload

---

### T023 - Synthetic field generator for development
`area:data` `size:XS` `M1` · dep: none · demo: no

**Outcome:** T017 can be developed before real data exists.
**Notes:** A script producing a `.f32` grid plus `meta.json` from an analytic function (a lat/lon gradient with a couple of gaussian eddies and a NaN landmask). Twenty minutes of work that decouples the two day-1 critical tasks from each other. Also becomes the fixture for renderer unit tests.
**AC:**
- [ ] Generates valid `.f32` + `meta.json` matching contracts §2
- [ ] Includes a NaN region for landmask testing
- [ ] Committed under `fixtures/`

---

### T024 - Renderer unit tests
`area:rendering` `size:S` `M1` · dep: T017, T023 · demo: no

**Outcome:** Regressions in projection or normalisation are caught by CI.
**Notes:** Vitest browser mode is already configured with Playwright. Test the value→colour mapping, NaN discard, lon/lat→vertex position agreement between the CPU path in `projection-math.ts` and the shader, and texture disposal. Full visual regression is overkill; targeted numeric assertions are not.
**AC:**
- [ ] Value normalisation tested at range endpoints and midpoint
- [ ] CPU and GPU projection agree within tolerance
- [ ] Disposal leaves zero retained textures
- [ ] Runs in CI

---

### T025 - Vector field rendering for currents
`area:rendering` `size:L` `M1` · dep: T017 · demo: no

**Outcome:** U/V component grids render as direction-and-magnitude, not just two scalars.
**Notes:** PS67 names current vectors explicitly. Two options: **static arrows** (instanced glyphs on a decimated grid, oriented by `atan2(v,u)`, scaled by magnitude) or **animated particles** (far more impressive, meaningfully more work). Do arrows first; particles are T105. Arrow density must scale with zoom or it turns into noise at world view.
**AC:**
- [ ] U/V pair renders as oriented arrows
- [ ] Arrow density adapts to zoom
- [ ] Magnitude drives colour via the active colormap
- [ ] Works in both projections

---

### T026 - Field statistics for the visible region
`area:frontend` `size:S` `M1` · dep: T020 · demo: no

**Outcome:** Min, max, and mean for the field in the current viewport.
**Notes:** Compute over the CPU array restricted to `computeVisibleBounds()`, debounced on camera settle. Feeds the "reset colorbar to visible range" button, which is the control people actually want - a global range is usually dominated by a region they aren't looking at.
**AC:**
- [ ] Min/max/mean for visible extent, NaN-excluded
- [ ] Updates on camera settle, not per frame
- [ ] "Fit colorbar to view" applies them
- [ ] Under 16 ms for a full-resolution grid

---

## E04 - Map controls and colorbar

### T027 - Colorbar component bound to uniforms
`area:frontend` `size:M` `M1` · dep: T017, T018 · demo: yes

**Outcome:** An on-screen colorbar showing palette and range, where editing min/max updates the map instantly.
**Notes:** PS67 requires a customisable colorbar by name. Render the LUT as a CSS gradient with ticks from the value range and the layer's units. Palette dropdown from the registry. Min/max numeric inputs plus reset. **Every change calls the synchronous uniform setters** - if the map flickers or refetches, the binding is wrong.
**AC:**
- [ ] Shows active palette, range, units
- [ ] Min/max edit updates within one frame, no network
- [ ] Palette change is instant
- [ ] Reset-to-data-range works

---

### T028 - Log/linear colorbar scaling
`area:rendering` `size:S` `M1` · dep: T027 · demo: no

**Outcome:** Colour scale can be logarithmic for variables that span orders of magnitude.
**Notes:** Shader applies `log(v/min)/log(max/min)` guarded for non-positive values. **Disable the toggle when `valueMin <= 0`** with an explanatory tooltip rather than producing garbage - temperature in °C is the obvious case. Log is genuinely useful for chlorophyll and nutrients, which arrive in M2.
**AC:**
- [ ] Log toggle changes the shader mapping
- [ ] Disabled with a tooltip when range includes non-positive values
- [ ] Colorbar tick labels switch to log spacing
- [ ] Round-trips back to linear cleanly

---

### T029 - Depth selector control
`area:frontend` `size:S` `M1` · dep: T017, T019 · demo: yes

**Outcome:** Picking a depth level changes the rendered field.
**Notes:** Vertical slider with discrete stops at the layer's `depths`, labelled in metres, **deepest at the bottom** - matching physical intuition, not array index order. Calls `setDepthIndex()`. Prefetch neighbours on hover. Display the active depth prominently; it's a thing a presenter points at.
**AC:**
- [ ] Stops exactly at available levels
- [ ] Updates in under 300 ms
- [ ] Active depth shown in metres
- [ ] Keyboard arrows step levels

---

### T030 - Time scrubber with playback
`area:frontend` `size:M` `M1` · dep: T017, T019 · demo: yes

**Outcome:** Scrubbing or playing through time animates the field.
**Notes:** PS67 requires time-step animation. This is the most visually persuasive element you have - an animating ocean field is what makes a screenshot look alive. Playback on a `requestAnimationFrame` loop with a frame cap, **not** `setInterval`. Speed control. Formatted timestamp, readable from across a room.
**AC:**
- [ ] Scrubbing has no visible stutter
- [ ] Play advances all steps and loops
- [ ] Timestamp displayed prominently
- [ ] No texture leak over repeated loops

---

### T031 - Layer opacity and visibility
`area:frontend` `size:XS` `M1` · dep: T017, T021 · demo: yes

**Outcome:** Per-layer opacity slider and visibility toggle.
**Notes:** Uniform-only, both of them. Requires `transparent: true` and correct `renderOrder` from T021. Toggle must not dispose textures, or re-enabling causes a refetch.
**AC:**
- [ ] Opacity blends smoothly over coastlines
- [ ] Toggle preserves textures
- [ ] Controls appear per-layer in the Active list

---

### T032 - Hover value readout in the status bar
`area:frontend` `size:S` `M1` · dep: T020 · demo: no

**Outcome:** Hovering shows the field value under the cursor.
**Notes:** `StatusBar.svelte` already shows coordinates - add value and units there rather than building a component. Show an em-dash over no-data.
**AC:**
- [ ] Status bar shows value + units under cursor
- [ ] Em-dash over no-data
- [ ] No measurable frame-rate cost

---

### T033 - Variable selector
`area:frontend` `size:S` `M1` · dep: T027, T051 · demo: yes

**Outcome:** Switching variable on an active layer swaps the field, keeping depth and time.
**Notes:** PS67 requires a variable selector. Switching should preserve the current depth and time indices **where the new variable has them**, and clamp gracefully where it doesn't. Colormap resets to the new variable's default (thermal ↔ haline) unless the user overrode it.
**AC:**
- [ ] Switching variable swaps the field
- [ ] Depth/time preserved where valid, clamped where not
- [ ] Colormap follows the variable default unless overridden
- [ ] Colorbar units update

---

### T034 - Keyboard shortcuts for map controls
`area:frontend` `size:S` `M1` · dep: T029, T030 · demo: no

**Outcome:** Depth, time, and playback are drivable from the keyboard.
**Notes:** Space toggles playback, arrows step time, shift+arrows step depth, `P` cycles projection. Route through the UI action bus so shortcuts, chat, and clicks all share one path. A discoverable shortcuts overlay on `?`. Presenters who don't have to hunt for a slider look much more fluent.
**AC:**
- [ ] Shortcuts work when canvas has focus
- [ ] Do not fire while typing in an input
- [ ] `?` shows the overlay
- [ ] Dispatch through the action bus

---

## E05 - In-situ observation overlay

### T035 - Argo float marker layer
`area:rendering` `size:M` `M1` · dep: T012 · demo: yes

**Outcome:** Float positions render as markers on the globe, updating with the viewport.
**Notes:** `apps/web/src/lib/render/point-layer.ts`. `THREE.Points` with a custom shader is simpler than instanced billboards and sufficient for a few hundred floats. **Vertices go through the same `projectMap()` path as everything else** - computing screen positions on the CPU detaches them during projection blending. Fetch by `computeVisibleBounds()`, debounced on camera settle.
**Trap:** cull far-side markers by the sign of `dot(normal, viewDir)` or they appear to float through the earth.
**AC:**
- [ ] Correct geographic positions in both projections
- [ ] Far-side markers hidden on the globe
- [ ] Updates on viewport change, debounced
- [ ] Stay attached during projection blend

---

### T036 - Argo profile ingestion into Postgres
`area:data` `size:M` `M1` · dep: T013 · demo: yes

**Outcome:** Float positions and depth profiles are queryable.
**Notes:** Source Argo for the North Indian Ocean over the demo window; the Copernicus in-situ product is an acceptable substitute if the GDAC is awkward - record provenance either way. Populate `platforms`, `profiles`, `profile_levels`. **Apply QC flags: keep 1 and 2, drop the rest** - bad data plotted on stage is worse than missing data. Fifty to two hundred floats is plenty. Bulk insert via `COPY`, not row-by-row ORM.
**AC:**
- [ ] Tables populated for the demo region and window
- [ ] SRID 4326, GIST index used (verify with `EXPLAIN`)
- [ ] QC-failed levels excluded
- [ ] Every profile has ≥10 levels
- [ ] Idempotent

---

### T037 - Observation endpoints against Postgres
`area:backend` `size:M` `M1` · dep: T013, T036 · demo: yes

**Outcome:** Platform and profile endpoints return real data.
**Notes:** Bbox filter via `ST_Intersects` against the GIST index, not a Python-side filter. GeoJSON from the platforms endpoint so the frontend consumes it directly. Cap `limit` server-side at 1000 regardless of request. Order levels by depth in SQL.
**AC:**
- [ ] Bbox query returns only platforms inside
- [ ] Levels ordered by ascending depth
- [ ] Empty result is an empty FeatureCollection, not 404
- [ ] Full demo region query under 200 ms

---

### T038 - Marker picking and selection
`area:rendering` `size:S` `M1` · dep: T035 · demo: yes

**Outcome:** Clicking a marker selects that platform.
**Notes:** Screen-space distance against projected positions - far simpler than GPU picking for a few hundred points. **Hit radius around 12 px**; clicking a 4 px dot during a live demo is a way to look bad on stage. Emit `open_profile` on the action bus so chat and clicking share one path. Hover cursor and highlight.
**AC:**
- [ ] Click within 12 px selects
- [ ] Hover shows pointer cursor and highlight
- [ ] Dispatches `open_profile`
- [ ] Clicking empty ocean deselects

---

### T039 - Depth-vs-variable profile chart
`area:frontend` `size:M` `M1` · dep: T012, T038 · demo: yes

**Outcome:** Selecting a float opens a chart of temperature and salinity against depth.
**Notes:** PS67 requires this by name. **Depth on Y, inverted - surface at top.** This is the oceanographic convention and getting it backwards is the first thing a domain judge notices. Two stacked charts beat one dual-axis chart for readability. Header shows platform id, timestamp, position. Hand-rolled SVG is ~80 lines and avoids a bundle-size conversation.
**AC:**
- [ ] Temperature and salinity against depth
- [ ] Depth axis inverted, labelled in metres
- [ ] Header shows id, timestamp, position
- [ ] Missing salinity doesn't crash
- [ ] Reopens cleanly on new selection

---

### T040 - Profile time series selector
`area:frontend` `size:S` `M1` · dep: T039 · demo: no

**Outcome:** A float with many profiles lets you step through its cycles.
**Notes:** Argo floats surface every ~10 days, so a float has a profile history. List cycles in the panel header; selecting one reloads the chart. This is what turns a single reading into evidence of change over time, which is the actual scientific value.
**AC:**
- [ ] Cycle list with dates
- [ ] Selecting a cycle reloads the chart
- [ ] Current cycle highlighted
- [ ] Handles single-profile platforms without an empty selector

---

### T041 - Model-vs-observation comparison on the profile chart
`area:frontend` `size:M` `M1` · dep: T039, T020 · demo: no

**Outcome:** The profile chart overlays the model field's values at the float's position.
**Notes:** This is the single most scientifically compelling thing in the demo, and it's cheap once T020 exists: sample the active scalar field at the float's lat/lon across all depth levels and draw it as a second trace. It directly addresses PS67's stated gap about correlating model predictions with observational evidence.
**AC:**
- [ ] Model trace overlays the observed profile
- [ ] Rendered distinctly (dashed vs solid) with a legend
- [ ] Only shown when a compatible field is active
- [ ] Depth levels aligned, not merely co-plotted


---

## E06 - Conversational AI foundation

### T042 - Groq client wrapper with streaming
`area:ai` `size:S` `M1` · dep: T010 · demo: yes

**Outcome:** The API can call Groq and stream tokens back.
**Notes:** OpenAI-compatible client pointed at Groq, model from `GROQ_MODEL` (`openai/gpt-oss-120b`). Wrap it behind a small interface so swapping to a paid provider later is a config change, not a refactor - you've already said paid APIs come later, so build the seam now. **Free-tier rate limits are real**; map 429 to a typed error with a friendly message.
**AC:**
- [ ] Streams tokens from Groq
- [ ] Model and key come from env
- [ ] Provider interface allows substitution
- [ ] 429 maps to a typed, readable error

---

### T043 - Chat node persistence
`area:backend` `size:S` `M1` · dep: T013 · demo: yes

**Outcome:** User and assistant turns persist as tree nodes with correct parent links.
**Notes:** Persist the user node **before** calling the model and the assistant node after, so a dropped connection loses at most the response, not the question. `parent_id` NULL for root. Store `tool_calls` as JSONB.
**AC:**
- [ ] User node persists before the model call
- [ ] Assistant node persists with the right parent
- [ ] Tool calls stored as JSONB
- [ ] Interrupted stream leaves consistent state

---

### T044 - `build_context()`: root-to-node path assembly ⭐
`area:ai` `size:S` `M1` · dep: T043 · demo: yes

**Outcome:** The context sent to the model is the path from root to the active node, not the whole tree.
**Notes:** **This is the entire n-ary memory model and it is about fifteen lines.** Walk `parent_id` to root, reverse, map to messages. One function, one call site. Getting this right now is what makes M3's real memory isolation an extension rather than a rewrite. Guard against cycles and cap depth.
**AC:**
- [ ] Returns messages root→node in order
- [ ] Sibling branches excluded, proven by unit test
- [ ] Depth capped with oldest-first truncation
- [ ] Cycle-safe

---

### T045 - Chat SSE endpoint
`area:backend` `size:M` `M1` · dep: T042, T044 · demo: yes

**Outcome:** `POST /projects/{id}/chat/nodes` streams a response over SSE.
**Notes:** Event types exactly per contracts §4.6: `node_created`, `token`, `tool_call`, `ui_action`, `done`, `error`. Flush per token or the stream buffers and arrives all at once, which defeats the point. Handle client disconnect without leaking the upstream request.
**AC:**
- [ ] All six event types emitted correctly
- [ ] Tokens flush individually
- [ ] Client disconnect cancels upstream cleanly
- [ ] Errors emit an `error` event, not a bare 500

---

### T046 - System prompt built from the catalog
`area:ai` `size:S` `M1` · dep: T045, T053 · demo: yes

**Outcome:** The assistant knows which layers, variables, depths, and time ranges exist.
**Notes:** **The agent cannot reason about data it hasn't been told exists.** Build the system prompt from `catalog_layers` at request time, listing layer id, variable, units, depth range, time range, bbox. Keep it compact - a table, not prose. This is why the catalog table matters architecturally rather than being plumbing.
**AC:**
- [ ] Prompt lists all catalog layers with metadata
- [ ] Regenerates when the catalog changes
- [ ] Asking "what data do you have" gives an accurate answer
- [ ] Token cost logged

---

### T047 - `set_map_layer` tool
`area:ai` `size:M` `M1` · dep: T045, T046 · demo: yes

**Outcome:** The assistant can display a layer at a requested depth and time.
**Notes:** Definition per contracts §4.7. **The backend resolves everything fuzzy**: `depth_meters`→nearest index, `time`→nearest index, region name→bbox. The model never sees indices and the frontend never does fuzzy matching. A three-entry hardcoded gazetteer (Bay of Bengal, Arabian Sea, North Indian Ocean) beats a geocoding dependency for now.
**AC:**
- [ ] "Show temperature at 100 m in the Bay of Bengal" produces a valid `ui_action`
- [ ] Nearest-index resolution correct at boundaries
- [ ] Unknown layer returns a useful message, not a crash
- [ ] Gazetteer covers the three demo regions

---

### T048 - Chat panel with SSE consumption
`area:frontend` `size:M` `M1` · dep: T016, T045 · demo: yes

**Outcome:** The user asks a question and sees the answer stream token by token.
**Notes:** Opens from the AI tool-rail icon; vision §6.2 specifies hover reveals the field and click focuses it. Use `fetch` with a `ReadableStream` reader, not `EventSource` - the endpoint is a POST. **Do not special-case `set_map_layer` in the chat component**; dispatch every `ui_action` to the bus. Show tool calls as a visible chip so judges see the agent acting, not just talking.
**AC:**
- [ ] Tokens stream visibly
- [ ] Tool calls show as chips
- [ ] `ui_action` events drive the map via the bus
- [ ] Errors readable, not silent
- [ ] Auto-scroll follows output

---

### T049 - UI action bus
`area:frontend` `size:S` `M1` · dep: none · demo: yes
**Blocks:** T034, T038, T048

**Outcome:** Chat, clicks, and shortcuts drive the map through one channel.
**Notes:** `apps/web/src/lib/state/ui-actions.svelte.ts` per contracts §5.4, using Svelte 5 runes to match the existing `view-status.svelte.ts` pattern. `dispatchUiAction()` / `onUiAction()`. This is what makes plugins possible in M5 without touching the map code, so it's worth the half day now.
**AC:**
- [ ] All three `UiAction` variants dispatch and handle
- [ ] Multiple subscribers all receive
- [ ] Unsubscribe works without leaking
- [ ] Unknown action types warn rather than throw

---

### T050 - Chat tree visualisation
`area:frontend` `size:M` `M1` · dep: T048, T060 · demo: yes

**Outcome:** The conversation renders as a branching tree and clicking a node switches the active branch.
**Notes:** Vision §7.2. **Your most distinctive idea** - worth showing even roughly. Build the tree client-side from the flat `ChatNode[]`; simple top-down tidy layout, no graph library. A branch button on each node creates a child of *that* node, not the leaf. **Highlight the active root-to-node path** - that path *is* the context, and making it visible explains the whole concept in three seconds. Real per-branch memory isolation is M3; the shape is what communicates here.
**AC:**
- [ ] Renders as a tree with visible branch points
- [ ] Clicking a node activates it and highlights its root path
- [ ] Branching mid-tree creates a child of that node
- [ ] Legible at 3 branches / 8 nodes

---

## E07 - Application shell and layer management

### T051 - App shell: canvas, tool rail, panel system
`area:frontend` `size:M` `M1` · dep: T059 · demo: yes
**Blocks:** T027, T029, T030, T033, T052

**Outcome:** The globe sits in a real application layout with a working tool rail and dockable panels.
**Notes:** `+page.svelte` currently renders GlobeCanvas and StatusBar with no chrome. Vertical tool rail per the wireframes: layer, shape, profile, AI. **Omit the two unlabelled placeholder icons** - the vision doc resolved them as non-features. One panel container that any tool renders into, not a bespoke panel per tool. **The WebGL renderer needs an explicit resize call** when panels open; it won't do it itself.
**AC:**
- [ ] Tool rail with four tools and active states
- [ ] Panels open/close without breaking canvas aspect ratio
- [ ] Projection switcher reachable in one click
- [ ] Holds at 1366×768 (likely projector resolution)

---

### T052 - Layer panel with Active / Library / Custom tabs
`area:frontend` `size:M` `M1` · dep: T012, T051 · demo: yes

**Outcome:** The user browses catalog layers and adds them to the map.
**Notes:** Vision §6.3. Library lists `/catalog/layers`. Active lists added layers with T031's controls. Custom shows an honest "uploads arrive later" empty state - better than a hidden tab. **Plain keyword filter only**; semantic search is M3 and has no architectural home yet, so don't fake it. Cards show variable, units, depth count, time range.
**AC:**
- [ ] Library lists catalog layers with metadata
- [ ] Adding a layer renders it
- [ ] Active tab lists layers with working controls
- [ ] Filter matches title, variable, description
- [ ] Custom tab has a clear empty state

---

### T053 - Catalog endpoints against Postgres
`area:backend` `size:S` `M1` · dep: T013 · demo: yes

**Outcome:** `/catalog/layers` returns real rows.
**Notes:** Read from `catalog_layers`, converting the PostGIS bbox polygon to `[w,s,e,n]`. Support `kind` and `variable` filters. Straightforward, but it unblocks both the layer panel and the agent's world model.
**AC:**
- [ ] Returns seeded rows matching `LayerDescriptor`
- [ ] `kind` and `variable` filters work
- [ ] Unknown id returns 404 with standard envelope

---

### T054 - Field metadata endpoint
`area:backend` `size:S` `M1` · dep: T013, T062 · demo: yes

**Outcome:** `/fields/{id}/meta` returns real grid metadata with a working `gridUrlTemplate`.
**Notes:** Read `catalog_layers` plus the `meta.json` written by the pipeline. Build `gridUrlTemplate` from `MINIO_ENDPOINT` and `MINIO_BUCKET`. **This is the one line that changes when the Cache layer lands in M2** - keep it in one place.
**AC:**
- [ ] Returns valid `ScalarFieldMeta`
- [ ] Template resolves for every valid index pair
- [ ] Width/height/bbox match actual grid bytes

---

### T055 - Layer reordering in the Active tab
`area:frontend` `size:S` `M1` · dep: T052, T021 · demo: no

**Outcome:** Drag to reorder active layers, changing draw order.
**Notes:** Native HTML5 drag or a lightweight sortable. Reorder updates `renderOrder`. Also worth doing now because it's the first place drag-and-drop appears, and the interaction pattern gets reused heavily in M4's paper authoring.
**AC:**
- [ ] Drag reorders the list
- [ ] Draw order updates immediately
- [ ] Keyboard reordering available
- [ ] Order persists for the session

---

### T056 - Layer metadata panel
`area:frontend` `size:S` `M1` · dep: T052 · demo: no

**Outcome:** Each layer exposes source, units, resolution, licence, and attribution.
**Notes:** PS67 judges from INCOIS will ask about provenance. Surfacing `catalog_layers.source/attribution/licence` in the UI answers it before it's asked. This is also the shell the M3 "i" button expands into, so structure it to accept additional sections.
**AC:**
- [ ] Shows source, units, spatial/temporal resolution, licence
- [ ] Attribution displayed where required by licence
- [ ] Reachable from every layer card
- [ ] Structured to accept future sections

---

### T057 - Empty and first-run states
`area:frontend` `size:S` `M1` · dep: T051, T052 · demo: yes

**Outcome:** A new user with no layers sees guidance, not a blank globe.
**Notes:** A subtle prompt pointing at the layer tool. Not a modal tour - those get dismissed reflexively. Also covers: no search results, no floats in view, no chat history.
**AC:**
- [ ] First-run prompt points at the layer tool
- [ ] Dismissible, doesn't return in the session
- [ ] Empty states for search, floats, chat
- [ ] No modal on load

---

### T058 - Responsive layout down to tablet width
`area:frontend` `size:M` `M1` · dep: T051 · demo: no

**Outcome:** The app is usable at 1024 px without horizontal scrolling.
**Notes:** Panels collapse to overlays below a breakpoint; tool rail stays. Phone support is explicitly out of scope - a 3D ocean visualization platform on a 390 px screen isn't a real use case, and saying so is better than half-doing it.
**AC:**
- [ ] Usable at 1024 px, no horizontal scroll
- [ ] Panels overlay rather than squeeze the canvas
- [ ] Canvas resizes correctly across breakpoints
- [ ] Below 768 px shows a "use a larger screen" notice

---

## E08 - Demo readiness

### T059 - Design tokens as a Tailwind theme ⭐
`area:design` `size:M` `M0` · dep: none · demo: yes
**Blocks:** T051, and every UI task after it

**Outcome:** Colour, type, spacing, and elevation tokens exist so UI work is consistent without coordination.
**Notes:** **Day 1.** Four people are about to write UI simultaneously; without this they each invent a spacing scale and the result looks assembled by committee. Tailwind 4 `@theme` extending `layout.css`. **Dark UI** - the existing `VOID_COLOR 0x0c1420` sets the direction, and dark chrome lets data colormaps read correctly, where light chrome fights a thermal ramp. Panel chrome semi-transparent over the canvas; the globe is the product. Keep it small - a 40-token system on day 1 won't get used.
**AC:**
- [ ] Tokens defined and documented in one place
- [ ] Panel, button, input, slider base styles exist
- [ ] WCAG AA contrast for body text on panel backgrounds
- [ ] A sample screen demonstrates the set

---

### T060 - Screen designs for M1 panels
`area:design` `size:L` `M1` · dep: T059 · demo: yes
**Blocks:** T050

**Outcome:** Every panel built this sprint has a design delivered before the build starts.
**Notes:** Priority order matching build order: tool rail and layer panel, then colorbar and depth/time, then chat, then profile chart, then chat tree. **Spend disproportionate time on the chat tree** - it's the least conventional element and the one a judge remembers. Rough is fine; consistent is mandatory. Annotate spacing and states rather than producing pixel-perfect comps.
**AC:**
- [ ] Designs for all seven M1 surfaces
- [ ] Each annotates spacing, states, token usage
- [ ] Delivered ≥half a day before the matching build task

---

### T061 - Demo storyboard
`area:design` `size:S` `M1` · dep: none · demo: yes

**Outcome:** An exact written click path everyone builds toward.
**Notes:** Needed by day 2 - it's what defines `demo-critical` for every other issue. Numbered script with literal clicks and literal spoken lines. Proposed arc: globe → add temperature → adjust colorbar → drag depth to 200 m (thermocline) → play time → switch projection mid-animation → click a float, profile opens with the model overlay → ask chat for salinity in the Arabian Sea → branch the chat, show the tree → roadmap. Mark each step with its dependent issues.
**AC:**
- [ ] Numbered script with exact clicks and lines
- [ ] Each step maps to dependent issue numbers
- [ ] Shared by end of day 2
- [ ] Timed to fit the slot with 20% margin

---

### T062 - NetCDF → Float32 grid artifacts → MinIO ⭐
`area:data` `size:L` `M1` · dep: none · demo: yes
**Blocks:** T017 (real data), T054, T063

**Outcome:** On-disk temperature and salinity NetCDF become `.f32` artifacts and `meta.json` in MinIO.
**Notes:** Contracts §2. `apps/worker/` already has xarray, netcdf4, dask, zarr; `main.py` is a stub. Subset to 5–30°N, 45–105°E, regrid to 0.25° with `xarray.interp` - bilinear is defensible for a demo and `xesmf` is a dependency fight you don't need. Write `d{d}_t{t}.f32`: row-major, **north-west origin**, little-endian, NaN for missing. Cap time at 30–60 steps.
**Trap:** **verify orientation by rendering a grid against a known coastline.** A flipped grid is the most likely bug here and it looks plausible enough to survive a casual check.
**AC:**
- [ ] Temperature and salinity artifacts under the contracts §2 layout
- [ ] `meta.json` valid against `ScalarFieldMeta`
- [ ] Byte count equals `width*height*4` for every file
- [ ] Orientation verified against a known landmass
- [ ] Missing values are NaN, not 0 or -9999
- [ ] Idempotent

---

### T063 - Idempotent demo seed script
`area:infra` `size:M` `M1` · dep: T014, T036, T062 · demo: yes

**Outcome:** One command restores the exact demo state.
**Notes:** `scripts/seed_demo.py`. Catalog rows, Argo data, field artifacts, demo user. Truncate-and-repopulate. Uploads artifacts to MinIO if absent. **Must complete in under 60 seconds** - if something breaks mid-presentation, recovery has to be fast enough to do while talking. Prints a summary and verifies every demo-path endpoint returns non-empty data afterwards.
**AC:**
- [ ] Running twice produces identical state
- [ ] Completes under 60 seconds
- [ ] Creates the demo user
- [ ] Verifies every demo-path endpoint post-seed


---

# M2 - Data & rendering core

*Weeks 2–4. This is where the PS67 requirement list gets fully satisfied and the architecture reaches its designed shape.*

## E09 - Tile serving: Martin and the Cache layer

### T064 - Add Martin to docker-compose
`area:infra` `size:S` `M2` · dep: T007 · demo: no

**Outcome:** Martin runs against PostGIS and serves tiles from database tables.
**Notes:** `ghcr.io/maplibre/martin`. Point `DATABASE_URL` at the compose Postgres. Martin auto-discovers geometry tables, which is convenient but means it will publish anything with a geometry column - configure explicitly rather than relying on discovery once you have tables you don't want public.
**AC:**
- [ ] Martin starts and reaches Postgres
- [ ] `/catalog` lists discoverable sources
- [ ] A tile request returns valid MVT
- [ ] Source list is explicit, not auto-discovered

---

### T065 - Cache layer service
`area:infra` `size:M` `M2` · dep: T064 · demo: no
**Blocks:** T066, T067, T068

**Outcome:** A single service in front of both Martin and MinIO, per the resolved architecture.
**Notes:** Vision §4.3 made this a firm decision: SvelteKit is cache-agnostic and talks only to the Cache. Recommend **Nginx with `proxy_cache`** over writing one - it handles range requests, conditional GETs, and cache invalidation correctly, and PMTiles depends on range requests working properly. Route by path prefix: `/tiles/vector/*` and `/tiles/fields/*` → MinIO, `/tiles/dynamic/*` → Martin.
**AC:**
- [ ] Single origin serves both backends by path prefix
- [ ] HTTP range requests pass through correctly
- [ ] Cache hits served without touching the origin
- [ ] `X-Cache: HIT|MISS` header for debugging

---

### T066 - Point the frontend at the Cache layer
`area:frontend` `size:XS` `M2` · dep: T065 · demo: no

**Outcome:** The frontend fetches all tile-like data through one origin.
**Notes:** This should be a **one-line change to `PUBLIC_TILES_BASE_URL`** plus updating `gridUrlTemplate` construction in T054. If it turns out to be more than that, something hardcoded `localhost:9000` somewhere and that's the real bug to fix. Verify PMTiles range requests still work through the proxy - this is the thing most likely to break.
**AC:**
- [ ] Frontend makes no direct MinIO or Martin requests
- [ ] PMTiles range requests work through the cache
- [ ] Field grids load through the cache
- [ ] Env var change is the only frontend edit

---

### T067 - Cache invalidation strategy
`area:infra` `size:S` `M2` · dep: T065 · demo: no

**Outcome:** Re-tiling a dataset doesn't serve stale bytes indefinitely.
**Notes:** Content-addressed paths are the cleanest answer: include a version segment (`vector/coastlines/v2/...`) so new data gets a new URL and old cache entries age out harmlessly. Failing that, a purge endpoint the Workers call after an upload. Version-in-path is strongly preferred - purge endpoints are a source of subtle "why is it still old" bugs.
**AC:**
- [ ] Dataset version appears in the object path
- [ ] Catalog stores the current version
- [ ] Re-tiling produces a new path, not an overwrite
- [ ] Documented in the pipeline README

---

### T068 - Cache headers and TTL policy
`area:infra` `size:S` `M2` · dep: T065 · demo: no

**Outcome:** Static tiles cache aggressively; dynamic tiles cache briefly.
**Notes:** Versioned static paths get `max-age=31536000, immutable`. Martin-served dynamic tiles get a short TTL, 60 seconds or so. Field grids are versioned and immutable. Getting this right is most of the performance win and costs almost nothing.
**AC:**
- [ ] Versioned static paths immutable-cached
- [ ] Dynamic tiles short TTL
- [ ] Browser cache verified in devtools
- [ ] Policy documented

---

### T069 - Dams table and Martin source
`area:data` `size:M` `M2` · dep: T064 · demo: no

**Outcome:** Dams load into PostGIS and serve as dynamic vector tiles.
**Notes:** The motivating case for Martin: too few features to justify tiling, but needs live attribute filtering. Load the dataset, index the geometry, expose a Martin function source that accepts filter parameters. Vision §5.2 has this as the leading example, so it's worth doing properly rather than as a stub.
**AC:**
- [ ] Dams table with GIST index
- [ ] Martin serves valid MVT for the table
- [ ] Attributes present in the tiles
- [ ] Viewport bbox query performs under 100 ms

---

### T070 - Dams layer in the frontend
`area:rendering` `size:M` `M2` · dep: T069, T066 · demo: no

**Outcome:** Dams render from Martin and can be filtered live.
**Notes:** Reuses the existing MVT decode path in `tile.worker.ts` - the source is a different URL, not a different format, which is the whole point of putting Martin behind the same cache. Point rendering reuses T035's point layer.
**AC:**
- [ ] Dams render from Martin tiles
- [ ] Filter changes update tiles without a page reload
- [ ] Clicking a dam shows attributes
- [ ] Uses the existing MVT decode path

---

### T071 - Dynamic attribute filter UI
`area:frontend` `size:M` `M2` · dep: T070 · demo: no

**Outcome:** Users filter a dynamic layer by its attributes.
**Notes:** Generic over the layer's attribute schema rather than hardcoded to dams - numeric attributes get range sliders, categorical ones get multi-select. Building it generic costs maybe two extra hours and covers every future Martin-served dataset.
**AC:**
- [ ] Filter UI generated from attribute schema
- [ ] Range and categorical filters both work
- [ ] Filters compose
- [ ] Clear-all resets

---

### T072 - Tile request coalescing
`area:infra` `size:S` `M2` · dep: T065 · demo: no

**Outcome:** Concurrent requests for the same uncached tile hit the origin once.
**Notes:** Nginx `proxy_cache_lock`. Matters more than it sounds: a fast pan across a fresh region can request the same parent tile from several in-flight paths at once. Cheap to enable, measurable effect.
**AC:**
- [ ] Concurrent identical misses produce one origin request
- [ ] Lock timeout configured
- [ ] Verified under a concurrent load test

---

### T073 - Tile serving metrics
`area:infra` `size:S` `M2` · dep: T065 · demo: no

**Outcome:** Cache hit rate and latency are observable.
**Notes:** Nginx log format with cache status and upstream time, plus a small script summarising hit rate by path prefix. You need this before optimising anything, and it's the evidence base for the performance slide in a final presentation.
**AC:**
- [ ] Logs include cache status and upstream time
- [ ] Summary script reports hit rate by prefix
- [ ] p50/p95 latency computable

---

### T074 - Architecture documentation update
`area:docs` `size:S` `M2` · dep: T066 · demo: no

**Outcome:** Docs reflect the implemented architecture, not the planned one.
**Notes:** `docs/architecture/` currently holds one `.webp` of the hand-drawn diagram. Replace with a maintained diagram (Mermaid or D2 in the repo, so it diffs) showing the resolved path: SvelteKit → Cache → (Martin | MinIO) → PostGIS, with FastAPI outside the tile path. Note explicitly that Figure 2's dual-arrow ambiguity is resolved.
**AC:**
- [ ] Diagram is text-based and version-controlled
- [ ] Matches the implemented system
- [ ] Component responsibilities documented
- [ ] Old `.webp` retained as historical reference

---

## E10 - Reference geospatial datasets

### T075 - Planetiler pipeline template
`area:data` `size:M` `M2` · dep: none · demo: no
**Blocks:** T077, T080, T083

**Outcome:** A reusable, parameterised tiling pipeline so each new dataset isn't a from-scratch job.
**Notes:** Planetiler is confirmed ~2 minutes against tippecanoe's ~10 hours on this project's data, so it's the default. **Critical, learned the hard way: the YAML schema requires an explicit `attributes:` key list per layer.** Omitting it produces tiles that render fine but carry empty attribute fields - on coastlines that was 312 MB without attributes versus 606–628 MB with. Encode this as a validation step in the template, not a comment.
**AC:**
- [ ] Parameterised config template with documented fields
- [ ] Wrapper script: source → PMTiles → MinIO
- [ ] **Validation step fails the build if output attributes are empty**
- [ ] README documents the attributes gotcha prominently

---

### T076 - GeoBoundaries: acquire and inspect
`area:data` `size:S` `M2` · dep: none · demo: no

**Outcome:** Source data on disk with a documented structure, feature count, and licence.
**Notes:** Follow the EDA pattern already established in `scripts/dev/eda/` - those six notebooks are good practice and worth continuing. Decide which administrative levels you actually need; ADM0 and ADM1 is almost certainly enough, and ADM2 globally is a large multiplier for no visible benefit at ocean-platform zoom levels.
**AC:**
- [ ] Data on disk with documented provenance and licence
- [ ] Feature count and geometry complexity recorded
- [ ] Admin levels decided and justified
- [ ] EDA notebook committed

---

### T077 - GeoBoundaries: tile to PMTiles
`area:data` `size:M` `M2` · dep: T075, T076 · demo: no

**Outcome:** Political boundaries published as PMTiles in MinIO.
**Notes:** Much smaller than GSHHG - no multi-resolution zoom-banding trick needed, single Planetiler pass. Retain name, ISO code, and admin level as attributes; the agent will want them for region resolution, replacing T047's hardcoded gazetteer.
**AC:**
- [ ] PMTiles in MinIO under the versioned path convention
- [ ] Attributes non-empty (verify with `pmtiles show`)
- [ ] Renders at all configured zooms
- [ ] Catalog row created

---

### T078 - GeoBoundaries: render as line layer
`area:rendering` `size:M` `M2` · dep: T077 · demo: no

**Outcome:** Boundaries render as lines, not filled polygons.
**Notes:** The existing tile pipeline triangulates polygons with earcut for fills. **Boundaries need stroke rendering, which is a genuinely different path** - either extract ring geometry and render as `THREE.Line`, or generate stroke geometry with a width in screen space. Lines with consistent pixel width across zoom need the latter; plain `THREE.Line` ignores `linewidth` on most platforms.
**AC:**
- [ ] Boundaries render as lines in both projections
- [ ] Consistent pixel width across zoom
- [ ] Style configurable per admin level
- [ ] No visible gaps at tile edges

---

### T079 - EEZ: acquire and inspect
`area:data` `size:S` `M2` · dep: none · demo: no

**Outcome:** Marine Regions EEZ data on disk with documented provenance.
**Notes:** ~200–300 zones, small. **Marine Regions requires attribution and has specific citation requirements** - capture them now for T056 and the provenance doc. Directly relevant to PS67's framing around India's EEZ, so this is a scoring layer, not a nice-to-have.
**AC:**
- [ ] Data on disk with provenance and citation text
- [ ] Feature count and attribute schema recorded
- [ ] Attribution string recorded for the catalog

---

### T080 - EEZ: tile and publish
`area:data` `size:S` `M2` · dep: T075, T079 · demo: no

**Outcome:** EEZ boundaries published as PMTiles.
**Notes:** Single Planetiler pass. Retain sovereign name, ISO code, and area. India's EEZ specifically should be easy to highlight - that's the shot that lands in a national-context presentation.
**AC:**
- [ ] PMTiles in MinIO, versioned path
- [ ] Attributes retained and verified
- [ ] Catalog row with attribution
- [ ] India's EEZ individually selectable

---

### T081 - EEZ layer rendering and styling
`area:rendering` `size:S` `M2` · dep: T080, T078 · demo: no

**Outcome:** EEZ zones render as outlined regions with optional fill.
**Notes:** Reuses T078's line path. Semi-transparent fill on hover or selection reads better than permanent fill, which competes with the data layers underneath.
**AC:**
- [ ] Zones render as outlines
- [ ] Hover/selection shows translucent fill
- [ ] Sovereign name on hover
- [ ] Doesn't obscure scalar fields

---

### T082 - Rivers and lakes: acquire and inspect
`area:data` `size:S` `M2` · dep: none · demo: no

**Outcome:** Source data on disk, with a decision on resolution tier.
**Notes:** Newly added to the backlog in the vision doc revision - it appears in the data taxonomy but wasn't in the original tiling plan. Natural Earth or HydroSHEDS. HydroSHEDS is far more detailed and far larger; for an ocean platform, Natural Earth's tiers are almost certainly sufficient and cheaper.
**AC:**
- [ ] Data on disk with provenance
- [ ] Resolution tier chosen and justified
- [ ] Feature count and size recorded

---

### T083 - Rivers and lakes: tile and publish
`area:data` `size:M` `M2` · dep: T075, T082 · demo: no

**Outcome:** Rivers and lakes published as PMTiles.
**Notes:** Rivers are lines, lakes are polygons - either two layers in one tileset or two tilesets. One tileset with two named source-layers matches the GSHHG pattern already in `layers.config.ts` and keeps the layer registry tidy.
**AC:**
- [ ] PMTiles with separate river and lake source-layers
- [ ] Attributes retained
- [ ] Catalog rows created
- [ ] Zoom ranges appropriate to feature size

---

### T084 - Rivers and lakes rendering
`area:rendering` `size:S` `M2` · dep: T083, T078 · demo: no

**Outcome:** Rivers render as lines, lakes as fills, both styled coherently with coastlines.
**Notes:** Lakes share the `lake` colour already defined in `layers.config.ts` (`0x9cc4e0`) so the basemap stays visually consistent. River width should scale with stream order if the attribute exists.
**AC:**
- [ ] Rivers as lines, lakes as fills
- [ ] Colours consistent with the coastline basemap
- [ ] River width scales with order where available
- [ ] Toggleable independently

---

### T085 - Extend `layers.config.ts` for the discriminated union
`area:frontend` `size:S` `M2` · dep: T017 · demo: no

**Outcome:** The layer registry handles vector, scalar field, and point layers uniformly.
**Notes:** Contracts §5.1. `TileLayerConfig` stays unchanged so nothing currently working breaks. The existing file's own comment says adding a tileset should be one entry with no changes elsewhere - preserve that property for the new kinds too.
**AC:**
- [ ] `AnyLayerConfig` union with all three kinds
- [ ] Existing coastline config unchanged
- [ ] Adding a layer of any kind is one registry entry
- [ ] Type-narrowing works at every consumer

---

### T086 - Catalog-driven layer registry
`area:frontend` `size:M` `M2` · dep: T085, T053 · demo: no

**Outcome:** Layers come from the API catalog rather than a hardcoded TypeScript array.
**Notes:** The natural endpoint of `layers.config.ts`: the file keeps client-side **styling** defaults, the API provides the **inventory**. This is what lets a Worker publish a new dataset and have it appear without a frontend deploy, which is the extensibility PS67 asks for.
**AC:**
- [ ] Layer list fetched from `/catalog/layers`
- [ ] Style defaults still resolve from local config by layer id
- [ ] Unknown layers get sensible fallback styling
- [ ] New catalog row appears without a frontend change

---

### T087 - Dataset versioning in the catalog
`area:backend` `size:S` `M2` · dep: T067, T053 · demo: no

**Outcome:** The catalog records which version of each dataset is current.
**Notes:** Pairs with T067's version-in-path. Add `version` and `published_at` to `catalog_layers`. Makes "when was this data last updated" answerable, which PS67's update-cadence requirement asks for and which the agent should be able to answer.
**AC:**
- [ ] Version and published_at on catalog rows
- [ ] Object paths include the version
- [ ] API exposes both
- [ ] Displayed in the layer metadata panel

---

### T088 - Retile GSHHG coastlines with Planetiler
`area:data` `size:M` `M2` · dep: T075 · demo: no

**Outcome:** Coastlines are regenerated through the standard pipeline, with better low-zoom simplification.
**Notes:** The current coastlines came from the tippecanoe run and ship as separate per-band PMTiles rather than a merged archive. The documented z3 quality problem (Africa rendering near-parallelogram at whole-continent view) is **a source-data simplification issue, not a tile-manager bug** - the fix is a better simplification pass at low zoom, which is exactly what regenerating through Planetiler gives you. Also produces a single merged archive, simplifying the config.
**AC:**
- [ ] Single merged PMTiles archive, z0–14
- [ ] Attributes verified non-empty
- [ ] z3 continental shapes visibly better than current
- [ ] Frontend switches with a config change only


---

## E11 - Bathymetry and terrain

### T089 - GEBCO acquisition and subsetting
`area:data` `size:M` `M2` · dep: none · demo: no

**Outcome:** GEBCO bathymetry on disk, subset to the regions you actually serve.
**Notes:** Global GEBCO at 15 arc-second is large. Subset to the North Indian Ocean at full resolution plus a coarse global tier - two tiers covers both the detailed use case and the whole-globe view without paying for global high-resolution. Document the licence; GEBCO has specific attribution requirements.
**AC:**
- [ ] Regional full-resolution and global coarse tiers on disk
- [ ] Provenance and attribution documented
- [ ] Value range and no-data convention recorded

---

### T090 - GDAL raster pipeline to Terrain-RGB
`area:data` `size:L` `M2` · dep: T089 · demo: no

**Outcome:** Bathymetry encoded as Terrain-RGB tiles in MinIO.
**Notes:** **Entirely distinct from the vector PMTiles pipeline** - GDAL, not Planetiler. `rio-rgbify` or `gdal_translate` into the Mapbox Terrain-RGB encoding, then `pmtiles convert`. Terrain-RGB packs elevation into RGB with a known formula, so the shader decodes it exactly; this is what makes 3D terrain possible later.
**Trap:** bathymetry is negative. Confirm the encoding's base and interval handle your full negative range without clipping - clipped deep ocean will look like a flat plateau and it's easy to miss.
**AC:**
- [ ] Terrain-RGB PMTiles in MinIO under `raster/`
- [ ] Decode round-trips to correct depths including the deepest values
- [ ] Zoom range documented
- [ ] Catalog row with attribution

---

### T091 - Raster tile decoding in the tile worker
`area:rendering` `size:M` `M2` · dep: T090 · demo: no

**Outcome:** The worker pool can decode raster tiles alongside MVT.
**Notes:** `tile.worker.ts` currently decodes MVT only. Add a raster branch: `ImageBitmap` decode, Terrain-RGB unpack to a Float32 elevation array, transfer to the main thread. Reuse the existing pool, cache, and LOD machinery rather than building a parallel system - the tile manager's quadtree logic is format-agnostic.
**AC:**
- [ ] Worker decodes raster and vector tiles
- [ ] Terrain-RGB unpacks to correct elevations
- [ ] Reuses the existing pool and cache
- [ ] `DecodeResult` union type extended cleanly

---

### T092 - Bathymetry as a colour-mapped layer
`area:rendering` `size:M` `M2` · dep: T091, T018 · demo: no

**Outcome:** Ocean depth renders as a colour-mapped surface.
**Notes:** Simplest useful form of bathymetry and a lot of visual value for the effort. Add a `deep` colormap to the registry (cmocean has one). Depth is a scalar field like any other, so much of T017's machinery applies - the difference is that the source is tiled rather than a single grid.
**AC:**
- [ ] Bathymetry renders colour-mapped in both projections
- [ ] Colorbar shows depth in metres
- [ ] Composites under other layers correctly
- [ ] LOD works across the zoom range

---

### T093 - Contour line generation
`area:rendering` `size:L` `M2` · dep: T092 · demo: no

**Outcome:** Isobath contours at configurable depth intervals.
**Notes:** Marching squares on the decoded elevation array, in the worker so the main thread stays free. Standard oceanographic isobaths (200 m shelf break, 1000 m, 2000 m, 4000 m) as a preset. The shelf break in particular is a feature oceanographers look for and its presence signals domain awareness.
**AC:**
- [ ] Contours generated at configurable intervals
- [ ] Runs in the worker, no main-thread jank
- [ ] Preset for standard isobaths
- [ ] Labels at least at preset depths

---

### T094 - 3D terrain displacement
`area:rendering` `size:L` `M2` · dep: T091 · demo: no

**Outcome:** The globe surface displaces by bathymetry with an exaggeration factor.
**Notes:** The payoff for Terrain-RGB. Displace grid mesh vertices along the surface normal by decoded elevation × exaggeration, in the vertex shader. **Real bathymetry at 1:1 on a globe is invisible** - the ocean is ~4 km deep on a 6371 km radius. Exaggeration is not a gimmick here, it's a requirement, which is exactly why PS67 names the slider.
**AC:**
- [ ] Surface displaces by decoded elevation
- [ ] Exaggeration factor is a uniform
- [ ] Normals recomputed so lighting is correct
- [ ] Works in globe projection; degrades sanely in equirectangular

---

### T095 - Vertical exaggeration slider
`area:frontend` `size:S` `M2` · dep: T094 · demo: no

**Outcome:** The user controls terrain exaggeration interactively.
**Notes:** PS67 names this control explicitly. Range 1×–200×, logarithmic, defaulting somewhere useful (~50×). Uniform-only, so it's instant. Show the factor numerically - a judge will ask what the vertical scale is, and "50× exaggerated" is a much better answer than a guess.
**AC:**
- [ ] Slider drives the uniform with no re-upload
- [ ] Log scale, 1×–200×
- [ ] Current factor displayed numerically
- [ ] 1× position is discoverable

---

### T096 - Bathymetry-aware depth masking
`area:rendering` `size:M` `M2` · dep: T092, T017 · demo: no

**Outcome:** Model fields don't render below the sea floor.
**Notes:** A subtle correctness issue with real scientific weight: model output at 1000 m over a 200 m shelf is either fill or extrapolation, and rendering it as data is misleading. Sample bathymetry in the field shader and discard fragments where the selected depth exceeds the local sea floor. **This is the kind of detail that distinguishes a serious tool from a pretty one**, and an INCOIS reviewer will spot its absence.
**AC:**
- [ ] Field fragments below the sea floor are discarded
- [ ] Masked regions visually distinct from no-data
- [ ] Toggleable, since some users want raw model output
- [ ] Documented in the layer metadata panel

---

## E12 - Volumetric and 3D visualization

### T097 - Depth-slice stack view
`area:rendering` `size:L` `M2` · dep: T017, T019 · demo: no

**Outcome:** Multiple depth levels render simultaneously as stacked translucent surfaces.
**Notes:** PS67 asks for depth-resolved volumetric views; this is the most tractable first step and reads as genuinely 3D. Render N depth levels as offset surfaces, spacing driven by the exaggeration factor. **Back-to-front sorted, with `depthWrite: false`** or translucent surfaces composite wrongly. Limit to 5–8 visible slices; more is mush.
**AC:**
- [ ] Multiple depth levels render as stacked surfaces
- [ ] Correct back-to-front alpha compositing
- [ ] Slice count and spacing configurable
- [ ] Maintains interactive frame rate at 8 slices

---

### T098 - Vertical cross-section along a drawn path
`area:rendering` `size:L` `M2` · dep: T017, T020 · demo: no

**Outcome:** The user draws a line on the map and sees a depth-vs-distance section.
**Notes:** A standard and highly expected oceanographic view - arguably more useful day-to-day than volumetric rendering. Sample the field along the path at every depth level, render as a 2D heatmap: distance on X, depth on Y inverted, value as colour. Pairs naturally with the shape tool already in the tool rail.
**AC:**
- [ ] Drawing a path produces a section panel
- [ ] Depth axis inverted, distance in km
- [ ] Uses the active colormap and range
- [ ] Path is editable after drawing

---

### T099 - Shape tool: draw and select regions
`area:frontend` `size:M` `M2` · dep: T051 · demo: no

**Outcome:** Users draw rectangles, polygons, and lines on the map.
**Notes:** The shape tool in the vision's tool rail, and a prerequisite for cross-sections, area statistics, and region-scoped agent queries. Area selection is a first-class feature per vision §6.1, so it needs one-click access. Store geometry in lon/lat, not screen space, or it detaches on projection change.
**AC:**
- [ ] Rectangle, polygon, and line drawing
- [ ] Shapes stay attached across projection changes and rotation
- [ ] Editable and deletable after drawing
- [ ] Geometry available as GeoJSON to other features

---

### T100 - Area statistics for a drawn region
`area:frontend` `size:M` `M2` · dep: T099, T020 · demo: no

**Outcome:** A drawn region reports min, max, mean, and a histogram for the active field.
**Notes:** Turns selection from a navigation aid into an analysis tool, and produces exactly the kind of artifact that gets dragged into a paper in M4 - so design the output shape with `activities.payload` in mind.
**AC:**
- [ ] Stats computed over the drawn region only
- [ ] Histogram of value distribution
- [ ] Updates on depth or time change
- [ ] Exportable as an activity payload

---

### T101 - Isosurface extraction
`area:rendering` `size:L` `M2` · dep: T097 · demo: no

**Outcome:** A 3D surface at a constant value across the volume.
**Notes:** PS67 names isosurface extraction explicitly. Marching cubes over the (lat, lon, depth) volume, run in a worker. The physically meaningful case is the **thermocline** - the 20°C isotherm is a standard proxy for thermocline depth in the Indian Ocean, so ship it as a preset. That framing is worth more than a generic value slider.
**AC:**
- [ ] Marching cubes produces a closed surface for a given value
- [ ] Runs in a worker without blocking
- [ ] 20°C isotherm available as a preset
- [ ] Surface renders with correct lighting and normals

---

### T102 - Isosurface value control
`area:frontend` `size:S` `M2` · dep: T101 · demo: no

**Outcome:** The user picks the isosurface value and sees it update.
**Notes:** Slider across the field's value range, with the value shown in units. Debounce regeneration - marching cubes on every slider pixel will lock the UI. Show a "computing" state rather than freezing.
**AC:**
- [ ] Slider across the value range
- [ ] Regeneration debounced with a visible computing state
- [ ] Presets selectable
- [ ] Toggleable independently of other layers

---

### T103 - Volume ray-marching renderer
`area:rendering` `size:L` `M2` · dep: T097 · demo: no

**Outcome:** True volumetric rendering of the water column.
**Notes:** The most ambitious item in M2 and the most literal reading of PS67's "3D volumetric rendering." Ray-march a 3D texture in the fragment shader with a transfer function mapping value to colour and opacity. **Genuinely hard on a globe**, because the ray has to be traced in a curved coordinate system. Consider scoping it to a regional box view rather than the full globe - that's a defensible simplification and dramatically easier.
**AC:**
- [ ] Volume renders with a configurable transfer function
- [ ] Interactive frame rate at demo resolution
- [ ] Scoped region documented if not full-globe
- [ ] Degrades gracefully where unsupported

---

### T104 - Transfer function editor
`area:frontend` `size:M` `M2` · dep: T103 · demo: no

**Outcome:** Users edit the value→colour+opacity mapping for volume rendering.
**Notes:** Opacity is the important axis: volume rendering only reads well when most of the range is transparent and the feature of interest is opaque. An editable opacity curve over the colorbar is the conventional and correct UI.
**AC:**
- [ ] Editable opacity curve over the value range
- [ ] Colour from the active colormap
- [ ] Presets for common cases
- [ ] Updates the render live

---

### T105 - Animated particle flow for currents
`area:rendering` `size:L` `M2` · dep: T025 · demo: no

**Outcome:** Current fields render as animated flowing particles.
**Notes:** The single most visually striking thing you can build, and the reason "earth.nullschool.net" is famous. GPU particle system advected by the U/V field: positions in a texture, updated each frame by sampling velocity, with trails via a fading accumulation buffer. Respawn particles periodically to avoid convergence into sinks.
**AC:**
- [ ] Particles advect along the velocity field
- [ ] Trails render with fade
- [ ] Particle count configurable for performance
- [ ] Respawn prevents clustering
- [ ] Works in both projections

---

### T106 - Camera controls for 3D inspection
`area:rendering` `size:M` `M2` · dep: T094 · demo: no

**Outcome:** The camera can tilt to view terrain and volumes obliquely.
**Notes:** The existing camera handles rotation, zoom, and heading. 3D features need pitch, and pitch interacts with tile selection - `computeVisibleBounds()` already has a documented hypothesis that heading rotation may inflate the bbox and force a lower effective zoom. **Adding pitch will make that worse if the bounds computation isn't corrected first**, so verify against the tile debug overlay while implementing.
**AC:**
- [ ] Pitch control with sensible limits
- [ ] Visible bounds correct under pitch
- [ ] Effective zoom doesn't drop spuriously (verify via `TileDebugOverlay`)
- [ ] Reset-to-north-up control

---

### T107 - Performance budget and adaptive quality
`area:rendering` `size:M` `M2` · dep: T097, T103 · demo: no

**Outcome:** The app maintains interactive frame rate by reducing quality under load.
**Notes:** Volume rendering, particles, and terrain together will exceed integrated-GPU budgets. Measure frame time and degrade automatically: fewer ray-march steps, fewer particles, fewer slices. **On a demo laptop this is the difference between impressive and embarrassing**, and it must be automatic, not a settings panel nobody opens.
**AC:**
- [ ] Frame time measured continuously
- [ ] Quality reduces automatically below a threshold
- [ ] Recovers when load drops
- [ ] Manual override available

---

### T108 - WebGL capability detection and fallbacks
`area:rendering` `size:S` `M2` · dep: T107 · demo: no

**Outcome:** Missing extensions produce reduced functionality, not a broken app.
**Notes:** Check for WebGL2, float texture support, and `OES_texture_float_linear` at startup. Disable volume rendering rather than rendering black. PS67 requires platform independence, so a machine that can't do everything should still do the basics.
**AC:**
- [ ] Capabilities detected at startup
- [ ] Unsupported features disabled with an explanation
- [ ] Core 2D field rendering works everywhere WebGL2 does
- [ ] Capability report available for debugging

---

## E13 - Data ingestion framework

### T109 - Pluggable ingestion interface
`area:data` `size:M` `M2` · dep: T062 · demo: no
**Blocks:** T110–T115

**Outcome:** A defined interface for adding a new data source without touching the pipeline core.
**Notes:** PS67 explicitly requires that new variables or sources be addable "with minimal code change," and calls out modular architecture as a key gap in existing tools. Define a reader protocol: `discover() → variables`, `read(variable, time, depth) → ndarray`, `metadata() → dict`. Register readers by format. **This requirement is graded, so build it as an actual abstraction rather than claiming one exists.**
**AC:**
- [ ] Reader protocol defined and documented
- [ ] Registry maps format to reader
- [ ] Existing NetCDF path refactored to use it
- [ ] Adding a reader requires no core changes, demonstrated by T112

---

### T110 - Generic NetCDF/CF reader
`area:data` `size:M` `M2` · dep: T109 · demo: no

**Outcome:** Any CF-conventions NetCDF can be read without per-file code.
**Notes:** Use CF metadata to discover coordinate variables rather than hardcoding names - `standard_name`, `units`, and `axis` attributes exist precisely so tools don't have to guess. Handle the common irregularities: descending latitude, 0–360 versus -180–180 longitude, non-standard time units, scale/offset packing.
**AC:**
- [ ] Discovers variables and coordinates from CF attributes
- [ ] Handles descending lat and 0–360 lon
- [ ] Decodes time units correctly
- [ ] Applies scale_factor and add_offset
- [ ] Tested against at least two differently-structured files

---

### T111 - Delimited-text reader
`area:data` `size:S` `M2` · dep: T109 · demo: no

**Outcome:** ASCII/CSV observational data ingests through the same framework.
**Notes:** PS67 names ASCII/text formats alongside NetCDF, since INCOIS archives use both. Configurable column mapping to the platform/profile/level schema. Handles the usual mess: varying delimiters, header rows, missing-value sentinels.
**AC:**
- [ ] CSV/TSV with configurable column mapping
- [ ] Common missing-value sentinels handled
- [ ] Validation errors report line numbers
- [ ] Ingests into the observation schema

---

### T112 - Zarr reader
`area:data` `size:S` `M2` · dep: T109, T110 · demo: no

**Outcome:** Zarr stores read through the same interface, proving the abstraction works.
**Notes:** `zarr` is already a worker dependency. This issue exists as much to **validate T109's claim of extensibility** as for the capability itself - if adding Zarr requires touching pipeline core, the abstraction is wrong and better to find out now than in a review.
**AC:**
- [ ] Zarr stores read via the registry
- [ ] No changes to pipeline core required
- [ ] Chunked reads work for large arrays
- [ ] Documented as the worked example for adding readers

---

### T113 - Ingestion job runner with progress
`area:data` `size:M` `M2` · dep: T109 · demo: no

**Outcome:** Ingestion runs as a tracked job rather than a script somebody remembers to execute.
**Notes:** `apps/worker/main.py` is still a stub. A job table in Postgres with status, progress, and error; a CLI to enqueue and a loop to execute. A full queue (Celery, RQ) is overkill - a polling loop over a Postgres table is sufficient at this scale and far less to operate.
**AC:**
- [ ] Jobs queued, executed, and recorded with status
- [ ] Progress observable during long runs
- [ ] Failures record the error and allow retry
- [ ] CLI to enqueue, list, and inspect

---

### T114 - Copernicus Marine live proxy
`area:backend` `size:M` `M2` · dep: T010 · demo: no

**Outcome:** Model variables are fetched live from Copernicus instead of mirrored.
**Notes:** Vision §5.1.1 makes this binding: only small static reference data is self-hosted, everything large or continuously updated is proxied. `copernicusmarine` is already a worker dependency. Cache responses aggressively - the API is slow and rate-limited. **Credentials go in env, never in the repo.**
**AC:**
- [ ] Subset requests proxied to Copernicus
- [ ] Responses cached with a sensible TTL
- [ ] Credentials from env
- [ ] Upstream failure returns a clear error, not a timeout

---

### T115 - Argo GDAC incremental sync
`area:data` `size:M` `M2` · dep: T113, T036 · demo: no

**Outcome:** New Argo profiles ingest automatically on a schedule.
**Notes:** PS67 asks for real-time and delayed-mode observation support. Track the last-synced index, fetch only new profiles. Delayed-mode data **supersedes** real-time for the same cycle, so upsert on `(platform, cycle)` rather than insert, or you'll accumulate duplicate profiles with conflicting values.
**AC:**
- [ ] Incremental sync fetches only new profiles
- [ ] Delayed-mode supersedes real-time on the same cycle
- [ ] Runs as a scheduled job
- [ ] Sync state survives restart

---

### T116 - Glider data support
`area:data` `size:M` `M2` · dep: T111, T115 · demo: no

**Outcome:** Glider tracks and profiles ingest and display.
**Notes:** PS67 names gliders alongside Argo. The schema already supports them via `platform_type`. Gliders differ in that they produce a **continuous track**, so rendering should show the path, not just discrete points - that's the main frontend difference.
**AC:**
- [ ] Glider data ingests into the observation schema
- [ ] Tracks render as paths, not scattered points
- [ ] Profiles along the track are selectable
- [ ] Distinguished visually from Argo floats

---

### T117 - CTD and mooring support
`area:data` `size:S` `M2` · dep: T111 · demo: no

**Outcome:** CTD casts and mooring time series ingest and display.
**Notes:** CTD fits the existing profile schema directly. Moorings are different in kind - fixed position, long time series at fixed depths - so they need a time-series view rather than a depth-profile view. Worth noting that difference explicitly rather than forcing them into the profile chart.
**AC:**
- [ ] CTD casts ingest as profiles
- [ ] Moorings ingest as fixed-position time series
- [ ] Mooring view shows value-vs-time, not value-vs-depth
- [ ] Platform types visually distinct on the map

---

### T118 - Data validation and QC pipeline
`area:data` `size:M` `M2` · dep: T109 · demo: no

**Outcome:** Ingested data is validated before it reaches the catalog.
**Notes:** Range checks per variable (salinity of 200 PSU is an error, not data), monotonic depth, plausible positions, time within expected bounds. Reject with a clear reason rather than ingesting silently. **Bad data displayed confidently is worse than no data**, particularly for an operational audience.
**AC:**
- [ ] Per-variable range checks with configurable bounds
- [ ] Structural checks: monotonic depth, valid coordinates
- [ ] Rejections logged with reasons
- [ ] Validation report per ingestion job

---

### T119 - Ingestion documentation
`area:docs` `size:S` `M2` · dep: T109, T112 · demo: no

**Outcome:** A third party can add a new data source by following the docs.
**Notes:** This is the artifact that demonstrates PS67's extensibility requirement to a reviewer. Include a complete worked example - Zarr from T112 - not just an interface reference.
**AC:**
- [ ] Reader protocol documented with signatures
- [ ] Complete worked example end to end
- [ ] Catalog registration documented
- [ ] Common pitfalls section


---

## E14 - Projections and cartography

### T120 - Mollweide projection
`area:rendering` `size:M` `M2` · dep: none · demo: no

**Outcome:** Mollweide available as a third projection.
**Notes:** The vision names it specifically. `projection.glsl` already parameterises projections by a type uniform with A/B blending, so adding one means a new branch in the shader plus the CPU-side inverse in `projection-math.ts`. **Both must be added or tile selection breaks** - the CPU inverse is what decides which tiles to fetch. Mollweide is equal-area, which matters for honest area comparison, so it's worth mentioning in the UI.
**AC:**
- [ ] Renders correctly with blending to and from other projections
- [ ] CPU inverse implemented and agreeing with the shader
- [ ] Tile selection correct
- [ ] Listed in the projection switcher

---

### T121 - Mercator projection
`area:rendering` `size:M` `M2` · dep: T120 · demo: no

**Outcome:** Web Mercator available, matching the tile grid natively.
**Notes:** Worth having because it's what tiles are cut in, so it's the distortion-free case for tile rendering. Clamp latitude at ±85.0511 or the poles go to infinity. **Pair it with a note about area distortion** - an ocean platform showing Mercator without comment invites a fair criticism.
**AC:**
- [ ] Renders with correct latitude clamping
- [ ] CPU inverse implemented
- [ ] Polar regions handled gracefully
- [ ] UI notes area distortion

---

### T122 - Projection transition polish
`area:rendering` `size:S` `M2` · dep: T120, T121 · demo: no

**Outcome:** Switching projections animates smoothly between any pair.
**Notes:** The A/B blend uniform already exists and is a genuinely distinctive piece of the engine - most viewers snap between projections. Ensure every pair blends, not just the two currently wired. Ease the blend rather than using linear interpolation; linear looks mechanical.
**AC:**
- [ ] Any projection pair blends smoothly
- [ ] Eased timing
- [ ] Tiles stay correct mid-transition
- [ ] Interruptible mid-blend

---

### T123 - Graticule rendering
`area:rendering` `size:S` `M2` · dep: none · demo: no

**Outcome:** Lat/lon grid lines with adaptive spacing.
**Notes:** Expected in any serious geospatial tool. Spacing adapts to zoom (30° → 10° → 5° → 1°). Label at the edges. `geo/dms.ts` already exists for coordinate formatting, so reuse it rather than duplicating the formatting logic.
**AC:**
- [ ] Graticule with zoom-adaptive spacing
- [ ] Labelled using the existing DMS formatter
- [ ] Toggleable
- [ ] Correct in every projection

---

### T124 - Map skin framework
`area:rendering` `size:M` `M2` · dep: T086 · demo: no

**Outcome:** Alternative visual styles for the base map, selectable at runtime.
**Notes:** Vision §6.6, and the foundation for the M5 skin plugins. A skin is a named set of colour and style overrides applied over the layer registry defaults. Ship two: the current pastel basemap and a high-contrast dark one. The historical-cartography example from the vision is a plugin, not core.
**AC:**
- [ ] Skins defined as declarative style overrides
- [ ] Runtime switching without reload
- [ ] Two built-in skins
- [ ] Structure documented for plugin authors

---

### T125 - Scale bar and projection-aware measurement
`area:frontend` `size:S` `M2` · dep: T120, T121 · demo: no

**Outcome:** The scale bar is accurate in every projection.
**Notes:** `geo/scale-bar.ts` exists but was written against the current two projections. Mercator's scale varies with latitude and Mollweide's varies across the map, so a single scale bar is a **lie in both** unless it's computed at the viewport centre and labelled as such. Say so in a tooltip rather than quietly showing a wrong number.
**AC:**
- [ ] Scale computed at viewport centre per projection
- [ ] Tooltip notes where scale is valid
- [ ] Updates on projection change
- [ ] Metric and nautical units

---

## E15 - Authentication and accounts

### T126 - Password hashing and user creation
`area:backend` `size:S` `M2` · dep: T013 · demo: no

**Outcome:** Real users with securely hashed passwords.
**Notes:** Argon2id via `passlib`, or bcrypt if Argon2 causes install friction. Replaces the T031-era stub. **The route shapes from contracts §4.5 do not change**, which is the point of having frozen them - this is a backend-only change and the frontend is untouched.
**AC:**
- [ ] Passwords hashed with a modern KDF, never stored plain
- [ ] Registration validates email format and password strength
- [ ] Duplicate email returns a conflict, not a 500
- [ ] Existing auth routes unchanged

---

### T127 - Session management hardening
`area:backend` `size:S` `M2` · dep: T126 · demo: no

**Outcome:** Sessions are secure, expiring, and revocable.
**Notes:** `HttpOnly`, `Secure` in production, `SameSite=Lax`. Expiry with sliding renewal. Server-side session records so logout genuinely revokes rather than only clearing a cookie. Sessions table already exists in the schema.
**AC:**
- [ ] Cookies carry correct security flags
- [ ] Expired sessions rejected
- [ ] Logout revokes server-side
- [ ] Concurrent sessions per user supported

---

### T128 - Login and registration UI
`area:frontend` `size:M` `M2` · dep: T126, T059 · demo: no

**Outcome:** Users can register and sign in.
**Notes:** Deliberately deferred from M1 in favour of auto-login. Keep it minimal: email, password, a link between the two forms. **Do not build password reset yet** unless email delivery is already solved - a reset flow that silently fails is worse than no reset flow.
**AC:**
- [ ] Registration and login forms with validation
- [ ] Errors displayed inline, not as alerts
- [ ] Redirect to the app on success
- [ ] Session persists across reload

---

### T129 - Route protection and auth state
`area:frontend` `size:S` `M2` · dep: T128 · demo: no

**Outcome:** Unauthenticated users can't reach authenticated views.
**Notes:** SvelteKit `hooks.server.ts` plus a load guard. **Decide explicitly what's public** - the map with public layers is arguably a good public landing experience and supports PS67's outreach framing, while projects and papers are clearly private. Write that decision down.
**AC:**
- [ ] Protected routes redirect when unauthenticated
- [ ] Auth state available app-wide
- [ ] Public/private route split documented
- [ ] No flash of protected content before redirect

---

### T130 - User profile management
`area:frontend` `size:S` `M2` · dep: T128 · demo: no

**Outcome:** Users can view and edit their display name and details.
**Notes:** The profile icon already appears in the wireframes. Display name matters more than it sounds because it becomes the author attribution on published papers in M4.
**AC:**
- [ ] Profile view with editable display name
- [ ] Changes persist and reflect immediately
- [ ] Email shown but not editable
- [ ] Logout reachable from here

---

### T131 - Rate limiting on auth and chat endpoints
`area:backend` `size:S` `M2` · dep: T127 · demo: no

**Outcome:** Brute force and runaway chat usage are bounded.
**Notes:** Per-IP limits on login, per-user limits on chat. Chat limiting matters for a practical reason beyond abuse: **Groq's free tier will rate-limit you anyway**, and hitting your own limit with a clear message is far better than surfacing an opaque upstream 429.
**AC:**
- [ ] Login attempts limited per IP
- [ ] Chat requests limited per user
- [ ] 429 includes `Retry-After`
- [ ] Limits configurable via env

---

### T132 - Authorization checks on project resources
`area:backend` `size:M` `M2` · dep: T127, T167 · demo: no

**Outcome:** Users can only access their own projects, chats, and papers.
**Notes:** Enforce ownership at the query layer - filter by owner in the query rather than fetching then checking, which is the pattern that survives refactoring. **Every resource endpoint needs this, not just the obvious ones.** Add a test that asserts cross-user access fails for each resource type.
**AC:**
- [ ] Ownership enforced in queries, not post-hoc
- [ ] Cross-user access returns 404, not 403 (don't leak existence)
- [ ] Every project-scoped endpoint covered
- [ ] Test suite covers cross-user access per resource

---

### T133 - Secrets management and environment hygiene
`area:infra` `size:S` `M2` · dep: T007 · demo: no

**Outcome:** No secrets in the repository, and a documented path for production.
**Notes:** Audit for committed credentials - `admin@123` currently appears in `compose.yml` and `upload-tiles.sh`. **If anything real was ever committed, rotate it; git history keeps it forever.** Document where production secrets live for the M5 deployment.
**AC:**
- [ ] No credentials in tracked files
- [ ] `.env` gitignored, `.env.example` complete
- [ ] History audited for committed secrets
- [ ] Production secret handling documented

---

## E16 - Standards compliance

### T134 - CF conventions compliance for outputs
`area:data` `size:M` `M2` · dep: T110 · demo: no

**Outcome:** Any NetCDF the platform exports is CF-compliant.
**Notes:** PS67 names CF conventions explicitly. Correct `standard_name`, `units`, `axis`, and coordinate attributes; proper `_FillValue`. Validate with the `cfchecker` tool rather than by eye. This is the kind of requirement that's trivially verifiable by a reviewer, so it's cheap marks either way.
**AC:**
- [ ] Exported NetCDF passes cfchecker
- [ ] Standard names from the CF table
- [ ] Coordinates carry correct axis attributes
- [ ] Validation runs in CI on a sample export

---

### T135 - OGC WMS endpoint
`area:backend` `size:L` `M2` · dep: T017, T053 · demo: no

**Outcome:** Layers are consumable by external GIS clients over WMS.
**Notes:** PS67 names WMS explicitly and frames it as enabling interoperability with national data portals - a point worth making in a presentation. Implement `GetCapabilities`, `GetMap`, `GetFeatureInfo`. Render server-side from the same field artifacts. **Test against QGIS**, which is the client an INCOIS reviewer would actually use.
**AC:**
- [ ] GetCapabilities returns a valid document
- [ ] GetMap returns correct imagery for bbox/CRS/size
- [ ] GetFeatureInfo returns values at a point
- [ ] Verified working in QGIS

---

### T136 - OGC WCS endpoint
`area:backend` `size:L` `M2` · dep: T135 · demo: no

**Outcome:** Raw coverage data is retrievable over WCS.
**Notes:** Also named in PS67. WCS serves data rather than pictures, which is what a modeller actually wants. `DescribeCoverage` and `GetCoverage` with NetCDF and GeoTIFF output, reusing T134's CF-compliant writer.
**AC:**
- [ ] DescribeCoverage returns valid metadata
- [ ] GetCoverage returns correct subsets
- [ ] NetCDF and GeoTIFF output
- [ ] Subsetting by bbox, time, and depth

---

### T137 - OPeNDAP-style subsetting endpoint
`area:backend` `size:M` `M2` · dep: T136 · demo: no

**Outcome:** Programmatic subsetting by index or coordinate range.
**Notes:** PS67's expected-solution text mentions a REST/OPeNDAP backend. A full OPeNDAP server is disproportionate; a REST endpoint accepting the same subsetting semantics gets the practical benefit at a fraction of the cost. **Document it as OPeNDAP-inspired rather than claiming compliance** - overclaiming a standard is worse than a clear, honest simpler API.
**AC:**
- [ ] Subset by coordinate ranges and indices
- [ ] Returns NetCDF or JSON
- [ ] Documented with examples
- [ ] Positioned honestly relative to true OPeNDAP

---

### T138 - STAC catalog endpoint
`area:backend` `size:M` `M2` · dep: T053, T087 · demo: no

**Outcome:** The dataset catalog is discoverable as a STAC catalog.
**Notes:** STAC is the current standard for geospatial asset discovery and maps almost directly onto `catalog_layers`. Relatively little work for a real interoperability claim, and it's exactly the sort of thing that reads well against "open standards" in the problem statement.
**AC:**
- [ ] Valid STAC catalog and collection documents
- [ ] Items for each dataset version
- [ ] Passes stac-validator
- [ ] Linked from the API docs

---

### T139 - API documentation site
`area:docs` `size:M` `M2` · dep: T135, T138 · demo: no

**Outcome:** External developers can use the API without reading source.
**Notes:** FastAPI generates OpenAPI already; this is about adding the surrounding material - authentication, the tile URL conventions, the OGC endpoints, worked examples in Python and JavaScript. Ties directly to the plugin story in M5.
**AC:**
- [ ] All endpoints documented with examples
- [ ] Auth flow documented
- [ ] Tile and field URL conventions documented
- [ ] Worked examples in two languages


---

# M3 - AI & research workflow

*Weeks 4–6. The differentiators become real rather than illustrative.*

## E17 - Memory architecture and chat tree

### T140 - Per-branch memory instances
`area:ai` `size:L` `M3` · dep: T044 · demo: no

**Outcome:** Branching creates a genuinely separate memory instance, not just a visual fork.
**Notes:** Vision §7.2 defines a memory instance as one root-to-leaf path. T044 already assembles context from that path, so the structural work is done - this adds the **isolation semantics**: an isolated branch cannot see sibling content, a shared-context chat can. Store `memory_mode` on the tree root, not per node, since it's a property of the chat.
**AC:**
- [ ] Isolated branches cannot access sibling content, proven by test
- [ ] Shared-context chats see the full tree
- [ ] Mode stored at tree root
- [ ] Existing single-thread chats behave unchanged

---

### T141 - Memory mode selection at chat creation
`area:frontend` `size:S` `M3` · dep: T140 · demo: no

**Outcome:** Users choose isolated or shared memory when starting a chat.
**Notes:** Vision §7.3 specifies this as an up-front choice. The UI has to explain the difference in a sentence, because the concept is unfamiliar. "Branches explore independently" versus "branches share everything" is about the right level.
**AC:**
- [ ] Mode selectable at chat creation
- [ ] Explanation visible without a docs trip
- [ ] Mode indicated in the tree view
- [ ] Default is isolated

---

### T142 - Retroactive memory mode change
`area:ai` `size:M` `M3` · dep: T140 · demo: no

**Outcome:** A resolution to the vision's open question about changing mode after creation.
**Notes:** Vision §7.3 flags this as unspecified. **Recommended resolution: isolated → shared is allowed, shared → isolated is not.** Merging isolated branches has a defined meaning (concatenate contexts); splitting a shared context is ambiguous because you can't know which prior turns belonged to which branch. Implement the allowed direction and document the refusal with its reason.
**AC:**
- [ ] Isolated → shared merges contexts correctly
- [ ] Shared → isolated refused with an explanation
- [ ] Decision recorded in the vision/SRS
- [ ] Merge is undoable within the session

---

### T143 - Context window management and summarisation
`area:ai` `size:M` `M3` · dep: T044 · demo: no

**Outcome:** Long branches don't exceed the model's context window.
**Notes:** A deep branch will eventually exceed context. Summarise the oldest turns into a synthetic system message, preserving the most recent N verbatim. **Mark summarised regions visibly in the tree** - a user needs to know when the assistant is working from a summary rather than the original, especially in a research tool where precision matters.
**AC:**
- [ ] Context capped below the model limit
- [ ] Oldest turns summarised, recent preserved verbatim
- [ ] Summarised regions marked in the UI
- [ ] Token count observable

---

### T144 - Chat tree navigation and keyboard control
`area:frontend` `size:M` `M3` · dep: T050 · demo: no

**Outcome:** Large trees are navigable without hunting.
**Notes:** Pan and zoom on the tree, collapse subtrees, jump to a node by search, keyboard traversal. A tree with forty nodes is unusable without these, and a research session will reach forty nodes quickly.
**AC:**
- [ ] Pan, zoom, and fit-to-view
- [ ] Subtrees collapsible with a child count
- [ ] Search jumps to a node
- [ ] Arrow-key traversal

---

### T145 - Node editing and regeneration
`area:frontend` `size:M` `M3` · dep: T050 · demo: no

**Outcome:** Editing a prompt creates a new sibling branch rather than destroying history.
**Notes:** The natural fit for a tree model - where a linear chat overwrites on edit, a tree branches. This is a case where the tree structure is **obviously better than a thread** rather than merely different, which makes it worth demonstrating.
**AC:**
- [ ] Editing creates a sibling branch, original preserved
- [ ] Regenerate creates a sibling response
- [ ] Both visible in the tree
- [ ] Active branch clear after either

---

### T146 - Chat persistence and restore
`area:backend` `size:S` `M3` · dep: T043 · demo: no

**Outcome:** Trees survive reload and reconnect mid-stream.
**Notes:** Nodes already persist. This adds reliable restore, including a stream interrupted mid-response - save partial content and mark the node incomplete rather than leaving a phantom empty node.
**AC:**
- [ ] Full tree restores on reload
- [ ] Interrupted streams leave a marked incomplete node
- [ ] Incomplete nodes are resumable or discardable
- [ ] Active node restores with the tree

---

### T147 - Streaming markdown rendering
`area:frontend` `size:M` `M3` · dep: T048 · demo: no

**Outcome:** Assistant responses render formatted markdown as they stream.
**Notes:** Tables, lists, and code blocks matter for a research assistant discussing data. **Partial markdown is the hard part** - an unclosed code fence mid-stream must not corrupt the layout. Parse incrementally and render optimistically with a tolerant parser. Sanitise output.
**AC:**
- [ ] Markdown renders during streaming
- [ ] Partial constructs don't break layout
- [ ] Code blocks syntax-highlighted
- [ ] Output sanitised against injection

---

### T148 - LaTeX rendering in chat
`area:frontend` `size:S` `M3` · dep: T147 · demo: no

**Outcome:** Mathematical notation renders properly.
**Notes:** Oceanography is full of equations, and an assistant explaining stratification or geostrophic balance will produce them. KaTeX over MathJax for speed. Flows into M4, where papers need the same rendering.
**AC:**
- [ ] Inline and display math render
- [ ] Malformed LaTeX shows source, doesn't crash
- [ ] Renders during streaming
- [ ] Same renderer usable by the paper editor

---

### T149 - Chat export
`area:backend` `size:S` `M3` · dep: T146 · demo: no

**Outcome:** A branch or whole tree exports to markdown or JSON.
**Notes:** Research reproducibility, and a hedge against lock-in that's worth being able to point at. Markdown for a single branch reads naturally; JSON preserves tree structure. Include tool calls and their results - they're part of the reasoning record.
**AC:**
- [ ] Branch exports as readable markdown
- [ ] Full tree exports as structured JSON
- [ ] Tool calls and results included
- [ ] Export reachable from the tree UI

---

### T150 - Token usage and cost tracking
`area:backend` `size:S` `M3` · dep: T045 · demo: no

**Outcome:** Token consumption per user and project is recorded.
**Notes:** Necessary before paid APIs replace Groq. Record prompt and completion tokens per request against user and project. Surfaces later as a quota, and right now as the evidence for choosing a provider.
**AC:**
- [ ] Tokens recorded per request with user and project
- [ ] Aggregates queryable by period
- [ ] Provider and model recorded per request
- [ ] Cost estimate configurable per model

---

## E18 - Agent tool surface

### T151 - Tool registry and dispatch framework
`area:ai` `size:M` `M3` · dep: T047 · demo: no
**Blocks:** T152–T159

**Outcome:** Adding an agent tool is a registration, not a change to the chat loop.
**Notes:** T047 hardcoded one tool to get moving. Generalise now, before there are nine: a registry mapping name → schema + handler, with the loop iterating whatever is registered. Handlers declare whether they return data to the model, a `UiAction`, or both.
**AC:**
- [ ] Tools registered declaratively with schema and handler
- [ ] Chat loop iterates the registry
- [ ] Handlers can return data, a UiAction, or both
- [ ] Adding a tool requires no chat-loop changes

---

### T152 - `query_catalog` tool
`area:ai` `size:S` `M3` · dep: T151 · demo: no

**Outcome:** The agent can search available data rather than relying on the system prompt.
**Notes:** As the catalog grows, listing everything in the prompt stops scaling. A search tool lets the agent look things up. This is the point at which the catalog table pays off as the agent's world model rather than just a UI convenience.
**AC:**
- [ ] Agent searches catalog by variable, region, and time
- [ ] Returns structured results
- [ ] Handles no-match with a useful message
- [ ] System prompt shrinks to a summary plus this tool

---

### T153 - `get_field_statistics` tool
`area:ai` `size:M` `M3` · dep: T151, T100 · demo: no

**Outcome:** The agent can compute statistics over a region and report real numbers.
**Notes:** **The difference between an assistant that describes data and one that analyses it.** "What's the mean SST in the Bay of Bengal in June" should produce a computed number, not a recollection. Server-side computation over the field artifacts, returning min/max/mean/stddev.
**AC:**
- [ ] Statistics computed for region, depth, and time
- [ ] Results returned to the model as structured data
- [ ] Handles regions with no data
- [ ] Numbers verifiable against the UI's own statistics

---

### T154 - `create_plot` tool
`area:ai` `size:M` `M3` · dep: T151, T167 · demo: no

**Outcome:** The agent can produce a plot that becomes an activity.
**Notes:** Vision §10 step 3 describes asking the assistant to produce a visualization. The tool creates an `activities` row with a payload sufficient to re-render, and returns a `UiAction` to display it. **The activity is the thing that gets dragged into a paper in M4**, so the payload shape matters more than the rendering here.
**AC:**
- [ ] Agent creates plots as activity rows
- [ ] Payload sufficient for standalone re-render
- [ ] Plot appears in chat and is draggable
- [ ] Types supported: time series, profile, map snapshot

---

### T155 - `select_region` tool
`area:ai` `size:S` `M3` · dep: T151, T099 · demo: no

**Outcome:** The agent can select a map region on the user's behalf.
**Notes:** Vision §10 step 3 names this directly. Named regions resolve via the gazetteer, now backed by GeoBoundaries and EEZ data from T077 and T080 rather than three hardcoded entries. Creates a shape via the same path as manual drawing.
**AC:**
- [ ] Named regions resolve to geometry
- [ ] Selection appears as an editable shape
- [ ] Falls back gracefully on unknown regions
- [ ] Uses the same code path as manual drawing

---

### T156 - `search_observations` tool
`area:ai` `size:S` `M3` · dep: T151, T037 · demo: no

**Outcome:** The agent can find floats and profiles matching criteria.
**Notes:** "Find Argo floats in the Arabian Sea with profiles from last month" is a natural request and currently unanswerable. Returns summaries, not full profiles - dumping a hundred profiles into context is wasteful and unhelpful.
**AC:**
- [ ] Search by region, time, platform type, variable availability
- [ ] Returns summaries with counts
- [ ] Results selectable on the map
- [ ] Result count capped

---

### T157 - `compare_datasets` tool
`area:ai` `size:L` `M3` · dep: T153, T041 · demo: no

**Outcome:** The agent can quantify model-versus-observation agreement.
**Notes:** This is what an operational oceanographer actually wants, and it directly addresses PS67's stated gap about correlating model predictions with observational evidence. Compute bias, RMSE, and correlation between a model field and matching in-situ profiles. Standard skill metrics, standard names.
**AC:**
- [ ] Model and observations co-located correctly in space and time
- [ ] Bias, RMSE, and correlation computed
- [ ] Results returned as data and as a plot
- [ ] Insufficient matches reported rather than silently computed

---

### T158 - Tool call visualisation in chat
`area:frontend` `size:S` `M3` · dep: T151, T048 · demo: no

**Outcome:** Tool calls show what was run, with what arguments, and what came back.
**Notes:** Transparency matters for a research tool - a scientist should be able to verify the assistant's reasoning chain. Collapsed by default, expandable to show arguments and results. This also makes debugging your own agent dramatically easier.
**AC:**
- [ ] Calls show name and a summary, collapsed
- [ ] Expansion reveals arguments and results
- [ ] Failures shown with the error
- [ ] Duration displayed

---

### T159 - Tool error handling and retry
`area:ai` `size:S` `M3` · dep: T151 · demo: no

**Outcome:** A failing tool produces a useful message rather than a broken conversation.
**Notes:** Return errors **to the model** so it can explain or try differently, rather than aborting the turn. Cap retries per turn - a model that retries a malformed call indefinitely will exhaust your rate limit in one exchange.
**AC:**
- [ ] Tool errors returned to the model as results
- [ ] Retries capped per turn
- [ ] User sees what failed and why
- [ ] Malformed arguments handled without a crash

---

### T160 - Agent evaluation suite
`area:ai` `size:M` `M3` · dep: T157 · demo: no

**Outcome:** A fixed set of queries with expected behaviours, runnable on demand.
**Notes:** Prompt changes silently break things you thought worked. Twenty representative queries with assertions about which tools get called and roughly what comes back. **Not full CI** - it costs tokens and is non-deterministic - but runnable before a demo or a prompt change.
**AC:**
- [ ] At least 20 queries with expected tool-call patterns
- [ ] Runner reports pass/fail per case
- [ ] Failures show actual versus expected
- [ ] Documented as a pre-demo check

---

## E19 - Semantic search and vector index

### T161 - Vector index infrastructure decision
`area:backend` `size:S` `M3` · dep: none · demo: no
**Type:** `spike`

**Outcome:** A decision, recorded, on where embeddings live.
**Notes:** Vision §6.3 flags this as having **no home in the current architecture** - that open question is this issue. Options: `pgvector` on the existing Postgres, or a separate vector service. **Recommendation: pgvector.** You already run Postgres, the layer-metadata corpus is small (hundreds of rows, not millions), and a separate service is operational cost for no benefit at this scale. Record the reasoning so the SRS can cite it.
**AC:**
- [ ] Decision recorded with alternatives and reasoning
- [ ] Architecture diagram updated
- [ ] Migration path noted if scale changes
- [ ] SRS section updated

---

### T162 - pgvector setup and embedding storage
`area:backend` `size:S` `M3` · dep: T161 · demo: no

**Outcome:** Embeddings stored and queryable by similarity.
**Notes:** `CREATE EXTENSION vector`, an `embeddings` table keyed by entity type and id, HNSW index. Store the model name and dimension per row - changing embedding models later is otherwise an untraceable mess.
**AC:**
- [ ] pgvector installed, table created with HNSW index
- [ ] Model name and dimension stored per embedding
- [ ] Similarity query returns ranked results
- [ ] Migration is reversible

---

### T163 - Layer metadata embedding pipeline
`area:ai` `size:M` `M3` · dep: T162 · demo: no

**Outcome:** Every catalog layer has an embedding of its searchable text.
**Notes:** Embed title, description, variable, and units together. Regenerate on catalog change. **Decide the embedding provider explicitly** - Groq may not offer embeddings, so this may need a separate provider or a local sentence-transformer. A local model is entirely adequate for a few hundred short documents and removes a network dependency.
**AC:**
- [ ] Every catalog layer embedded
- [ ] Regeneration on catalog change
- [ ] Provider configurable
- [ ] Backfill script for existing rows

---

### T164 - Semantic layer search endpoint
`area:backend` `size:S` `M3` · dep: T163 · demo: no

**Outcome:** Layers are searchable by meaning rather than keyword.
**Notes:** Vision §6.3's "semantic search over the entire layers library." **Hybrid retrieval - semantic plus keyword - beats pure vector search** for this corpus, because exact matches on variable names like "SSS" matter and embeddings handle short acronyms poorly. Merge and rerank.
**AC:**
- [ ] Semantic search returns relevant layers for paraphrased queries
- [ ] Hybrid with keyword matching
- [ ] Results ranked with scores
- [ ] Under 200 ms

---

### T165 - Semantic search in the layer panel
`area:frontend` `size:S` `M3` · dep: T164, T052 · demo: no

**Outcome:** The layer panel's search bar becomes semantic.
**Notes:** Replaces T052's keyword filter. The visible test is that "how warm is the water" surfaces sea surface temperature. Debounce input, show a loading state, and fall back to keyword if the endpoint fails rather than showing nothing.
**AC:**
- [ ] Search uses the semantic endpoint
- [ ] Paraphrased queries find the right layers
- [ ] Debounced with a loading state
- [ ] Falls back to keyword on failure

---

### T166 - Embedding for chat and activity search
`area:ai` `size:M` `M3` · dep: T163, T167 · demo: no

**Outcome:** Past conversations and activities are searchable by meaning.
**Notes:** A research project accumulates dozens of branches, and finding "that thing about the thermocline" three weeks later is a real need. Embed chat nodes and activity descriptions. Scope search to the user's own projects - this is private content and the authorization rules from T132 apply.
**AC:**
- [ ] Chat nodes and activities embedded
- [ ] Search scoped to the requesting user's projects
- [ ] Results link to the node or activity
- [ ] Incremental embedding on creation


---

## E20 - Projects, work, and activity model

### T167 - Project CRUD
`area:backend` `size:M` `M3` · dep: T013, T132 · demo: no
**Blocks:** T154, T166, T168, T181

**Outcome:** Users create, list, rename, and delete projects.
**Notes:** A project is the vision's "work" - the umbrella tying activities together under one publishable output (§3). Everything downstream is project-scoped: chats, activities, papers. Soft-delete rather than hard, because deleting a project deletes a research history and an undo window is worth the column.
**AC:**
- [ ] Create, list, rename, delete
- [ ] Ownership enforced per T132
- [ ] Soft delete with a restore window
- [ ] Project list ordered by recent activity

---

### T168 - Project switcher and dashboard
`area:frontend` `size:M` `M3` · dep: T167 · demo: no

**Outcome:** Users move between projects and see recent work.
**Notes:** Vision §10 step 1: the flow starts by opening the app and beginning a new work, optionally naming it. The dashboard shows recent projects with activity counts and last-modified. **Keep the new-project path to one click** - naming can happen later, and forcing a title before any work begins is friction at exactly the wrong moment.
**AC:**
- [ ] Switcher lists projects with recent-first ordering
- [ ] New project in one click, naming optional
- [ ] Dashboard shows activity counts and last modified
- [ ] Current project always visible

---

### T169 - Activity logging framework
`area:backend` `size:M` `M3` · dep: T167 · demo: no
**Blocks:** T170, T182

**Outcome:** Atomic actions are recorded as activities with re-renderable payloads.
**Notes:** Vision §3 defines an activity as any single atomic action: plotting, selecting, asking, gathering. **The payload must be sufficient to re-render standalone** - if a plot activity stores only an image URL, living papers become impossible in M4. Store the parameters, not the picture.
**AC:**
- [ ] Activities recorded for plot, selection, chat exchange, import
- [ ] Payload sufficient for standalone re-render, verified by test
- [ ] Linked to project and optionally chat node
- [ ] Queryable by project and kind

---

### T170 - Activity timeline view
`area:frontend` `size:M` `M3` · dep: T169 · demo: no

**Outcome:** A chronological view of everything done in a project.
**Notes:** Makes the work/activity model visible rather than theoretical. Grouped by day, filterable by kind. **This is the source panel for M4's drag-and-drop authoring**, so the item components should be built as draggable from the start even before there's a target.
**AC:**
- [ ] Chronological list grouped by day
- [ ] Filterable by activity kind
- [ ] Items preview their content
- [ ] Items are draggable

---

### T171 - Activity re-render and restore
`area:frontend` `size:M` `M3` · dep: T169 · demo: no

**Outcome:** Clicking an activity restores the map state that produced it.
**Notes:** Turns the timeline into navigation rather than a log. "Take me back to what I was looking at" is a genuinely useful research affordance, and it's also the strongest possible test that T169's payloads are complete - if restore fails, the payload was insufficient and M4 would have failed later and more expensively.
**AC:**
- [ ] Clicking restores layer, depth, time, region, projection
- [ ] Restoration is visibly animated, not a jump cut
- [ ] Failures report what's missing from the payload
- [ ] Works for every activity kind

---

### T172 - Project-scoped chat trees
`area:backend` `size:S` `M3` · dep: T167, T146 · demo: no

**Outcome:** Chats belong to projects and are listed within them.
**Notes:** The schema already has `chat_nodes.project_id`. This makes it real in the UI: a project can hold several trees, each a separate line of enquiry. Switching projects switches the visible trees.
**AC:**
- [ ] Chats scoped to their project
- [ ] Multiple trees per project
- [ ] Chat list in the project view
- [ ] Switching projects switches chats

---

### T173 - Import images and files into a project
`area:frontend` `size:M` `M3` · dep: T167 · demo: no

**Outcome:** Users attach images and files as activities.
**Notes:** Vision §10 step 4 mentions importing images and embedding links. Store in MinIO under a project prefix. **Validate type and size server-side**, not only client-side. These become paper blocks in M4.
**AC:**
- [ ] Image and file upload with progress
- [ ] Stored under a project-scoped path
- [ ] Type and size validated server-side
- [ ] Appear as activities in the timeline

---

### T174 - External link embedding
`area:frontend` `size:S` `M3` · dep: T173 · demo: no

**Outcome:** Users save external links with fetched metadata.
**Notes:** Fetch title and description server-side, not from the browser - CORS makes the client-side version unreliable. **Sanitise and time-box the fetch**; a link-preview fetcher that follows arbitrary URLs is an SSRF risk, so block private address ranges.
**AC:**
- [ ] Links saved with fetched title and description
- [ ] Fetch server-side with a timeout
- [ ] Private address ranges blocked
- [ ] Failed fetch still saves the bare link

---

### T175 - Project export
`area:backend` `size:M` `M3` · dep: T169, T173 · demo: no

**Outcome:** A whole project exports as a portable archive.
**Notes:** Research data outliving the platform is a fair expectation and a good answer to a "what if this project ends" question. A zip with activities as JSON, chats as markdown, uploaded files, and a manifest. Not necessarily re-importable yet; the guarantee is that the content is recoverable.
**AC:**
- [ ] Zip contains activities, chats, files, manifest
- [ ] Manifest documents the structure
- [ ] Large projects stream rather than buffering
- [ ] Export reachable from project settings

---

## E21 - Knowledge graph and the "i" affordance

### T176 - Paper-to-layer reference tracking
`area:backend` `size:M` `M3` · dep: T167, T053 · demo: no

**Outcome:** The system records which layers each paper used.
**Notes:** Vision §6.5's foundation: published research accumulates references, which over time forms a graph connecting layers to the work that used them. Record the link when an activity referencing a layer enters a paper. **Build this in M3 even though papers are M4** - the graph only has value once it has history, so starting to accumulate early matters.
**AC:**
- [ ] Layer references recorded per paper
- [ ] Derived automatically from activity payloads
- [ ] Queryable in both directions
- [ ] Backfillable for existing papers

---

### T177 - Knowledge graph query endpoint
`area:backend` `size:S` `M3` · dep: T176 · demo: no

**Outcome:** "What work has used this layer" is answerable.
**Notes:** A scoped query, not a general graph database - the relationships are simple enough for SQL joins, and adding Neo4j here would be architecture for its own sake. Respect visibility: private papers must not appear in another user's results.
**AC:**
- [ ] Query returns papers using a given layer
- [ ] Visibility respected per requesting user
- [ ] Results ranked by recency or citation count
- [ ] Under 200 ms

---

### T178 - The "i" button UI
`area:frontend` `size:M` `M3` · dep: T177, T056 · demo: no

**Outcome:** Each layer exposes an information affordance surfacing related work.
**Notes:** Vision §6.5. Extends T056's metadata panel with a related-work section: papers, case studies, and other Thalassa work using this dataset. **This is explicitly a second-class feature** per vision §6.1, so it may sit behind an extra click - don't spend first-class real estate on it.
**AC:**
- [ ] "i" affordance on every layer card
- [ ] Panel shows metadata plus related work
- [ ] Related items link to the published paper
- [ ] Honest empty state when nothing references the layer

---

### T179 - Layer usage statistics
`area:backend` `size:S` `M3` · dep: T176 · demo: no

**Outcome:** Aggregate counts of how often each layer is used.
**Notes:** Feeds ranking in the "i" panel and in search, and gives you a real answer to "which datasets matter" for prioritising M2 work. Count additions to projects and inclusions in papers separately; they mean different things.
**AC:**
- [ ] Usage counted per layer for both event kinds
- [ ] Aggregates queryable by period
- [ ] Exposed in layer metadata
- [ ] No personally identifying information in aggregates

---

### T180 - Onboarding path for newcomers
`area:frontend` `size:M` `M3` · dep: T178 · demo: no

**Outcome:** A newcomer can find a starting point grounded in one concrete dataset.
**Notes:** Vision §6.5's stated purpose - giving someone new a foothold in a specific piece of data rather than the field as a whole. Also serves PS67's explicit public-outreach and science-communication framing, which is a section of the problem statement that's easy to ignore and cheap to address.
**AC:**
- [ ] Entry point from a layer to related explanatory work
- [ ] Suggested starting layers for newcomers
- [ ] Plain-language descriptions available per layer
- [ ] Discoverable without prior knowledge of the UI

---

# M4 - Research output

*Weeks 6–8. The living paper - the thing that makes this a research platform rather than a viewer.*

## E22 - Research paper authoring

### T181 - Paper CRUD and block model
`area:backend` `size:M` `M4` · dep: T013, T167 · demo: no
**Blocks:** T182–T195

**Outcome:** Papers exist as ordered block sequences.
**Notes:** Schema already defined in contracts §3. Blocks are ordered by an integer `position`. **Use fractional or gapped positions** (100, 200, 300) so inserting between blocks doesn't require renumbering the whole document on every drag - this is the difference between smooth reordering and a visible stutter.
**AC:**
- [ ] Create, read, update, delete papers
- [ ] Blocks ordered and reorderable
- [ ] Insert between blocks without full renumbering
- [ ] Ownership enforced

---

### T182 - Paper editor shell with split view
`area:frontend` `size:L` `M4` · dep: T181, T170 · demo: no

**Outcome:** The split-screen authoring view: work on the left, paper on the right.
**Notes:** Vision §8.2 and Figure 8. Left is chat and canvas, right is the document. Resizable divider, collapsible either way. **The split is the whole authoring concept** - it's what makes dragging from exploration into document feel natural rather than like a separate export step.
**AC:**
- [ ] Split view with resizable divider
- [ ] Either side collapsible
- [ ] State persists per project
- [ ] Usable at 1366 px

---

### T183 - Text block editing
`area:frontend` `size:L` `M4` · dep: T182 · demo: no

**Outcome:** Rich text blocks with academic formatting.
**Notes:** Headings, emphasis, lists, and LaTeX via T148's renderer. **Do not build a text editor from scratch** - use TipTap or ProseMirror. Rich text editing is a deceptively enormous problem and a hand-rolled one will consume the milestone.
**AC:**
- [ ] Headings, emphasis, lists, links
- [ ] Inline and display LaTeX
- [ ] Keyboard shortcuts for common formatting
- [ ] Paste from Word and Google Docs sanitised

---

### T184 - Drag-and-drop activity into paper
`area:frontend` `size:L` `M4` · dep: T182, T170 · demo: no

**Outcome:** Dragging an activity from the timeline or chat inserts it as a paper block.
**Notes:** Vision §8.2 is specific that authorship stays deliberate - the document contains **only what the researcher chose**, not an automatic transcript. Drag source is the timeline or a chat node; drop target is the paper. Show an insertion indicator. Reuses T055's drag pattern.
**AC:**
- [ ] Activities drag from timeline and chat
- [ ] Insertion point indicated during drag
- [ ] Block created at the drop position
- [ ] Dragging out removes the block
- [ ] Keyboard-accessible alternative exists

---

### T185 - Live activity blocks
`area:frontend` `size:L` `M4` · dep: T184, T171 · demo: no

**Outcome:** Embedded activities stay interactive inside the document.
**Notes:** Vision §8.1's central claim, and the reason the output isn't a PDF: a reader can pan a time series, rotate an embedded globe, or re-query a plot's data on the published page. **Renders from `activities.payload`, which is why T169's payload completeness mattered.** Lazy-render on scroll - twenty live globes mounting at once will not perform.
**AC:**
- [ ] Embedded plots remain interactive
- [ ] Embedded map views pan and rotate
- [ ] Lazy-rendered on scroll into view
- [ ] Degrades to a static preview if data is unavailable

---

### T186 - Model-derived layers as paper content
`area:frontend` `size:M` `M4` · dep: T185 · demo: no

**Outcome:** Layers produced by ML models embed in papers with provenance.
**Notes:** **The single integration point with PS66.** If Anirudh's reconstruction is exposed through the standard catalog and field contracts, it becomes a layer like any other and needs no special handling - which is the argument for those contracts existing. What it does need is **visible provenance**: model-derived values must be labelled as such wherever they appear, especially in a published paper.
**AC:**
- [ ] Model-derived layers embed like any other
- [ ] Provenance badge distinguishes derived from observed
- [ ] Model name and version in the metadata
- [ ] Labelling persists into published output

---

### T187 - Paper outline and navigation
`area:frontend` `size:M` `M4` · dep: T183 · demo: no

**Outcome:** A navigable outline generated from headings.
**Notes:** Papers get long. Auto-generated from heading blocks, with click-to-jump and reorder-by-dragging-outline-entries, which is far easier than dragging blocks in a long document.
**AC:**
- [ ] Outline generated from headings
- [ ] Click jumps to section
- [ ] Dragging outline entries reorders sections
- [ ] Current position highlighted while scrolling

---

### T188 - Paper templates
`area:frontend` `size:S` `M4` · dep: T181 · demo: no

**Outcome:** New papers can start from an academic structure.
**Notes:** Vision §8.1 specifies the structural conventions of an academic paper: title, abstract, sections, citations. A default template with those sections costs almost nothing and makes the output look like research rather than a blog post from the first keystroke.
**AC:**
- [ ] Default academic template with standard sections
- [ ] Blank option available
- [ ] Template chosen at creation
- [ ] Sections deletable

---

### T189 - Autosave and revision history
`area:backend` `size:M` `M4` · dep: T181 · demo: no

**Outcome:** Work is never lost and previous versions are recoverable.
**Notes:** Debounced autosave with a visible saved indicator. Periodic snapshots rather than every-keystroke versions - full operational history is a collaborative-editing feature and disproportionate here. **Losing a researcher's writing is unforgivable**, so err toward saving too often.
**AC:**
- [ ] Autosave with a visible status indicator
- [ ] Periodic snapshots retained
- [ ] Previous versions viewable and restorable
- [ ] Conflict handling if two tabs edit

---

### T190 - Paper preview mode
`area:frontend` `size:M` `M4` · dep: T185 · demo: no

**Outcome:** Authors see exactly what a reader sees.
**Notes:** Editing chrome hidden, embedded content live. Should match the published view precisely - a preview that differs from publication is worse than none, because it produces confident mistakes.
**AC:**
- [ ] Preview hides all editing affordances
- [ ] Embedded content interactive in preview
- [ ] Identical rendering to published view
- [ ] Toggle from the editor

---

### T191 - Figure captions and numbering
`area:frontend` `size:M` `M4` · dep: T185 · demo: no

**Outcome:** Embedded activities carry captions and automatic figure numbers.
**Notes:** Academic convention, and expected by the audience. Numbers renumber automatically on reorder. Cross-references in text ("see Figure 3") should update with them, which is the part that's easy to skip and immediately noticeable when missing.
**AC:**
- [ ] Captions editable per figure
- [ ] Automatic sequential numbering
- [ ] Renumbering on reorder
- [ ] In-text cross-references update

---

### T192 - Data availability statement generation
`area:backend` `size:M` `M4` · dep: T176, T191 · demo: no

**Outcome:** Papers automatically list the datasets they used with sources and licences.
**Notes:** Journals increasingly require a data availability statement, and you can generate one **for free** from the layer references already tracked in T176. A genuinely useful feature that falls out of earlier architecture rather than needing new work - worth calling out as such.
**AC:**
- [ ] Statement generated from tracked layer references
- [ ] Includes source, version, DOI, licence per dataset
- [ ] Editable after generation
- [ ] Regenerates when references change

---

### T193 - Paper search within a project
`area:frontend` `size:S` `M4` · dep: T181, T166 · demo: no

**Outcome:** Users find text within and across their papers.
**Notes:** Full-text search over block content. Postgres full-text search is entirely sufficient here - reaching for the vector index for literal text search would be the wrong tool.
**AC:**
- [ ] Full-text search across the user's papers
- [ ] Results show matching context
- [ ] Click jumps to the block
- [ ] Scoped to the requesting user

---

### T194 - Export paper to PDF
`area:backend` `size:M` `M4` · dep: T190 · demo: no

**Outcome:** Papers export as a conventional PDF.
**Notes:** Vision §8.1 is emphatic that the *primary* output is web-native, not a PDF - but institutional reality means people need a PDF to submit or circulate. **Live figures become static images with a link back to the interactive version**, which is the honest compromise and worth stating in the export itself.
**AC:**
- [ ] PDF export with academic layout
- [ ] Live figures rendered as static images
- [ ] Each figure links back to the interactive version
- [ ] Citations and references formatted correctly

---

### T195 - Export paper to LaTeX
`area:backend` `size:S` `M4` · dep: T194 · demo: no

**Outcome:** Papers export as LaTeX source.
**Notes:** The actual submission format for most oceanography journals. Blocks map to LaTeX structure, figures to `\includegraphics` plus files, citations to a `.bib`. Doesn't need to be perfect - it needs to save someone the retyping.
**AC:**
- [ ] LaTeX source with standard article structure
- [ ] Figures exported alongside and referenced
- [ ] Bibliography as a `.bib` file
- [ ] Compiles without manual fixes on a simple paper


---

## E23 - Citations and references

### T196 - Citation storage and BibTeX parsing
`area:backend` `size:M` `M4` · dep: T181 · demo: no

**Outcome:** References stored in a structured, BibTeX-compatible form.
**Notes:** Vision §8.3 makes citation management a **first-class requirement, not a nice-to-have**. Store as CSL-JSON internally (richer and better specified than BibTeX) and convert on import and export. Schema already has the `citations` table with a `csl_json` column.
**AC:**
- [ ] BibTeX import parses to CSL-JSON
- [ ] Export round-trips without loss for common entry types
- [ ] Duplicate keys detected on import
- [ ] Malformed entries report the line

---

### T197 - DOI resolution
`area:backend` `size:S` `M4` · dep: T196 · demo: no

**Outcome:** Pasting a DOI fetches complete metadata.
**Notes:** Vision §8.3 specifies DOI-based lookups. Crossref's API is free and needs no key. Cache resolutions - the same DOI will be requested repeatedly across papers. Handle the unresolvable case by storing the bare DOI rather than rejecting it.
**AC:**
- [ ] DOI resolves to full metadata via Crossref
- [ ] Resolutions cached
- [ ] Unresolvable DOIs stored bare with a warning
- [ ] Rate limits respected

---

### T198 - Inline citation insertion
`area:frontend` `size:M` `M4` · dep: T196, T183 · demo: no

**Outcome:** Authors insert citations into text, rendering as markers.
**Notes:** Vision §8.3's open question about mechanics inside an interactive web document - this issue resolves it. **Citations are inline nodes in the text model, not text**, so they survive editing around them and renumber automatically. Insert via a searchable picker over the reference library.
**AC:**
- [ ] Picker searches the reference library
- [ ] Citations render as inline markers
- [ ] Survive surrounding text edits
- [ ] Hovering shows full reference

---

### T199 - Reference list generation
`area:frontend` `size:M` `M4` · dep: T198 · demo: no

**Outcome:** A formatted reference list generated from cited works.
**Notes:** Only cited works appear, ordered per the style. Use `citeproc-js` with CSL styles rather than hand-formatting - there are thousands of journal styles and hand-rolling one is both wrong and pointless. Ship APA and a common oceanography style.
**AC:**
- [ ] List generated from citations actually used
- [ ] At least two CSL styles selectable
- [ ] Updates on citation change
- [ ] Correct ordering per style

---

### T200 - Citing other Thalassa papers
`area:backend` `size:M` `M4` · dep: T196, T176 · demo: no

**Outcome:** A Thalassa paper can cite another and be cited in return.
**Notes:** Vision §6.5 describes this accumulation as what forms the knowledge graph. Internal citations need stable identifiers - **assign each published paper a permanent id at publication and never reuse it**, even if the paper is later unpublished. Feeds T177's graph queries.
**AC:**
- [ ] Internal papers citable by permanent id
- [ ] Citation recorded bidirectionally
- [ ] Cited-by visible on the published paper
- [ ] Identifiers stable across edits and unpublishing

---

### T201 - Reference library management
`area:frontend` `size:M` `M4` · dep: T196, T197 · demo: no

**Outcome:** A per-project library of references, independent of any one paper.
**Notes:** References get reused across papers in a project, and re-adding the same DOI repeatedly is exactly the friction that makes people abandon a tool's citation features. Bulk `.bib` import, search, deduplication.
**AC:**
- [ ] Project-scoped library, searchable
- [ ] Bulk BibTeX import
- [ ] Duplicates detected and merged
- [ ] Usage shown per reference

---

## E24 - Publishing and sharing

### T202 - Publish with visibility control
`area:backend` `size:M` `M4` · dep: T181, T132 · demo: no

**Outcome:** Papers publish as public, unlisted, or private.
**Notes:** Vision §8.4. Unlisted means reachable by link but not indexed or listed. **Enforce visibility server-side on every read path**, and add `noindex` headers for unlisted - relying on obscurity alone is how unlisted content ends up in search results.
**AC:**
- [ ] Three visibility levels enforced server-side
- [ ] Unlisted reachable by link, excluded from listings
- [ ] `noindex` on unlisted responses
- [ ] Visibility changeable after publication

---

### T203 - Public paper view
`area:frontend` `size:M` `M4` · dep: T202, T190 · demo: no

**Outcome:** Published papers render at a stable public URL.
**Notes:** No auth required for public papers. **Server-side rendered for the text**, so it's shareable, previewable, and indexable, with interactive figures hydrating after load. A research paper that doesn't render without JavaScript is a poor citation target.
**AC:**
- [ ] Public URL renders without auth
- [ ] Text server-side rendered
- [ ] Figures hydrate to interactive after load
- [ ] Open Graph metadata for link previews

---

### T204 - Paper versioning and DOI-style permalinks
`area:backend` `size:M` `M4` · dep: T202 · demo: no

**Outcome:** Published papers have stable, versioned permalinks.
**Notes:** A citation must point at what was cited. Publishing after edits creates a new version; **old versions stay reachable**. Permalinks address a specific version, with an alias for latest. This is what makes T200's internal citations trustworthy rather than a moving target.
**AC:**
- [ ] Each publication creates an immutable version
- [ ] Old versions remain reachable
- [ ] Permalinks are version-specific
- [ ] "Latest version" alias exists

---

### T205 - Collaborator management
`area:backend` `size:M` `M4` · dep: T167, T132 · demo: no

**Outcome:** Project owners add collaborators with roles.
**Notes:** Vision §8.5 flags the collaboration model as an open question. **Recommended resolution: asynchronous with roles, not real-time co-editing.** Real-time collaborative editing is a large, self-contained engineering problem (CRDTs, presence, conflict resolution) and would consume the remaining time for a benefit a five-person research team barely needs. Roles: owner, editor, viewer. Record the decision and its reasoning.
**AC:**
- [ ] Collaborators added by email with a role
- [ ] Roles enforced on every project resource
- [ ] Owner can transfer ownership
- [ ] Decision against real-time editing documented

---

### T206 - Collaborator attribution on published papers
`area:frontend` `size:S` `M4` · dep: T205, T203 · demo: no

**Outcome:** Published papers list authors.
**Notes:** Vision §8.5's other open question. Authors are ordered, not alphabetical - author order carries meaning in academic publishing and getting it wrong is a real problem, not a cosmetic one. Let the owner set the order explicitly.
**AC:**
- [ ] Authors listed in an author-defined order
- [ ] Order editable by the owner
- [ ] Contributors distinguishable from authors
- [ ] Attribution persists in PDF and LaTeX export

---

# M5 - Extensibility, deployment, and hardening

## E25 - Plugin architecture

### T207 - Plugin manifest and registry
`area:backend` `size:L` `M5` · dep: T086, T139 · demo: no

**Outcome:** A defined plugin format with a registry.
**Notes:** Vision §9 flags manifest format, sandboxing, review, and versioning as all undefined, and warns that since plugins can introduce arbitrary data layers this has direct implications for the data-sourcing principle in §5. **Start with data-layer and skin plugins only** - declarative manifests, no arbitrary code. That covers both extension points the vision names while deferring the hard sandboxing problem honestly.
**AC:**
- [ ] Manifest schema defined and documented
- [ ] Registry stores plugins with version and author
- [ ] Validation rejects malformed manifests
- [ ] Scope limited to declarative plugins, documented

---

### T208 - Data layer plugins
`area:backend` `size:M` `M5` · dep: T207 · demo: no

**Outcome:** Third parties contribute data layers via manifest.
**Notes:** Vision §9's first extension point. A manifest declares source URL, format, variables, and styling; the platform validates and registers it. **The data-sourcing principle in §5.1.1 binds here** - a plugin must not cause bulk ingestion into your storage. Plugins reference external sources or must pass a size limit.
**AC:**
- [ ] Layers registerable by manifest
- [ ] Validation against the catalog schema
- [ ] Size and sourcing limits enforced
- [ ] Plugin layers visually marked as third-party

---

### T209 - Map skin plugins
`area:frontend` `size:M` `M5` · dep: T207, T124 · demo: no

**Outcome:** Third parties contribute visual styles.
**Notes:** Vision §9's second extension point and §6.6's historical-cartography example. Builds on T124's skin framework. Purely declarative style overrides - no code, so no sandboxing problem, which is why this is the right second plugin type.
**AC:**
- [ ] Skins installable by manifest
- [ ] Applied without reload
- [ ] Validation prevents broken styles
- [ ] Attribution shown for third-party skins

---

### T210 - Plugin review and trust model
`area:docs` `size:M` `M5` · dep: T207 · demo: no

**Outcome:** A documented process for accepting plugins.
**Notes:** Vision §9 flags review and trust as undefined. **This is a documentation and policy issue, not a code one**, and pretending otherwise is how supply-chain problems start. Define: who reviews, what's checked, how a plugin is revoked, how versions are pinned. Given declarative-only scope, the surface is small - say so explicitly and state what would need to change before code plugins were allowed.
**AC:**
- [ ] Review process documented with criteria
- [ ] Revocation path defined
- [ ] Version pinning documented
- [ ] Preconditions for allowing code plugins stated

---

## E26 - Deployment, performance, and hardening

### T211 - Production deployment
`area:infra` `size:L` `M5` · dep: T133, T129 · demo: no

**Outcome:** The full stack runs at a public URL.
**Notes:** The final deliverable requires a working link. Needs: a host, TLS, a managed or self-hosted Postgres with PostGIS, object storage, the Cache layer, and the API. **Object storage egress is the cost risk** - tiles are large and range requests are numerous, so check pricing before choosing. Cheapest credible path is a single VPS running the existing compose stack behind Caddy for automatic TLS.
**AC:**
- [ ] Full stack reachable at a public URL over HTTPS
- [ ] Database backed up on a schedule
- [ ] Deployment documented and reproducible
- [ ] Env-based config, no code changes between environments

---

### T212 - Deployment automation
`area:infra` `size:M` `M5` · dep: T211, T004 · demo: no

**Outcome:** Merging to `main` deploys automatically.
**Notes:** Extends the CI workflow. Build images, push, deploy, run migrations, health-check, roll back on failure. **Migrations before the new code starts**, and they must be backwards-compatible with the old code for the overlap window - this is the step people skip and then discover during a demo.
**AC:**
- [ ] Merge to main triggers deployment
- [ ] Migrations run before new code starts
- [ ] Health check gates the rollout
- [ ] Failed deployment rolls back automatically

---

### T213 - Performance audit and optimisation
`area:performance` `size:L` `M5` · dep: T211, T107 · demo: no

**Outcome:** Documented performance characteristics and fixes for the worst offenders.
**Notes:** Measure before optimising. Targets worth stating: time to first meaningful render under 3 s, tile fetch p95 under 200 ms, interactive frame rate above 30 fps with three layers. **The existing `TileDebugOverlay` is the right instrument for the rendering side** and should be kept behind a dev flag rather than deleted. Use the T073 tile metrics for the serving side.
**AC:**
- [ ] Baseline measurements recorded for each target
- [ ] Top three bottlenecks identified and addressed
- [ ] Targets met or the gap documented with reasoning
- [ ] Debug instrumentation retained behind a flag

---

### T214 - Accessibility audit
`area:frontend` `size:M` `M5` · dep: T211 · demo: no

**Outcome:** The interface is usable by keyboard and screen reader where meaningful.
**Notes:** Realistic scope: **panels, forms, controls, and the paper reading view must be accessible; the WebGL globe cannot meaningfully be.** The right answer for the canvas is an accessible alternative - the data available as a table, and text descriptions of active layers - not a claim that a 3D globe works with a screen reader. Say which parts are accessible and which are not.
**AC:**
- [ ] Keyboard navigation through all panels and forms
- [ ] Focus indicators visible throughout
- [ ] WCAG AA contrast verified
- [ ] Published papers screen-reader navigable
- [ ] Data-table alternative for the canvas
- [ ] Accessibility statement documents known limits

---

# Appendix A - Cut order

When you fall behind, cut in this order. Each entry says what you lose.

**Cut first, low cost:** T032 (hover readout), T034 (shortcuts), T123 (graticule), T058 (tablet layout), T121 (Mercator), T193 (paper search), T195 (LaTeX export), T201 (reference library).

**Cut second, visible but survivable:** T103/T104 (volume rendering and transfer function - T097 depth slices carry the 3D story), T105 (particle flow - striking, not required), T116/T117 (gliders, CTD, moorings - Argo alone satisfies the observation requirement), T137 (OPeNDAP), T138 (STAC), T149 (chat export), T175 (project export), T194 (PDF export).

**Cut third, painful:** T101/T102 (isosurfaces - named in PS67, so document the deferral explicitly), T136 (WCS - keep WMS), T166 (chat search), T180 (onboarding), T205/T206 (collaboration - already the vision's open question), T207–T210 (the entire plugin epic).

**Never cut:** T012 (contracts), T013 (schema), T017 (field rendering), T062 (data pipeline), T059 (design tokens), T044 (root-to-node context), T169 (activity payloads), T185 (live blocks), T211 (deployment).

The last two are worth expanding on. **T169** - if activity payloads are insufficient to re-render, T171, T185, and the entire living-paper concept fail, and you discover it in week seven. **T211** - a product with no link is not a delivered product, regardless of what's been built.

---

# Appendix B - Execution order by week

Creation order above is not execution order. This is.

| Week | Focus | Issues |
|---|---|---|
| 0 (days 1–2) | Foundation, unblock everyone | T001–T016, T059 |
| 0 (days 3–5) | Demo slice | T017–T063 |
| 1 | Finish M1 properly, start ingestion | remaining M1, T109–T113 |
| 2 | Tile serving, reference datasets | T064–T088 |
| 3 | Bathymetry, 3D, projections | T089–T108, T120–T125 |
| 4 | Auth, standards, ingestion completion | T114–T119, T126–T139 |
| 5 | Memory model, agent tools | T140–T160 |
| 6 | Semantic search, projects, activities | T161–T180 |
| 7 | Paper authoring | T181–T195 |
| 8 | Citations, publishing | T196–T206 |
| 9 | Deploy, plugins, hardening | T207–T214 |

**Two structural warnings.**

Week 9 is one week for deployment plus plugins plus hardening, and that is not enough. **Start T211 in week 5**, not week 9. Deploy something broken early and keep it deployed - the first deployment always surfaces problems, and surfacing them in week five is a fixable inconvenience while surfacing them in week nine is a failed delivery.

Weeks 7 and 8 are the paper editor, which is the largest single block of frontend work in the plan and the least parallelisable, since most of it depends on T182. If it slips, everything after it slips. Consider starting T181 and T182 in week 6 alongside the activity work they depend on.

---

# Appendix C - The dependency spine

Six issues gate disproportionate amounts of work. Track them individually.

1. **T012** (contract stubs) → gates 7 issues directly, most of M1 indirectly
2. **T013** (schema) → gates every backend feature
3. **T017** (field rendering) → gates all of E04, E12, and most of E03
4. **T062** (data pipeline) → gates real data everywhere
5. **T169** (activity payloads) → gates E20, E22, and the living-paper concept
6. **T181** (paper block model) → gates all of M4

If any of these is late, everything downstream is late by the same amount. They are worth assigning to whoever is most reliable rather than whoever is most available.

---

# Appendix D - Issues intentionally not in this backlog

Filed here so their absence is visibly a decision rather than an oversight. Worth creating each as a `deferred` issue with this reasoning in the body.

| Not doing | Why |
|---|---|
| Real-time collaborative editing | CRDT infrastructure is a project in itself; async roles cover the actual need (T205) |
| Mobile phone support | A 3D ocean platform on a 390 px screen is not a real use case; tablet is supported (T058) |
| Full OPeNDAP server implementation | Disproportionate; a REST subsetting API gets the practical benefit honestly (T137) |
| Code-executing plugins | Sandboxing untrusted code is a security project; declarative plugins cover both named extension points (T207) |
| Self-hosting bulk satellite or model archives | Explicitly forbidden by the data-sourcing principle in vision §5.1.1 |
| Custom user data upload | Vision §5.5 defers storage, validation, and privacy; needs an SRS decision before implementation |
| The coastline min-zoom spike bug | Three documented failed attempts; T088's Planetiler retile may resolve it as a side effect, and a fourth speculative fix without a live interactive repro is not a good use of time |
| PS66 model training and validation | Anirudh's workstream; integrates only through T186 |
| Password reset by email | Requires solved email delivery; a silently failing reset flow is worse than none |
| Multi-tenancy and organisations | No requirement; per-user projects with collaborators is sufficient |
