/**
 * Projection types supported by the GPU shader engine.
 * The numeric values map directly to `u_projectionTypeA/B` uniforms.
 */
export enum ProjectionType {
	Sphere = 0,
	Equirectangular = 1,
	Mercator = 2,
	Mollweide = 3,
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
		label: 'Sphere',
		icon: '🌐',
		description: '3D orthographic sphere',
	},
	{
		type: ProjectionType.Equirectangular,
		label: 'Equirect',
		icon: '⬜',
		description: 'Plate Carrée equirectangular projection',
	},
	{
		type: ProjectionType.Mercator,
		label: 'Mercator',
		icon: '🗺',
		description: 'Web Mercator cylindrical projection',
	},
	{
		type: ProjectionType.Mollweide,
		label: 'Mollweide',
		icon: '🥚',
		description: 'Mollweide equal-area elliptical projection',
	},
];
