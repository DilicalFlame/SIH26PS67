/**
 * basemaps.ts
 *
 * Basemap ("skin") registry for CesiumCanvas's bottom-left basemap picker —
 * the Cesium analogue of Google Earth's imagery-layer switcher. Every entry
 * here is a free, key-less tile source (see CesiumCanvas.svelte's imagery
 * comment for why: no Ion/Mapbox/MapTiler token is configured), verified to
 * serve CORS-enabled tiles. Adding a skin is one entry here — no changes
 * needed in CesiumCanvas or BasemapPicker.
 */
import * as Cesium from "cesium";

export interface BasemapConfig {
	id: string;
	label: string;
	/**
	 * A real tile from this source, used as the picker's preview instead of
	 * an icon — the same "minimap" pattern Google Maps/Earth uses for its
	 * basemap switcher. All six point at the same real-world tile (roughly
	 * Southern Africa) so the panel reads as one style, N ways rather than N
	 * unrelated thumbnails.
	 */
	thumbnail: string;
	build: () => Promise<Cesium.ImageryProvider>;
	/** Per-layer color adjustments (see Cesium.ImageryLayer), applied after build(). */
	saturation?: number;
	brightness?: number;
}

export const BASEMAPS: BasemapConfig[] = [
	{
		id: "streets",
		label: "Streets",
		thumbnail: "https://tile.openstreetmap.org/3/4/4.png",
		saturation: 0.55,
		brightness: 0.95,
		build: async () =>
			new Cesium.OpenStreetMapImageryProvider({
				url: "https://tile.openstreetmap.org/",
				// The public tile server doesn't serve past z19; requesting
				// further 404s (surfaces as a CORS error, since an error page
				// has no CORS headers). Capping here makes Cesium hold and
				// magnify the last real z19 tile instead.
				maximumLevel: 19,
			}),
	},
	{
		id: "satellite",
		label: "Satellite",
		// Esri's MapServer tile path is z/row/col (y before x), unlike the
		// z/x/y convention the other five thumbnails use.
		thumbnail: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/4/4",
		build: async () =>
			Cesium.ArcGisMapServerImageryProvider.fromUrl(
				// The legacy public REST endpoint — unlike
				// ArcGisMapServerImageryProvider.fromBasemapType(), which now
				// proxies through Esri's paid ibasemaps-api.arcgis.com and
				// requires an access token, this one still serves free.
				"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
			),
	},
	{
		id: "light",
		label: "Light",
		thumbnail:
			"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/3/4/4",
		// CartoDB's basemaps.cartocdn.com now serves an "API KEY REQUIRED"
		// watermark tile instead of a 4xx (still a 200 image/png, so a plain
		// HTTP check doesn't catch it — found by actually looking at a
		// rendered tile). Esri's legacy Canvas basemaps are the free,
		// key-less equivalent.
		build: async () =>
			Cesium.ArcGisMapServerImageryProvider.fromUrl(
				"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer",
			),
	},
	{
		id: "dark",
		label: "Dark",
		thumbnail:
			"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/3/4/4",
		build: async () =>
			Cesium.ArcGisMapServerImageryProvider.fromUrl(
				"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer",
			),
	},
	{
		id: "terrain",
		label: "Terrain",
		thumbnail: "https://tile.opentopomap.org/3/4/4.png",
		build: async () =>
			new Cesium.UrlTemplateImageryProvider({
				url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
				credit: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)",
				// OpenTopoMap's own tiles stop at z17; Cesium magnifies the
				// deepest tile past that, same as the streets skin at z19.
				maximumLevel: 17,
			}),
	},
	{
		id: "offline",
		label: "Simple",
		// Same region as the other five (roughly), from the bundled pyramid
		// itself — no network needed even for the thumbnail.
		thumbnail: `${CESIUM_BASE_URL}/Assets/Textures/NaturalEarthII/2/4/1.jpg`,
		build: async () =>
			// Bundled with Cesium itself — the only skin that needs no network
			// at all, and the fallback if every tile server above is
			// unreachable. Detail only to zoom level 2 (see CesiumCanvas's
			// original imagery comment), so it reads as a flat world map at
			// any real zoom rather than a "hi-res" option.
			Cesium.TileMapServiceImageryProvider.fromUrl(
				Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
			),
	},
];

export const DEFAULT_BASEMAP_ID = "streets";
