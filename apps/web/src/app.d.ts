// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// GLSL shader imports via vite-plugin-glsl (used with ?raw query)
declare module '*.glsl' {
	const value: string;
	export default value;
}
declare module '*.vert.glsl' {
	const value: string;
	export default value;
}
declare module '*.frag.glsl' {
	const value: string;
	export default value;
}

export {};
