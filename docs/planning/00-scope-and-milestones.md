# Thalassa - Scope Freeze & Milestone Plan

**Problem statement:** SIH26PS67 (PS66 is handled separately by Anirudh and is out of scope for everything in this document).
**PS67 team:** Devesh, Nandini, Kashish, Adrika, Alok (5 people).
**Internals:** ~16 Sep 2026 - presentation with partial demos.
**Final delivery:** ~11 Nov 2026 - deployed, working product with a public link.

---

## 1. Why this document

Six weeks of parallel work by five people fails in exactly one way: two people make different reasonable assumptions about the same undefined thing, and you find out at integration time. This document - to remove that failure mode by deciding, up front, what is in scope, what is out, and in what order. `01-contracts.md` removes it a second way, by freezing the interfaces people build against.

Nothing here is permanent. But changing it should be a deliberate decision announced to the team, not a silent choice made inside a branch.

---

## 2. Grading reality check

PS67's official text names a specific feature list. Judges will score against it. Your vision document's differentiators (tree chat, living research papers) sit *on top* of that list, not instead of it.

**Explicitly required by PS67:**

| Requirement | Current status |
|---|---|
| 3D volumetric rendering of model fields across the water column | Not started - engine renders vector tiles only |
| Depth-slice navigation | Not started |
| Isosurface extraction | Not started |
| Time-step animation | Not started |
| Argo / glider / CTD overlay with click → depth-vs-variable profile chart | Not started |
| Customizable colorbar (palette, min/max, log/linear) | Not started |
| Layer opacity control | Not started |
| Vertical exaggeration slider | Not started |
| NetCDF + delimited-text ingestion, modular | Not started (deps installed, `main.py` is a stub) |
| Variable selector | Not started |
| Web-based, no client-side dependencies | Done in principle (SvelteKit + WebGL) |
| Plugin-style extensibility for new sensors/variables | Not started |
| OGC WMS/WCS, CF conventions | Not started |

**Your additions, beyond the required list:** tree-structured chat with per-branch memory, living interactive research papers, drag-and-drop authoring, BibTeX/DOI citations, the "i" knowledge graph, map skins, semantic layer search, collaboration.

**Judgement:** the required list is the spine. The additions are what makes you win rather than merely qualify. Both need to ship, but if something has to slip, it slips from the additions, never from the spine.

---

## 3. The critical path, named

Your globe engine renders **vector tiles only**. Every interesting PS67 feature needs **scalar field** rendering: a gridded value per lat/lon that gets colour-mapped. Nothing in the codebase does this today. It is the single longest pole and it blocks colorbar, depth slice, time animation, isosurfaces, and vertical exaggeration - five graded requirements behind one piece of work.

**It is cheaper than it looks.** The PS67 target region (5–30°N, 45–105°E at 0.25°) is a 240×100 grid. That is 96 KB as raw `Float32`. There is no tile pyramid needed, no LOD, no worker pool. It is one `THREE.DataTexture` uploaded whole, sampled by lon/lat in the fragment shader, with a colormap LUT applied in the same pass.

Consequences worth internalising:

- Colorbar min/max and log/linear become **shader uniforms**. Changing them costs zero re-fetch and is instant. Build the colorbar editor against uniforms, never against a re-render.
- Depth and time selection become **which texture is bound**. Pre-fetch a few neighbouring time steps and animation is smooth for free.
- WebGL2 caveat: `R32F` textures sample with `NEAREST` in core; linear filtering needs `OES_texture_float_linear`. Do not assume bilinear. Either request the extension and check, or do the bilinear tap manually in GLSL (four samples plus a `mix`). At 0.25° over a globe, nearest-neighbour will visibly stair-step at moderate zoom, so plan for the manual tap.

**This starts on day 1 and it is owned by Devesh.** Do not distribute it. It is the thing everything else waits on.

---

## 4. Architecture decisions confirmed

- **Martin and the Cache layer are in scope**, scheduled for M2 (not Sprint 0). Adding them this week costs days and buys nothing a demo can show. `01-contracts.md` defines the tile URL surface so that inserting the Cache layer later is a config change in the frontend and nothing more.
- **Until M2, the frontend fetches PMTiles directly from MinIO**, as it does today via `PUBLIC_TILES_BASE_URL`. This stays working; the Cache layer is introduced as a transparent proxy in front of the same paths.
- **The custom WebGL engine stays.** It is your differentiator for a 3D visualization problem statement, and replacing it with MapLibre or Cesium would throw away the best code in the repo. Accept that it means building markers, picking, rasters, and colorbars by hand.
- **The coastline min-zoom spike bug stays open and unassigned** through Sprint 0. Three documented failed attempts means it is a time sink, and it is cosmetic at demo zoom levels. Devesh to study later.
- **PS66 is entirely out of scope here.** If its model output later becomes a Thalassa layer, it enters through the same catalog/scalar-field contract as any other model product and requires no special handling.

---

## 5. Milestones

### M0 - Foundation (days 1–2, runs concurrently with M1)
CI, contracts frozen, DB schema, compose completed, auth stub. The goal is that no one is blocked on anyone else by end of day 2.

**Exit criteria:** every team member can `docker compose up`, run the web app and the API locally, and see mock data from every endpoint they need.

