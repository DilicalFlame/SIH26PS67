/**
 * plotly.js-dist-min ships no types of its own — it's the same public API
 * as `plotly.js`, so the dynamic import in PlotlyChart.svelte casts its
 * result to `typeof import("plotly.js")` (from @types/plotly.js) rather
 * than relying on this module's own shape. This declaration only exists
 * so `import(...)` doesn't implicit-`any`.
 *
 * Using the FULL bundle, not a partial one (e.g. plotly.js-gl3d-dist-min):
 * live testing found the "gl3d" partial bundle accepts a `heatmap` trace
 * without error (so a quick newPlot()-resolves-without-throwing spike test
 * passed) but never actually draws any pixels for it — confirmed by
 * inspecting the rendered SVG, which had zero heatmap image/rect elements
 * despite a fully valid, non-null 8x8 z-grid in the trace data. The full
 * bundle does not have this gap.
 */
declare module "plotly.js-dist-min";
