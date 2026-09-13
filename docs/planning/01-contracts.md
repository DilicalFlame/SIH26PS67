# Thalassa - Frozen Contracts v1

**Status:** frozen for Sprint 0. Changes require an announcement to the whole team, not a silent edit inside a branch.

This is the document that actually enables parallel work. Everyone builds against these shapes. If the real implementation does not exist yet, build against a mock of the shape defined here and open a blocking issue.

---

## 1. Environment variables

Single `.env` at repo root, consumed by compose. Per-app `.env.example` files stay in sync with this table.

```bash
# --- Postgres ---
POSTGRES_DB=thalassa
POSTGRES_USER=thalassa
POSTGRES_PASSWORD=admin@123
POSTGRES_HOST=localhost          # "postgres" inside compose network
POSTGRES_PORT=5432
DATABASE_URL=postgresql+asyncpg://thalassa:admin@123@localhost:5432/thalassa

# --- MinIO ---
MINIO_ENDPOINT=http://localhost:9000
MINIO_ROOT_USER=thalassa
MINIO_ROOT_PASSWORD=admin@123
MINIO_BUCKET=tiles

# --- Web (must be PUBLIC_ prefixed to reach client code) ---
PUBLIC_TILES_BASE_URL=http://localhost:9000/tiles
PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
WEB_ORIGIN=http://localhost:5173

# --- API ---
API_HOST=0.0.0.0
API_PORT=8000
SESSION_SECRET=dev-only-change-me
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
```

**Rule:** `PUBLIC_TILES_BASE_URL` is the only place the frontend learns where tiles live. When the Cache layer lands in M2, this value changes from the MinIO origin to the Cache origin and nothing else in the frontend changes. Do not hardcode `localhost:9000` anywhere.

---

## 2. Object storage layout (MinIO, bucket `tiles`)

```
tiles/
  vector/<layer_id>/<layer_id>.pmtiles          # existing convention, unchanged
  raster/<layer_id>/...                         # reserved, M2 (bathymetry)
  fields/<product_id>/<variable>/
      meta.json                                 # ScalarFieldMeta, see §4.3
      d<depth_index>_t<time_index>.f32          # raw little-endian Float32 grid
```

**Field artifact naming is positional, not value-based.** `d3_t17.f32` means depth index 3 and time index 17 as listed in `meta.json`'s `depths` and `times` arrays. This keeps filenames stable when a depth level or timestamp is re-expressed, and keeps URL construction on the client trivial.

**Grid byte order:** row-major, starting at the **north-west** corner, moving east along a row, then south to the next row. `width * height * 4` bytes exactly. No header, no padding. NaN encodes missing data (land, below-bathymetry, no-coverage). The shader discards NaN fragments.

Rationale for raw `Float32` over PNG/NetCDF-over-HTTP: a 240×100 grid is 96 KB, decodes to a `Float32Array` with zero parsing, uploads straight into a `THREE.DataTexture`, and preserves full precision so colorbar min/max can be changed client-side without re-fetch.

---

## 3. Database schema v1 (PostgreSQL + PostGIS)

Alembic-managed. Every table gets `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` unless stated otherwise.

