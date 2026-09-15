import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import glsl from 'vite-plugin-glsl';

// CesiumJS ships its Workers/Assets/Widgets/ThirdParty as static files it
// loads at runtime via CESIUM_BASE_URL, not as ES modules — they can't be
// bundled. scripts/copy-cesium-assets.mjs (run via postinstall) vendors them
// into static/cesium, which SvelteKit serves as-is at this path in both dev
// and the production build.
const CESIUM_BASE_URL = '/cesium';

export default defineConfig({
	define: {
		CESIUM_BASE_URL: JSON.stringify(CESIUM_BASE_URL)
	},
	plugins: [
		glsl(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),

			// SvelteKit resolves $env/static/* and $env/dynamic/* using this dir,
			// independently of the top-level `envDir` above (which only covers
			// Vite's own `import.meta.env`) -- so it needs to point at the repo root too.
			env: {
				dir: '../..'
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
