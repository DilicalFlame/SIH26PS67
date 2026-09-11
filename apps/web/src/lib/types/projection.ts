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
		icon: '',
		description: '3D orthographic globe',
	},
	{
		type: ProjectionType.Equirectangular,
		label: 'Map',
		icon: '',
		description: 'Equirectangular map, wrapping east-west',
	},
];