```sql
-- Identity ------------------------------------------------------------
users (
  id, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  password_hash TEXT,                    -- NULL for the Sprint-0 seeded user
  created_at, updated_at
)

sessions (
  id, user_id FK->users ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at
)

-- Catalog: the "what data do I have, and where" table -----------------
catalog_layers (
  id,
  layer_id TEXT UNIQUE NOT NULL,         -- stable slug, e.g. "glorys_thetao"
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- 'vector' | 'scalar_field' | 'point_collection'
  variable TEXT,                         -- 'temperature', 'salinity', NULL for vector
  units TEXT,
  description TEXT,
  bbox GEOMETRY(Polygon, 4326),
  depths DOUBLE PRECISION[],             -- metres, ascending; empty for 2D layers
  times TIMESTAMPTZ[],                   -- ascending; empty for static layers
  value_min DOUBLE PRECISION,            -- default colorbar domain
  value_max DOUBLE PRECISION,
  default_colormap TEXT DEFAULT 'thermal',
  object_path TEXT,                      -- MinIO path, relative to bucket root
  source TEXT, attribution TEXT, licence TEXT,
  created_at, updated_at
)

-- Observations --------------------------------------------------------
platforms (
  id, platform_id TEXT UNIQUE NOT NULL,  -- WMO id for Argo
  platform_type TEXT NOT NULL,           -- 'argo' | 'glider' | 'ctd' | 'mooring'
  name TEXT, created_at
)

profiles (
  id, platform_id FK->platforms ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  cycle_number INTEGER,
  created_at
)
-- INDEX profiles_location_gix ON profiles USING GIST (location);
-- INDEX profiles_observed_at_idx ON profiles (observed_at);

profile_levels (
  id, profile_id FK->profiles ON DELETE CASCADE,
  depth DOUBLE PRECISION NOT NULL,
  temperature DOUBLE PRECISION,
  salinity DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  qc_flag SMALLINT
)
-- INDEX profile_levels_profile_idx ON profile_levels (profile_id, depth);

-- Research workflow ---------------------------------------------------
projects (                               -- a "work" in the vision doc
  id, owner_id FK->users, title TEXT NOT NULL, description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',   -- 'private'|'unlisted'|'public'
  created_at, updated_at
)

chat_nodes (
  id, project_id FK->projects ON DELETE CASCADE,
  parent_id FK->chat_nodes ON DELETE CASCADE,   -- NULL for root
  role TEXT NOT NULL,                    -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  tool_calls JSONB,                      -- see §4.6
  memory_mode TEXT NOT NULL DEFAULT 'isolated', -- 'isolated' | 'shared'
  created_at
)
-- INDEX chat_nodes_parent_idx ON chat_nodes (parent_id);

activities (                             -- the atomic unit that gets dragged into a paper
  id, project_id FK->projects ON DELETE CASCADE,
  chat_node_id FK->chat_nodes,           -- nullable
  kind TEXT NOT NULL,                    -- 'plot'|'selection'|'chat_exchange'|'image'|'link'
  payload JSONB NOT NULL,                -- kind-specific; must be enough to re-render
  created_at
)

-- M4, defined now so migrations are additive, not rewrites -------------
papers (
  id, project_id FK->projects ON DELETE CASCADE,
  title TEXT NOT NULL, abstract TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  published_at TIMESTAMPTZ, created_at, updated_at
)

paper_blocks (
  id, paper_id FK->papers ON DELETE CASCADE,
  position INTEGER NOT NULL,
  block_type TEXT NOT NULL,              -- 'heading'|'text'|'activity'|'citation_list'
  content JSONB NOT NULL,
  activity_id FK->activities,            -- nullable
  created_at, updated_at
)

citations (
  id, paper_id FK->papers ON DELETE CASCADE,
  bibtex_key TEXT NOT NULL, doi TEXT, csl_json JSONB NOT NULL,
  created_at
)
```

**Two notes.** `catalog_layers` is the table the AI agent reasons over when asked "what data do I have?" - it is not optional plumbing, it is the agent's world model, so populate it properly from day 1. And `activities.payload` must contain enough state to re-render the activity standalone; if a plot activity only stores an image URL, living papers become impossible in M4.

---

## 4. HTTP API v1

Base path `/api/v1`. JSON unless stated. All errors use:

```json
{ "error": { "code": "not_found", "message": "Layer 'foo' does not exist" } }
```

Codes: `bad_request`, `unauthorized`, `not_found`, `conflict`, `upstream_error`, `internal`.

### 4.1 Health

```
GET /healthz -> 200 { "status": "ok", "db": true, "storage": true }
```

### 4.2 Catalog

```
GET /catalog/layers?kind=&variable= -> 200 LayerDescriptor[]
GET /catalog/layers/{layer_id}      -> 200 LayerDescriptor
```

```ts
interface LayerDescriptor {
  layerId: string;
  title: string;
  kind: 'vector' | 'scalar_field' | 'point_collection';
  variable: string | null;
  units: string | null;
  description: string | null;
  bbox: [number, number, number, number];   // [west, south, east, north]
  depths: number[];                          // metres, ascending, [] if 2D
  times: string[];                           // ISO 8601 UTC, ascending, [] if static
  valueMin: number | null;
  valueMax: number | null;
  defaultColormap: string;
  objectPath: string | null;                 // relative to tiles bucket root
  source: string | null;
  attribution: string | null;
}
```

