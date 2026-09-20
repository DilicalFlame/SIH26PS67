/**
 * category-icons.ts
 *
 * One glyph + accent color per Copernicus "domain" facet value (see
 * apps/api/app/services/wmts_facets.py's _CATEGORY_TOKEN_RULES /
 * _CATEGORY_BY_FIRST_TOKEN for the full value list this must stay in sync
 * with) - used by CatalogLayerCard.svelte's leading domain label. A value
 * not called out explicitly here (a category token added to that table
 * later, or the catch-all "other" bucket) falls back to
 * DEFAULT_CATEGORY_META - a generic layers-stack glyph in neutral slate -
 * rather than failing to render.
 */

export interface CategoryMeta {
	/** SVG `<path>` `d` attribute, viewBox 0 0 24 24. */
	icon: string;
	/** CSS color (hex) used for the icon and its label text. */
	color: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
	physics: { icon: "M12 2.7s6 6.5 6 10.8a6 6 0 1 1-12 0c0-4.3 6-10.8 6-10.8Z", color: "#60a5fa" },
	physics_bgc_waves: { icon: "M3 7h18M3 12h18M3 17h18", color: "#a3e635" },
	biogeochemistry: {
		icon: "M9 3h6l1 5-3 3.5V19a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7.5L8 5l1-2Z",
		color: "#34d399",
	},
	temp_salinity_trend: { icon: "M3 17l5-5 4 4 8-9", color: "#fb7185" },
	climate_indicator: { icon: "M4 19V9M10 19V5M16 19v-7M22 19H2", color: "#fbbf24" },
	ecosystem_health: {
		icon: "M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10.5c0 5.4-7.5 10-7.5 10Z",
		color: "#f472b6",
	},
	waves: {
		icon: "M2 15c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M2 9c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
		color: "#818cf8",
	},
	sea_ice: { icon: "M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M6 12h12", color: "#67e8f9" },
	temperature: { icon: "M10 14.5V4a2 2 0 1 1 4 0v10.5a4 4 0 1 1-4 0Z", color: "#f87171" },
	wind: { icon: "M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h9a2 2 0 1 1-2 2", color: "#a78bfa" },
	sea_level: { icon: "M3 12h18M3 17h18M8 7l4-4 4 4", color: "#2dd4bf" },
	other: { icon: "M4 5h7v7H4zM13 5h7v7h-7zM4 13h7v6H4zM13 13h7v6h-7z", color: "#94a3b8" },
};

export const DEFAULT_CATEGORY_META: CategoryMeta = CATEGORY_META.other;

export function categoryMeta(category: string | undefined | null): CategoryMeta {
	if (!category) return DEFAULT_CATEGORY_META;
	return CATEGORY_META[category] ?? DEFAULT_CATEGORY_META;
}
