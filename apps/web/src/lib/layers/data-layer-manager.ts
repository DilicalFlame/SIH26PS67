/**
 * data-layer-manager.ts
 *
 * Owns the stack of active data-layer ImageryLayers on top of the basemap —
 * plain Cesium, no Svelte, mirroring PathMeasureTool's relationship to
 * CesiumCanvas: one instance is constructed once, driven by UI callbacks,
 * and mirrors its state out via onUpdate for the UI to render.
 *
 * Index convention within viewer.imageryLayers: index 0 is always the
 * basemap (switchBasemap in CesiumCanvas.svelte re-inserts it there on
 * every skin change); this manager's own `layers` array order is the source
 * of truth for everything above it, occupying indices 1..layers.length; the
 * graticule (if on) is always appended last via plain addImageryProvider()
 * with no index, so it stays on top regardless of how many data layers
 * exist or how they're reordered. There is no bulk-reorder API on
 * Cesium's ImageryLayerCollection (confirmed from its source) — moving a
 * layer to an arbitrary position is remove(layer, false) + add(layer, index).
 */
import * as Cesium from "cesium";
import { DATA_LAYERS, type DataLayerCatalogEntry } from "$lib/tiles/data-layers-catalog";
import {
	dispatchSessionAction,
	SessionActionType,
	type PersistedActiveLayer,
} from "$lib/state/session-store";

export interface ActiveLayerState {
	id: string;
	title: string;
	description: string;
	source: DataLayerCatalogEntry["source"];
	attribution?: string;
	visible: boolean;
	opacity: number;
}

interface ActiveLayerRecord {
	id: string;
	catalogEntry: DataLayerCatalogEntry;
	imageryLayer: Cesium.ImageryLayer;
	visible: boolean;
	opacity: number;
}

export class DataLayerManager {
	private viewer: Cesium.Viewer;
	private onUpdate: (state: ActiveLayerState[]) => void;
	private layers: ActiveLayerRecord[] = [];

	constructor(viewer: Cesium.Viewer, onUpdate: (state: ActiveLayerState[]) => void) {
		this.viewer = viewer;
		this.onUpdate = onUpdate;
	}

	/** Builds + inserts one layer. Never persists — used by both addLayer
	 *  (a live user action, which does persist after calling this) and
	 *  restoreLayers (which reconstructs from an already-persisted list and
	 *  must not re-dispatch, same split as PathMeasureTool's
	 *  persistFinished/restoreFinished). Returns whether a layer was added. */
	private async instantiateLayer(
		catalogId: string,
		visible: boolean,
		opacity: number,
	): Promise<boolean> {
		if (this.layers.some((l) => l.id === catalogId)) return false; // already active
		const entry = DATA_LAYERS.find((d) => d.id === catalogId);
		if (!entry) return false;

		let provider: Cesium.ImageryProvider;
		try {
			provider = await entry.build();
		} catch (err) {
			console.error(`[DataLayerManager] Failed to build layer "${catalogId}":`, err);
			return false;
		}
		if (!this.viewer || this.viewer.isDestroyed()) return false; // unmounted mid-fetch

		const imageryLayer = new Cesium.ImageryLayer(provider);
		imageryLayer.alpha = opacity;
		imageryLayer.show = visible;
		const absoluteIndex = 1 + this.layers.length;
		this.viewer.imageryLayers.add(imageryLayer, absoluteIndex);

		this.layers.push({ id: catalogId, catalogEntry: entry, imageryLayer, visible, opacity });
		return true;
	}

	async addLayer(catalogId: string): Promise<void> {
		const entry = DATA_LAYERS.find((d) => d.id === catalogId);
		const added = await this.instantiateLayer(catalogId, true, entry?.defaultOpacity ?? 1);
		if (!added) return;
		this.emitState();
		this.persist();
	}

	removeLayer(id: string): void {
		const index = this.layers.findIndex((l) => l.id === id);
		if (index === -1) return;
		const [record] = this.layers.splice(index, 1);
		this.viewer.imageryLayers.remove(record.imageryLayer, true);
		this.emitState();
		this.persist();
	}

	setVisible(id: string, visible: boolean): void {
		const record = this.layers.find((l) => l.id === id);
		if (!record) return;
		record.visible = visible;
		record.imageryLayer.show = visible;
		this.emitState();
		this.persist();
	}

	setOpacity(id: string, opacity: number): void {
		const record = this.layers.find((l) => l.id === id);
		if (!record) return;
		record.opacity = opacity;
		record.imageryLayer.alpha = opacity;
		this.emitState();
		this.persist();
	}

	/** Moves the layer with `id` to `newIndex` within the active-layer stack
	 *  (0 = bottom-most data layer, just above the basemap — this is
	 *  `this.layers`' own index order, NOT the UI's top-first display order;
	 *  see emitState()). Re-applies absolute Cesium indices for every layer
	 *  whose position changed, not just the moved one, since a single
	 *  remove+add only fixes one slot. */
	reorder(id: string, newIndex: number): void {
		const oldIndex = this.layers.findIndex((l) => l.id === id);
		if (oldIndex === -1) return;
		const clampedIndex = Math.max(0, Math.min(newIndex, this.layers.length - 1));
		if (oldIndex === clampedIndex) return;

		const [record] = this.layers.splice(oldIndex, 1);
		this.layers.splice(clampedIndex, 0, record);

		this.layers.forEach((rec, i) => {
			const absoluteIndex = 1 + i;
			if (this.viewer.imageryLayers.indexOf(rec.imageryLayer) !== absoluteIndex) {
				this.viewer.imageryLayers.remove(rec.imageryLayer, false);
				this.viewer.imageryLayers.add(rec.imageryLayer, absoluteIndex);
			}
		});

		this.emitState();
		this.persist();
	}

	/** Rebuilds the active-layer stack from a persisted session on startup.
	 *  Does not dispatch a session action — the data being applied here IS
	 *  what's already in localStorage. */
	async restoreLayers(persisted: PersistedActiveLayer[]): Promise<void> {
		let restoredAny = false;
		for (const p of persisted) {
			const added = await this.instantiateLayer(p.id, p.visible, p.opacity);
			if (added) restoredAny = true;
		}
		if (restoredAny) this.emitState();
	}

	dispose(): void {
		for (const record of this.layers) {
			this.viewer.imageryLayers.remove(record.imageryLayer, true);
		}
		this.layers = [];
	}

	private persist(): void {
		dispatchSessionAction({
			type: SessionActionType.LayersChanged,
			payload: this.layers.map((l) => ({ id: l.id, visible: l.visible, opacity: l.opacity })),
		});
	}

	/** Emits UI-facing state in top-of-stack-first order (matches every
	 *  layer-panel convention: the row at the top of the list is the one
	 *  rendered on top) — the reverse of `this.layers`' own bottom-to-top
	 *  order. ActiveLayersPanel's drag-reorder must convert its displayed
	 *  index back before calling reorder(id, newIndex). */
	private emitState(): void {
		this.onUpdate(
			[...this.layers].reverse().map((l) => ({
				id: l.id,
				title: l.catalogEntry.title,
				description: l.catalogEntry.description,
				source: l.catalogEntry.source,
				attribution: l.catalogEntry.attribution,
				visible: l.visible,
				opacity: l.opacity,
			})),
		);
	}
}
