/**
 * scalar-field.ts (types)
 *
 * Wire type for `GET /fields/{layer_id}/meta` - see contracts §4.3. Frozen:
 * the API and the renderer are built by different people against this shape.
 */

export interface ScalarFieldMeta {
	layerId: string;
	variable: string;
	units: string;
	width: number; // grid columns
	height: number; // grid rows
	bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat], degrees
	depths: number[];
	times: string[];
	valueMin: number; // across the whole product
	valueMax: number;
	noDataValue: 'NaN';
	/** e.g. "{tilesBase}/fields/glorys_thetao/temperature/d{d}_t{t}.f32" - `{d}`/`{t}` are array indices, not values. */
	gridUrlTemplate: string;
}
