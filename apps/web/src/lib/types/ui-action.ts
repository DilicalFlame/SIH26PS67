/** The three actions chat, UI controls, and future plugins can all trigger
 *  on the map, per contracts §4.7 / §5.4. Frozen shape — do not add a
 *  fourth variant without updating the contracts doc first. */
export type UiAction =
	| {
			type: 'set_map_layer';
			layerId: string;
			depthIndex?: number;
			timeIndex?: number;
			colormap?: string;
			valueRange?: [number, number];
	  }
	| {
			type: 'fly_to';
			bbox: [number, number, number, number];
	  }
	| {
			type: 'open_profile';
			profileId: string;
	  };
