/**
 * Evidence binding: an agent may not apply a change it did not simulate.
 *
 * The weakness this closes was observed on the first real run. The agent
 * proposed a supervisor role with `answerRate: 0` — a supervisor that cannot
 * answer a single question — and attached a confident rationale citing
 * attention figures that patch could not possibly produce. The prose was
 * excellent. The numbers were unattributable to any run.
 *
 * Telling the agent to "simulate first" is a request, and a request is not a
 * control. So `simulate_patch` mints a token bound by HMAC to the exact diff it
 * ran, carrying the verdict in readable form, and `apply_patch` refuses any
 * patch whose token is missing, forged, expired, or minted for a different
 * diff. The token travels in the tool arguments, which means it is visible in
 * the approval prompt — the human approving the change reads the verdict of the
 * run that justifies it, rather than the agent's account of it.
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { ContentPatch } from './schemas.js';

/**
 * Per-process secret. Restarting invalidates outstanding tokens, which is the
 * correct behaviour: the live pack it was measured against is gone too.
 */
const SECRET = randomBytes(32);

/** Tokens expire so a stale verdict cannot justify a change made much later. */
const TTL_MS = 30 * 60 * 1000;

export interface Verdict {
  degenerate: boolean;
  stalled: boolean;
  timeToWall: number | null;
  attentionUtilisation: number;
  peakThroughput: number;
}

/**
 * A stable fingerprint of the design content of a patch.
 *
 * `note` is excluded deliberately: it is prose for the human and carries no
 * mechanical effect, so editing it must not invalidate the evidence. Object
 * keys are sorted so that a semantically identical patch fingerprints
 * identically regardless of the order the model happened to emit fields in.
 */
export function fingerprint(patch: ContentPatch): string {
  const { note, ...design } = patch as Record<string, unknown>;
  void note;
  return createHmac('sha256', 'headcount-fingerprint')
    .update(canonical(design))
    .digest('hex')
    .slice(0, 16);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Compress a verdict into something a human can read at the approval prompt.
 *
 * The result is used as a dot-delimited token segment, so it must not itself
 * contain a dot — decimal points included. Everything outside [A-Za-z0-9-] is
 * folded to a hyphen.
 */
function describe(v: Verdict): string {
  const raw = v.degenerate
    ? 'DEGENERATE-no-wall'
    : v.stalled
      ? 'STALLED-dead-end'
      : `playable-${
          v.timeToWall === null ? 'no-wall' : `wall${v.timeToWall.toFixed(0)}s`
        }-util${v.attentionUtilisation.toFixed(2)}`;
  return raw.replace(/[^A-Za-z0-9-]/g, '-');
}

/** Mint a token for a patch that has actually been run. */
export function mint(patch: ContentPatch, verdict: Verdict): string {
  const fp = fingerprint(patch);
  const expires = Date.now() + TTL_MS;
  const body = `${fp}.${describe(verdict)}.${expires}`;
  const sig = createHmac('sha256', SECRET).update(body).digest('hex').slice(0, 16);
  return `${body}.${sig}`;
}

export type EvidenceCheck =
  | { ok: true; verdict: string; fingerprint: string }
  | { ok: false; reason: string };

/** Verify a token really was minted for this exact patch, and is still fresh. */
export function verify(token: string | undefined, patch: ContentPatch): EvidenceCheck {
  if (!token) {
    return {
      ok: false,
      reason:
        'No evidence token. Run simulate_patch on this exact patch first and pass the token it returns. ' +
        'A design cannot be applied on the strength of its own rationale.',
    };
  }

  const parts = token.split('.');
  if (parts.length !== 4) {
    return { ok: false, reason: 'Malformed evidence token.' };
  }
  const [fp, verdict, expiresRaw, sig] = parts;

  const expected = createHmac('sha256', SECRET)
    .update(`${fp}.${verdict}.${expiresRaw}`)
    .digest('hex')
    .slice(0, 16);
  if (sig !== expected) {
    return {
      ok: false,
      reason: 'Evidence token signature is invalid — it was not issued by this simulator.',
    };
  }

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return {
      ok: false,
      reason: 'Evidence token has expired. Re-run simulate_patch against the current pack.',
    };
  }

  const actual = fingerprint(patch);
  if (actual !== fp) {
    return {
      ok: false,
      reason:
        `Evidence token was minted for a different patch (${fp}), but this call applies ${actual}. ` +
        'Simulate the patch you actually intend to apply.',
    };
  }

  if (verdict.startsWith('DEGENERATE') || verdict.startsWith('STALLED')) {
    return {
      ok: false,
      reason:
        `The simulation of this exact patch returned ${verdict}. That is a failed design, not a ` +
        'borderline one — it will not be applied. Change the design and simulate again.',
    };
  }

  return { ok: true, verdict, fingerprint: fp };
}
