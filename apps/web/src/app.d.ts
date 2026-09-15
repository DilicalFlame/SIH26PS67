/// <reference types="vite-plugin-glsl/ext" />

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

	// Injected by vite.config.ts's `define` — CesiumJS reads this at runtime
	// to locate its Workers/Assets/Widgets/ThirdParty static files.
	const CESIUM_BASE_URL: string;
}

export {};
