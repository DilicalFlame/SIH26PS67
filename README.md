# Thalassa

A web-based, browser-native 3D ocean data visualization platform built for
**Smart India Hackathon 2026 - Problem Statement 67** (INCOIS): an
interactive system for co-visualizing numerical ocean model outputs (temperature,
salinity, currents) alongside in-situ observations (Argo floats, gliders, CTDs)
in a single 3D environment, in the browser, with no client-side plugins.

[**Watch the demo**](https://youtu.be/j-3PNTzltWc)

## Contributing

New to this repo? [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, branching,
and PR/commit conventions. [docs/planning/](docs/planning/) has the frozen
API/rendering contracts and the sprint backlog everything is built against.

## Running locally

Prerequisites: [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), and
Docker (for Postgres + MinIO).

1. Copy the env file once, at the repo root (both docker compose and the web
   app read this one file): `cp .env.example .env`
2. Start Postgres + MinIO:
   ```
   docker compose --env-file .env -f infra/docker/compose.yml up -d
   ```
3. Start the API - on the host rather than in the compose container, so a
   debugger can attach and edits reload instantly:
   ```
   cd apps/api
   uv sync
   uv run uvicorn app.main:app --reload
   ```
   Runs at http://localhost:8000 - interactive docs at http://localhost:8000/docs.
   (Skip this if you'd rather use the `api` service docker compose already
   started in step 2 - just don't run both, they'll fight over port 8000.)
4. Start the web app, from the repo root:
   ```
   pnpm install
   pnpm dev
   ```
   Runs at http://localhost:5173.

The web app reaches the API via `PUBLIC_API_BASE_URL` in `.env` (defaults to
`http://localhost:8000/api/v1`) - update it if you run the API on a
different port, and make sure `WEB_ORIGIN` in `.env` matches whatever port
the web app actually starts on (it prints this to the terminal; Vite picks
the next free port if 5173 is taken), or the API will reject its requests
with a CORS error.

## Problem Statement

**Title:** Develop a web-based interactive 3D visualization platform that
integrates numerical ocean model outputs and in-situ observations.

### Background

India's vast Exclusive Economic Zone (EEZ) and coastline demand continuous,
high-resolution monitoring of ocean state variables. INCOIS routinely
generates and archives large volumes of ocean model outputs - including
three-dimensional fields of temperature, salinity, current vectors,
chlorophyll, etc. - as well as real-time and delayed-mode observations from
autonomous instruments such as Argo profiling floats and underwater Gliders.
These datasets are stored in NetCDF and ASCII/text formats and span multiple
depth levels, spatial grids, and time steps.

Despite the richness of this data, no integrated, web-based 3D visualization
platform currently exists that can simultaneously render model fields and
in-situ instrument observations in a single interactive environment. Existing
tools are either desktop-bound, support only 2D plan views, or lack the
ability to co-visualize model outputs alongside instrument profiles.
Operational oceanographers and forecasters are therefore forced to toggle
between disparate software packages, making it difficult to rapidly
correlate model predictions with observational evidence.

**Key gaps identified include:**
* No web-based, platform-independent 3D rendering of ocean model data
  (temperature, salinity, currents, etc.) with depth-resolved volumetric
  views.
* No unified display of Argo float and Glider profile data (latitude,
  longitude, depth, time, temperature, salinity, chlorophyll) alongside
  model fields.
* Absence of interactive controls for variable selection, depth-slice
  navigation, time-step animation, and customizable colorbars.
* Inability to ingest new observational data streams or additional model
  variables without significant re-engineering.
* Lack of tools to support intuitive, rapid understanding of complex 3D
  ocean phenomena for operational decision-making.

The absence of such a system impedes timely hazard assessment,
search-and-rescue support, fishery advisories, climate monitoring, etc. -
all operational mandates of INCOIS.

### Expected Solution

The proposed solution is a web-based, browser-native 3D Ocean Data
Visualization System that integrates ocean model outputs with observational
data on a single interactive platform.

**Core functional requirements:**
* **3D Volumetric Rendering:** Interactive visualization of ocean model
  fields (temperature, salinity, current vectors) across the full water
  column, with support for depth-slice views, isosurface extraction, and
  time-step animation using WebGL / Three.js or Cesium.js.
* **Instrument Data Overlay:** Co-display of Argo float, Glider profile,
  CTD, and BGC data using geospatially accurate markers; users can click a
  float/glider to inspect a depth-vs-variable profile chart with
  timestamps.
* **Multi-format Data Ingestion:** Automated parsers for NetCDF (via PyNIO /
  xarray backend) and delimited text formats, with a modular architecture
  that allows new variables or data sources to be added with minimal code
  change.
* **Customizable Colorbar & Variable Controls:** Dynamic colorbar editor
  (color palette, min/max range, log/linear scale), variable selector,
  layer opacity controls, and vertical exaggeration slider for intuitive
  depth perception.
* **Web-based, Scalable Architecture:** Frontend built on modern JavaScript
  frameworks with a lightweight REST/OPeNDAP API backend, enabling
  deployment on INCOIS infrastructure without any client-side dependencies.
* **Extensible Design:** Plugin-style module for future integration of
  additional sensors (e.g., CTDs, moorings, HF-radar, Acoustic Doppler
  Current Profiler (ADCP), etc.), new ocean model variables, and
  machine-learning derived products.

The system follows open standards (OGC WMS/WCS, CF Conventions for NetCDF),
enabling interoperability with national and international ocean data
portals. The end product empowers INCOIS forecasters to perform rapid,
intuitive analysis of complex 3D ocean phenomena - significantly improving
the speed and accuracy of operational advisories, in the same way that 3D
meteorological visualization has transformed weather forecasting workflows.

### Public Outreach & Science Communication

Beyond operational use, the platform serves as a powerful science
communication tool. Complex numerical ocean model outputs - which are
typically inaccessible to non-specialists - can be transformed into visually
intuitive, interactive 3D experiences. This makes the tool valuable for
educating school and college students about ocean dynamics, engaging the
general public during awareness campaigns, and supporting policymakers in
understanding marine environmental conditions. INCOIS can use the platform
for outreach events, exhibitions, and e-learning initiatives, bridging the
gap between cutting-edge ocean science and the common person.

## Tech Stack

* **Frontend:** SvelteKit 5, a custom WebGL globe engine, and a Three.js
  volumetric renderer for depth-resolved 3D ocean fields
* **Backend:** FastAPI (Python), Postgres, MinIO (tile/object storage)
* **Data source:** Copernicus Marine Service (WMTS)
* **Tooling:** pnpm + Turborepo (monorepo), uv (Python), Docker Compose
