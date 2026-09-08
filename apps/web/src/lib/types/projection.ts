/**
 * Projection types supported by the GPU shader engine.
 * The numeric values map directly to `u_projectionTypeA/B` uniforms.
 */
export enum ProjectionType {
	Sphere = 0,
	Equirectangular = 1,
}

/** Display metadata for each projection — used by the UI button group. */
export interface ProjectionMeta {
	type: ProjectionType;
	label: string;
	/** Unicode/emoji icon for the button */
	icon: string;
	/** Accessible description */
	description: string;
}

export const PROJECTIONS: ProjectionMeta[] = [
	{
		type: ProjectionType.Sphere,
		label: 'Globe',
		icon: '\u{1F310}',
		description: '3D orthographic globe',
	},
	{
		type: ProjectionType.Equirectangular,
		label: 'Map',
		icon: '\u{1F5FA}',
		description: 'Equirectangular map, wrapping east-west',
	},
];
