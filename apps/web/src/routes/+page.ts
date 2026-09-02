// Disable SSR for the globe page — Three.js, WebGL, requestAnimationFrame,
// and OrbitControls are browser-only APIs with no server-side equivalent.
export const ssr = false;
