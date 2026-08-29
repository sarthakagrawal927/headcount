/**
 * Evidence binding is a control, so it is tested like one: the interesting
 * cases are the ones where someone is trying to get around it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fingerprint, mint, verify, type Verdict } from '../src/mcp/evidence.js';

const GOOD: Verdict = {
  degenerate: false,
  stalled: false,
  timeToWall: 44,
  attentionUtilisation: 1.01,
  peakThroughput: 3.7,
};

const PATCH = { sops: [{ id: 'a', name: 'A', blurb: '', roleId: 'riveter', confusionMultiplier: 0.5, cost: 100 }] } as any;
const OTHER = { playerAnswerRate: 99 } as any;

describe('fingerprinting', () => {
  it('ignores the human-facing note, which has no mechanical effect', () => {
    assert.equal(
      fingerprint({ ...PATCH, note: 'one wording' }),
      fingerprint({ ...PATCH, note: 'a different wording' }),
    );
  });

  it('is stable across key order', () => {
    const a = { playerAnswerRate: 2, clickRevenue: 3 } as any;
    const b = { clickRevenue: 3, playerAnswerRate: 2 } as any;
    assert.equal(fingerprint(a), fingerprint(b));
  });

  it('separates patches that differ mechanically', () => {
    assert.notEqual(fingerprint(PATCH), fingerprint(OTHER));
  });
});

describe('verification', () => {
  it('accepts a token minted for this exact patch', () => {
    const check = verify(mint(PATCH, GOOD), PATCH);
    assert.ok(check.ok);
  });

  it('refuses a missing token', () => {
    const check = verify(undefined, PATCH);
    assert.ok(!check.ok);
    assert.match(check.reason, /simulate_patch/);
  });

  it('refuses a token minted for a different patch', () => {
    const check = verify(mint(PATCH, GOOD), OTHER);
    assert.ok(!check.ok);
    assert.match(check.reason, /different patch/);
  });

  it('refuses a forged signature', () => {
    const token = mint(PATCH, GOOD);
    const forged = token.slice(0, token.lastIndexOf('.') + 1) + 'deadbeefdeadbeef';
    const check = verify(forged, PATCH);
    assert.ok(!check.ok);
    assert.match(check.reason, /signature/);
  });

  it('refuses its own verdict when the design failed', () => {
    // The case observed in practice: the agent simulated, got a failing
    // verdict, attached it anyway, and a human approved it.
    const token = mint(PATCH, { ...GOOD, degenerate: true });
    const check = verify(token, PATCH);
    assert.ok(!check.ok);
    assert.match(check.reason, /DEGENERATE/);
  });

  it('produces a token with no dot inside the verdict segment', () => {
    // A decimal point in the verdict used to split the token into five parts
    // and break its own parser.
    const token = mint(PATCH, GOOD);
    assert.equal(token.split('.').length, 4, `unparseable token: ${token}`);
  });
});
