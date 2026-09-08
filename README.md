This is a project for a hackathon SIH 2026.

# Problem Statement 66

**Title:** OceanEmbed - Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations.

## Description

### Background
Subsurface ocean temperature is a fundamental variable for understanding ocean circulation, upper-ocean heat content, stratification, climate variability, air-sea interaction, and marine ecosystems. Accurate representation of the vertical ocean temperature is essential for applications such as marine heatwave monitoring, fisheries, and data assimilation, etc. 

However, direct measurements of subsurface temperature remain sparse because they rely primarily on in-situ observing systems such as ARGO profiling floats, moored buoys, gliders, and ship observations. While these observations provide valuable vertical information, their spatial and temporal coverage is insufficient for generating continuous, basin-scale subsurface fields.

In contrast, satellite observations provide continuous, large-scale monitoring of surface ocean conditions at relatively high spatial and temporal resolution. Surface variables such as Sea Surface Temperature (SST), Sea Surface Salinity (SSS), Sea Surface Height (SSH) / Sea Level Anomaly (SLA), surface currents, and surface winds contain indirect signatures of subsurface ocean processes through physical mechanisms including thermocline displacement, mesoscale eddies, vertical mixing, transport, and ocean-atmosphere coupling.

Recent advances in Artificial Intelligence (AI), Deep Learning (DL), and representation learning enable the generation of satellite embeddings, where multidimensional surface observations are transformed into compact latent representations that capture hidden ocean dynamics. Such embeddings offer the potential to learn nonlinear relationships between surface observations and subsurface ocean structure more effectively than conventional machine learning approaches.

### Detailed Description
The current problem statement proposes the development of a Satellite Embedding-Based Deep Learning Framework to reconstruct depth-wise subsurface temperature from daily surface satellite observations at 0.25° spatial resolution for the North Indian Ocean (5°N to 30°N and 45°E to 105°E). The objective is to estimate the three-dimensional ocean temperature using only surface satellite observations.

**The proposed system shall:**

1. Develop a preprocessing and harmonization pipeline for multi-source satellite and ocean datasets.
2. Standardize all datasets to:
   * **Spatial Resolution:** 0.25° × 0.25°
   * **Temporal Resolution:** Daily
3. Use surface observations as input variables:
   * Sea Surface Temperature (SST)
   * Sea Surface Salinity (SSS)
   * Sea Surface Height (SSH) / Sea Level Anomaly (SLA)
   * Surface ocean currents (U, V)
   * Surface Winds (U, V)
4. Generate compact satellite embeddings using DL architectures such as:
   * Convolutional Neural Networks (CNN)
   * Vision Transformers (ViT)
   * Autoencoders
   * Graph Neural Networks (GNN)
   * Attention-based hybrid architectures
5. Train reconstruction models that learn the relationship between surface ocean state to temperature profiles.
6. Reconstruct:
   * Temperature at standard depth levels. Standard depths in meters: (0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000).
7. Evaluate the reconstruction using independent observations and standard skill metrics like correlation, RMSE, Bias, etc. *(If a dataset is not available at required resolution, the team may select the openly available product and perform appropriate spatial and temporal interpolation/regridding).*

---

## Datasets

### Training Input Datasets
The following datasets are recommended for building the training and evaluation pipeline. 

*(Insert table here)*