### 4.3 Scalar fields

```
GET /fields/{layer_id}/meta -> 200 ScalarFieldMeta
```

```ts
interface ScalarFieldMeta {
  layerId: string;
  variable: string;
  units: string;
  width: number;                  // grid columns
  height: number;                 // grid rows
  bbox: [number, number, number, number];
  depths: number[];
  times: string[];
  valueMin: number;               // across the whole product
  valueMax: number;
  noDataValue: 'NaN';
  gridUrlTemplate: string;        // e.g. "{tilesBase}/fields/glorys_thetao/temperature/d{d}_t{t}.f32"
}
```

The client substitutes `{d}` and `{t}` with **array indices**, not values. `gridUrlTemplate` may point at MinIO directly (Sprint 0) or at the Cache layer (M2) - the client does not care which.

```
GET /fields/{layer_id}/grid.bin?depth_index=&time_index=
    -> 200 application/octet-stream, raw Float32 grid
```

Provided as a fallback and for server-side consumers. **The browser should normally fetch `.f32` objects directly via `gridUrlTemplate`** and not route grids through FastAPI, for the same reason PMTiles range requests bypass it.

### 4.4 Observations

```
GET /observations/platforms
    ?bbox=w,s,e,n &start=<iso> &end=<iso> &type=argo &limit=500
    -> 200 GeoJSON FeatureCollection
```

Each feature: `Point` geometry, properties `{ platformId, platformType, name, profileCount, latestObservedAt }`.

```
GET /observations/platforms/{platform_id}/profiles?start=&end=&limit=
    -> 200 ProfileSummary[]

GET /observations/profiles/{profile_id}
    -> 200 Profile
```

```ts
interface ProfileSummary {
  profileId: string;
  observedAt: string;
  lat: number; lon: number;
  cycleNumber: number | null;
  maxDepth: number;
}

interface Profile {
  profileId: string;
  platformId: string;
  observedAt: string;
  lat: number; lon: number;
  levels: {
    depth: number;
    temperature: number | null;
    salinity: number | null;
    pressure: number | null;
  }[];                            // ascending by depth
}
```

### 4.5 Auth

```
POST /auth/login    { email, password } -> 200 { user } + Set-Cookie session
POST /auth/logout                        -> 204
GET  /auth/me                            -> 200 { user } | 401
```

Sprint 0: one seeded user, password check may be a stub. The **shape is frozen now** so the frontend never rewrites its auth calls.

### 4.6 Chat

```
POST /projects/{project_id}/chat/nodes
     { parentId: string | null, content: string }
     -> 200 text/event-stream (SSE)
```

SSE event types, one JSON object per `data:` line:

```ts
{ type: 'node_created', nodeId: string, parentId: string | null, role: 'user' }
{ type: 'token',        nodeId: string, text: string }
{ type: 'tool_call',    nodeId: string, tool: string, args: object }
{ type: 'ui_action',    action: UiAction }
{ type: 'done',         nodeId: string }
{ type: 'error',        code: string, message: string }
```

```
GET /projects/{project_id}/chat/tree -> 200 ChatNode[]   // flat; client builds the tree
```

```ts
interface ChatNode {
  nodeId: string;
  parentId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: { tool: string; args: object }[] | null;
  createdAt: string;
}
```

**Active context rule (from the vision doc, now binding):** the context sent to the LLM for a node is the **root-to-node path**, not the whole tree. Implement this in one function, `build_context(node_id) -> list[Message]`, and call it from exactly one place.

### 4.7 Agent tool surface

Sprint 0 ships exactly one tool. The frontend handles `UiAction` objects generically so adding tools later needs no frontend change.

```ts
type UiAction =
  | { type: 'set_map_layer';
      layerId: string;
      depthIndex?: number;
      timeIndex?: number;
      colormap?: string;
      valueRange?: [number, number]; }
  | { type: 'fly_to';
      bbox: [number, number, number, number]; }
  | { type: 'open_profile';
      profileId: string; };
```

