/**
 * data-layer-registry.svelte.ts
 *
 * Every consumer that resolves a layer id to its catalog entry (the active
 * layers panel, the layer manager, the picker) used to do its own
 * `DATA_LAYERS.find(...)` directly against the static, hand-curated array.
 * That's fine as long as every addable layer lives in that array - it stops
 * being true once the "Data layers" picker can also surface entries built
 * live from GET /api/v1/catalog/wmts-layers (see wmts-catalog-client.ts),
 * which aren't and shouldn't be hardcoded anywhere.
 *
 * This module is the one place that now knows about both: the static
 * catalog plus whatever live entries the picker has fetched and converted
 * this session. `dynamicLayers` is module-level `$state` (same pattern as
 * lib/state/view-status.svelte.ts) - read from inside a $derived/template,
 * it's tracked like any other rune.
 */
import { DATA_LAYERS, type DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";

let dynamicLayers = $state<DataLayerCatalogEntry[]>([]);

/** Called when the picker renders a live search result - makes that entry
 *  resolvable by id everywhere else (data-layer-manager's addLayer,
 *  ActiveLayersPanel's per-row lookups) for the rest of the session. A
 *  no-op id collision with a curated entry can't happen in practice (static
 *  ids are short hand-picked slugs like "copernicus_thetao"; live ids are
 *  full WMTS "product/dataset/variable" paths), but the curated entry wins
 *  if it ever did. */
export function registerDynamicLayer(entry: DataLayerCatalogEntry): void {
	if (DATA_LAYERS.some((d) => d.id === entry.id)) return;
	const existingIndex = dynamicLayers.findIndex((d) => d.id === entry.id);
	if (existingIndex !== -1) dynamicLayers[existingIndex] = entry;
	else dynamicLayers.push(entry);
}

export function findLayerEntry(id: string): DataLayerCatalogEntry | undefined {
	return DATA_LAYERS.find((d) => d.id === id) ?? dynamicLayers.find((d) => d.id === id);
}