### Training Target Dataset (Subsurface Temperature)
* **GLORYS Global Ocean Reanalysis:** [https://doi.org/10.48670/moi-00021](https://doi.org/10.48670/moi-00021) 
  * *Variables:* Temperature
* **In-situ Observations Dataset:** Gridded ARGO
* **INCOIS Live Access Server (LAS):** – Gridded ARGO

---

## Expected Solution
* End-to-end preprocessing pipeline for satellite and ocean datasets.
* Satellite embedding engine capable of learning latent ocean representations from surface observations.
* Deep learning reconstruction model for estimating subsurface temperature.
* Standardized output at daily temporal resolution and 0.25° spatial resolution.
* Validation framework using independent ARGO observations.
* Demonstration of a working Proof-of-Concept (PoC) over the Bay of Bengal / Arabian Sea.

# Problem Statement 67

**Title:** Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations.

## Description

### Background
India's vast Exclusive Economic Zone (EEZ) and coastline demand continuous, high-resolution monitoring of ocean state variables. INCOIS routinely generates and archives large volumes of ocean model outputs—including three-dimensional fields of temperature, salinity, current vectors, chlorophyll, etc.—as well as real-time and delayed-mode observations from autonomous instruments such as Argo profiling floats and underwater Gliders. These datasets are stored in NetCDF and ASCII/text formats and span multiple depth levels, spatial grids, and time steps.

Despite the richness of this data, no integrated, web-based 3D visualization platform currently exists that can simultaneously render model fields and in-situ instrument observations in a single interactive environment. Existing tools are either desktop-bound, support only 2D plan views, or lack the ability to co-visualize model outputs alongside instrument profiles. Operational oceanographers and forecasters are therefore forced to toggle between disparate software packages, making it difficult to rapidly correlate model predictions with observational evidence.

**Key gaps identified include:**
* No web-based, platform-independent 3D rendering of ocean model data (temperature, salinity, currents, etc.) with depth-resolved volumetric views.
* No unified display of Argo float and Glider profile data (latitude, longitude, depth, time, temperature, salinity, chlorophyll) alongside model fields.
* Absence of interactive controls for variable selection, depth-slice navigation, time-step animation, and customizable colorbars.
* Inability to ingest new observational data streams or additional model variables without significant re-engineering.
* Lack of tools to support intuitive, rapid understanding of complex 3D ocean phenomena for operational decision-making. 

The absence of such a system impedes timely hazard assessment, search-and-rescue support, fishery advisories, climate monitoring, etc.—all operational mandates of INCOIS.

---

## Expected Solution
The proposed solution is a web-based, browser-native 3D Ocean Data Visualization System that integrates ocean model outputs with observational data on a single interactive platform.

**Core functional requirements:**
* **3D Volumetric Rendering:** Interactive visualization of ocean model fields (temperature, salinity, current vectors) across the full water column, with support for depth-slice views, isosurface extraction, and time-step animation using WebGL / Three.js or Cesium.js.
* **Instrument Data Overlay:** Co-display of Argo float, Glider profile, CTD, and BGC data using geospatially accurate markers; users can click a float/glider to inspect a depth-vs-variable profile chart with timestamps.
* **Multi-format Data Ingestion:** Automated parsers for NetCDF (via PyNIO / xarray backend) and delimited text formats, with a modular architecture that allows new variables or data sources to be added with minimal code change.
* **Customizable Colorbar & Variable Controls:** Dynamic colorbar editor (color palette, min/max range, log/linear scale), variable selector, layer opacity controls, and vertical exaggeration slider for intuitive depth perception.
* **Web-based, Scalable Architecture:** Frontend built on modern JavaScript frameworks with a lightweight REST/OPeNDAP API backend, enabling deployment on INCOIS infrastructure without any client-side dependencies.
* **Extensible Design:** Plugin-style module for future integration of additional sensors (e.g., CTDs, moorings, HF-radar, Acoustic Doppler Current Profiler (ADCP), etc.), new ocean model variables, and machine-learning derived products.

The system will follow open standards (OGC WMS/WCS, CF Conventions for NetCDF), enabling interoperability with national and international ocean data portals. The end product will empower INCOIS forecasters to perform rapid, intuitive analysis of complex 3D ocean phenomena—significantly improving the speed and accuracy of operational advisories, in the same way that 3D meteorological visualization has transformed weather forecasting workflows.

### Public Outreach & Science Communication
Beyond operational use, the platform will serve as a powerful science communication tool. Complex numerical ocean model outputs—which are typically inaccessible to non-specialists—can be transformed into visually intuitive, interactive 3D experiences. This makes the tool valuable for educating school and college students about ocean dynamics, engaging the general public during awareness campaigns, and supporting policymakers in understanding marine environmental conditions. INCOIS can use the platform for outreach events, exhibitions, and e-learning initiatives, bridging the gap between cutting-edge ocean science and the common person.