Tool definition given to Groq:

```json
{
  "name": "set_map_layer",
  "description": "Display a data layer on the map at a given depth and time.",
  "parameters": {
    "type": "object",
    "properties": {
      "layer_id":    { "type": "string" },
      "depth_meters":{ "type": "number" },
      "time":        { "type": "string", "description": "ISO 8601 date" },
      "region":      { "type": "string", "description": "Named region, e.g. 'Bay of Bengal'" }
    },
    "required": ["layer_id"]
  }
}
```

The **backend** resolves `depth_meters` to the nearest `depth_index`, `time` to the nearest `time_index`, and named regions to a bbox, then emits a `ui_action`. The model never sees indices, and the frontend never does fuzzy matching.

---

## 5. Frontend contracts

### 5.1 Extended layer config

`apps/web/src/lib/tiles/layers.config.ts` gains a discriminated union. The existing `TileLayerConfig` is unchanged so nothing currently working breaks.

```ts
export type AnyLayerConfig = TileLayerConfig | ScalarFieldLayerConfig | PointLayerConfig;

export interface ScalarFieldLayerConfig {
  kind: 'scalar_field';
  id: string;
  meta: ScalarFieldMeta;         // fetched from /fields/{id}/meta
  colormap: string;
  valueRange: [number, number];
  opacity: number;
  visible: boolean;
  depthIndex: number;
  timeIndex: number;
}

export interface PointLayerConfig {
  kind: 'point_collection';
  id: string;
  endpoint: string;              // API path, queried by bbox
  color: number;
  pointSizePx: number;
  visible: boolean;
}
```

### 5.2 Rendering module interface

`ScalarFieldRenderer` is what Kashish's UI controls call. Devesh owns the implementation; **this signature is frozen on day 1** so UI work starts before the renderer exists.

```ts
export interface ScalarFieldRenderer {
  mount(scene: THREE.Scene): void;
  setLayer(config: ScalarFieldLayerConfig): Promise<void>;
  setDepthIndex(i: number): Promise<void>;   // swaps bound texture
  setTimeIndex(i: number): Promise<void>;    // swaps bound texture
  setValueRange(min: number, max: number): void;  // uniform only, synchronous
  setColormap(name: string): void;                // uniform only, synchronous
  setOpacity(v: number): void;                    // uniform only, synchronous
  setVisible(v: boolean): void;
  sampleAt(lon: number, lat: number): number | null;  // for hover readout
  dispose(): void;
}
```

Methods marked "uniform only" **must not** trigger a fetch or a re-upload. That is what makes the colorbar editor feel instant.

### 5.3 Colormap registry

`apps/web/src/lib/render/colormaps.ts`:

```ts
export interface Colormap { name: string; stops: [number, number, number][]; }
export const COLORMAPS: Record<string, Colormap>;
export function toLUTTexture(name: string): THREE.DataTexture;  // 256×1 RGBA
```

Ship at minimum: `thermal`, `haline`, `viridis`, `balance` (diverging). Use the cmocean values - they are the oceanographic convention and a domain judge will notice.

### 5.4 UI action bus

One store so chat, keyboard shortcuts, and future plugins all drive the map identically:

```ts
// apps/web/src/lib/state/ui-actions.svelte.ts
export function dispatchUiAction(action: UiAction): void;
export function onUiAction(handler: (a: UiAction) => void): () => void;
```

---

## 6. Mocking rules

Until an endpoint exists, consume a mock of its frozen shape.

- **Frontend:** static JSON fixtures in `apps/web/src/lib/mocks/`, selected by `PUBLIC_USE_MOCKS=true`. Never branch on mocks inside a component; do it once at the fetch layer.
- **Backend:** every route lands first as a stub returning a valid fixture, then gets a real implementation. This is issue A4 and it is the single highest-leverage task in Sprint 0 - it is what lets four people work on day 2 instead of day 4.
- Fixtures live in `fixtures/` at repo root and are shared by both, so the frontend mock and the backend stub cannot drift apart.
