/**
 * Shared TrueForge client plumbing: one place that knows the base URL, the
 * optional token, and how to turn a failed call into a sentence a human can act
 * on. The harness is self-hosted and frequently half-configured during a
 * hackathon, so "connection refused" must never surface as a stack trace.
 */

import { TrueForge, TrueForgeError } from '@truefoundry/trueforge-sdk';

export const BASE_URL = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';

export function createClient(): TrueForge {
  const token = process.env.TRUEFORGE_TOKEN ?? process.env.TRUEFORGE_API_KEY;
  return new TrueForge({ baseUrl: BASE_URL, ...(token ? { token } : {}) });
}

/** Human-readable explanation of a failed TrueForge call, with what to do next. */
export function explain(err: unknown): string {
  if (err instanceof TrueForgeError) {
    const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
    if (err.statusCode === 401 || err.statusCode === 403) {
      return `TrueForge rejected the request (${err.statusCode}). Auth is enabled on ${BASE_URL}; set TRUEFORGE_TOKEN to an ID token.\n  ${body}`;
    }
    if (err.statusCode === 404) {
      return `TrueForge returned 404 for ${BASE_URL}. Check TRUEFORGE_BASE_URL points at the harness server, not the UI.\n  ${body}`;
    }
    return `TrueForge error ${err.statusCode ?? '(no status)'}: ${err.message}\n  ${body}`;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    return (
      `Could not reach the TrueForge harness at ${BASE_URL} (${message}).\n` +
      '  Start it, or point TRUEFORGE_BASE_URL somewhere else:\n' +
      '    TRUEFORGE_BASE_URL=http://localhost:8790 npx tsx src/agent/provision.ts'
    );
  }
  return message;
}

/** True when the failure is "the server is not there", as opposed to a real API error. */
export function isUnreachable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return !(err instanceof TrueForgeError) && /ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(message);
}
