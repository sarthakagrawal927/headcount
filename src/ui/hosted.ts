/**
 * Where is this console running?
 *
 * On localhost it attaches to the shared game in the MCP server, so the
 * player and the designer agent act on the same company. Anywhere else —
 * the GitHub Pages demo — there is no server to reach, so the game runs
 * entirely in the browser, seeded with the agent-grown pack captured by
 * scripts/snapshot-grown.mjs. `?local=1` forces the in-browser engine on
 * localhost too (with the plain seed pack), which is how the engine is
 * tested in isolation.
 */
export function isHostedDemo(): boolean {
  if (typeof window === 'undefined') return false;
  return !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}
