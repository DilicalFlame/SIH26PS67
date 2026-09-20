/**
 * shape-layer-intersection.ts
 *
 * Decides whether a finished shape (see path-measure-tool.ts) has any
 * active data layer to visualise, and if so, which one - gates
 * ShapeVisualiseButton.svelte's visibility. Mirrors Toolbar.svelte's old
 * `hasActiveLayers` check, but per-shape and per-layer: bbox overlap AND
 * `wmts` present (only an AnalysableLayerEntry - see data-layers-catalog.ts -
 * can be point-sampled at depth at all, so a WMTS-less layer must not make
 * the button appear even if its bbox overlaps).
 */
import type { DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";
import type { FinishedMeasurement } from "$lib/measure/path-measure-tool";

export type Bbox = [west: number, south: number, east: number, north: number];

export function bboxOfPositions(positions: [number, number][]): Bbox {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const [lon, lat] of positions) {
		if (lon < west) west = lon;
		if (lon > east) east = lon;
		if (lat < south) south = lat;
		if (lat > north) north = lat;
	}
	return [west, south, east, north];
}

function bboxesIntersect(a: Bbox, b: Bbox): boolean {
	return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Only closed shapes (polygon/rectangle/ellipse) have a meaningful area to
 *  pop a volume out of - an open path is excluded (same as the old
 *  Toolbar button's `m.type !== "path"` gate on the analysis page). */
export function isVolumisableShapeType(type: FinishedMeasurement["type"]): boolean {
	return type !== "path";
}

/** First active layer (in list order) that both overlaps `shape`'s bbox and
 *  can be point-sampled at depth. A layer with no `bbox` is treated as
 *  global (always intersects) - same looseness the old `hasActiveLayers`
 *  gate already had. Multiple intersecting layers just pick the first;
 *  known v1 limitation, not a bug - see docs for the layer-picker fast-follow. */
export function findVolumeLayerForShape(
	shape: FinishedMeasurement,
	activeLayerIds: string[],
	resolveEntry: (id: string) => DataLayerCatalogEntry | undefined,
): DataLayerCatalogEntry | undefined {
	if (!isVolumisableShapeType(shape.type) || shape.positions.length < 3) return undefined;
	const shapeBbox = bboxOfPositions(shape.positions);
	for (const id of activeLayerIds) {
		const entry = resolveEntry(id);
		if (!entry?.wmts) continue;
		if (!entry.bbox || bboxesIntersect(shapeBbox, entry.bbox)) return entry;
	}
	return undefined;
}
