// Disable SSR - this page dynamically imports Plotly (touches `document` at
// import time) and reads localStorage via session-store.ts, neither of
// which has a server-side equivalent. Same reasoning as the root +page.ts.
export const ssr = false;
