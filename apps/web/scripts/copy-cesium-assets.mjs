// Copies CesiumJS's static runtime assets (Workers/Assets/Widgets/ThirdParty)
// into static/cesium, where SvelteKit serves them as-is in both `vite dev`
// and the production build — Cesium loads these via CESIUM_BASE_URL at
// runtime, so they can't be bundled as ES modules. Re-run after bumping the
// `cesium` dependency version. Not committed to git (see static/.gitignore);
// wired up as this package's `postinstall` so a fresh `pnpm install` always
// has them.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cesiumBuildDir = join(here, "..", "node_modules", "cesium", "Build", "Cesium");
const destDir = join(here, "..", "static", "cesium");

if (!existsSync(cesiumBuildDir)) {
    console.error(`[copy-cesium-assets] ${cesiumBuildDir} not found — is "cesium" installed?`);
    process.exit(1);
}

mkdirSync(destDir, { recursive: true });
for (const dir of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
    cpSync(join(cesiumBuildDir, dir), join(destDir, dir), { recursive: true });
}
console.log(`[copy-cesium-assets] copied Assets/ThirdParty/Widgets/Workers to ${destDir}`);