### M1 - Internals demo (days 1–5) - **HARD DEADLINE**
A scripted, presentable vertical slice. See §6.

**Exit criteria:** the storyboard in E4 can be performed end-to-end, twice in a row, without a crash or a manual database fix.

### M2 - Data & rendering core (weeks 2–4)
Martin + Cache layer. Remaining vector datasets (GeoBoundaries, EEZ, Rivers/Lakes, Dams via Martin). Bathymetry raster pipeline. Real NetCDF ingestion for the full variable set. Isosurfaces and vertical exaggeration. Variable/depth/time controls hardened. Real auth. OGC/CF compliance layer.

### M3 - AI & research workflow (weeks 4–6)
Tree-structured chat with real per-branch memory isolation. Agent tool-calling over the catalog. Semantic layer search (vector index - note this has no home in the current architecture and needs one). Activity logging.

### M4 - Research output (weeks 6–8)
Living paper editor, drag-and-drop composition, citation management, publish public/unlisted/private.

### M5 - Hardening & delivery (week 8+)
Deployment with a public link, plugin architecture, performance passes, docs, collaboration if time allows.

---

## 6. Internals scope freeze (5 days)

### IN - must demo

1. **Globe with coastlines.** Already working. Zero new work.
2. **One scalar field on the globe**, from your on-disk NetCDF: temperature, with a working colormap.
3. **Depth selector** - switching depth changes the rendered field.
4. **Time scrubber** - stepping/playing through time changes the rendered field.
5. **Colorbar** showing the active palette and range, with min/max adjustable.
6. **Salinity as a second variable**, proving the pipeline is not hardcoded to one product.
7. **Argo float markers** on the globe; clicking one opens a depth-vs-temperature profile chart.
8. **AI chat panel** (Groq, GPT-OSS-120B) that answers questions *and* performs one real tool call - "show me temperature at 100 m for the Bay of Bengal" changes the map.
9. **Chat tree visible in the UI** - the branching visual. Memory isolation may be faked for internals; the *shape* is what communicates the idea.
10. **A polished slide deck and a rehearsed click path.**

### OUT - explicitly not in internals

Living papers, drag-and-drop authoring, citations, publishing, collaboration, plugins, map skins, semantic search, the "i" knowledge graph, isosurfaces, vertical exaggeration, real auth, Martin, the Cache layer, GeoBoundaries/EEZ/Rivers/Dams/bathymetry datasets, OGC endpoints, mobile support, and the coastline spike bug.

Say these out loud in the presentation as roadmap items. "Deliberately deferred, here's when" reads as competence. Silence reads as an oversight.

### Demo-safety rules

Because this round is presentation-graded, these outrank correctness for the next five days:

- **Pre-bake every artifact the demo touches.** No live Copernicus downloads, no on-the-fly regridding. Everything the click path hits is already in MinIO and Postgres before the laptop opens.
- **Seed script must be idempotent and fast.** If a demo goes wrong, one command restores a known-good state in under a minute.
- **Record a screen capture of the working path by day 4.** If the laptop or projector betrays you, you still have a demo.
- **Freeze on day 5 morning.** No merges after that except demo-path bug fixes.

---

## 7. Lane assignments for Sprint 0

| Person | Lane | Rationale |
|---|---|---|
| **Devesh** | Scalar field rendering (critical path) + contracts + CI | Longest pole, needs the person who knows the engine |
| **Kashish** | Frontend UI: controls, panels, markers, profile chart | Frontend-heavy, builds against Devesh's rendering API |
| **Adrika** | FastAPI endpoints + Groq chat + tool-calling | Bridges backend and AI, both needed for the demo |
| **Alok** | NetCDF → derived artifacts → MinIO/Postgres | Analytics leaning, cleanly separable, no frontend dependency |
| **Nandini** | Design system, screen designs, storyboard, slide deck | Presentation round makes this the highest-leverage lane |

**Nandini must run one sprint ahead.** If she designs the screen the week it is built, she is the bottleneck. For Sprint 0 specifically, the design system tokens (E1) are needed on day 1, and the demo storyboard (E4) is needed by day 2 so everyone knows which paths must be solid.

**Cross-lane rule:** if you need something from another lane that does not exist yet, build against the mock from `01-contracts.md` and open a blocking issue. Never wait, and never invent your own shape.

---

## 8. Working agreements

- **Branching:** `main` protected. Branch per issue: `<lane>/<issue-number>-short-slug`, e.g. `feat/42-colorbar-uniforms`.
- **PRs:** must reference `Closes #N`. CI green required. One approval from anyone. Self-merge allowed after approval - with five people and five days, a strict review queue will stall you.
- **Issue sizing:** half a day to two days. Anything estimated over two days gets split before work starts. Anything under two hours gets folded into a neighbouring issue - the coordination overhead exceeds the work.
- **Daily sync:** 15 minutes, fixed time. Three questions only: what landed, what is blocked, what is at risk for the demo.
- **All work on WSL/ext4.** Never `/mnt/c` or `/mnt/p`. This is already a documented 10–40× penalty on this project.
- **Do not refactor outside your issue's scope** during Sprint 0. There will be time in M2.
