/**
 * Soft caps exist because the agent kept describing them and could not build
 * them. These pin the behaviour that makes the field worth having — and the
 * one result that is counter-intuitive enough to be tuned away by accident.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEED_PACK } from '../src/engine/content.js';
import { softCapMultiplier } from '../src/engine/engine.js';
import { simulate } from '../src/engine/sim.js';
import { createInitialState } from '../src/engine/engine.js';
import type { ContentPack } from '../src/engine/types.js';

const capped = (threshold: number, multiplier: number): ContentPack => ({
  ...SEED_PACK,
  roles: SEED_PACK.roles.map((r) =>
    r.id === 'riveter'
      ? { ...r, softCap: { when: 'headcountAbove' as const, threshold, throughputMultiplier: multiplier } }
      : r,
  ),
});

function withRiveters(pack: ContentPack, n: number) {
  const s = createInitialState(pack);
  return { ...s, headcount: { ...s.headcount, riveter: n } };
}

describe('soft caps', () => {
  it('does nothing below the threshold', () => {
    const pack = capped(8, 0.4);
    const role = pack.roles.find((r) => r.id === 'riveter')!;
    assert.equal(softCapMultiplier(role, withRiveters(pack, 5)), 1);
  });

  it('discounts only the excess, so crossing it bends rather than drops', () => {
    // 8 units at full rate plus 8 at 0.4 = 11.2 of 16, or 0.7.
    const pack = capped(8, 0.4);
    const role = pack.roles.find((r) => r.id === 'riveter')!;
    const m = softCapMultiplier(role, withRiveters(pack, 16));
    assert.ok(Math.abs(m - 0.7) < 1e-9, `expected 0.7, got ${m}`);
  });

  it('is a no-op while attention is the binding constraint', () => {
    // The counter-intuitive one. On the seed pack throughput is already pinned
    // by the player's answer rate, so capping throughput cannot bind — and a
    // simulation reporting a difference here would mean the ceiling equation
    // had stopped holding.
    const policy = {
      mode: 'scripted' as const,
      label: 'hire-only',
      script: [{ type: 'hire' as const, roleId: 'riveter', upTo: 40 }],
    };
    const before = simulate(SEED_PACK, policy, 600);
    const after = simulate(capped(8, 0.4), policy, 600);
    assert.equal(
      after.score.finalThroughput.toFixed(2),
      before.score.finalThroughput.toFixed(2),
      'a throughput cap must not bite while attention is the constraint',
    );
  });

  it('bites once the org has raised the ceiling', () => {
    // Greedy buys supervisors, attention stops being the limit, and the cap
    // becomes a real lever. This is what makes it a late-game mechanic.
    const before = simulate(SEED_PACK, { mode: 'greedy' }, 900);
    const after = simulate(capped(8, 0.4), { mode: 'greedy' }, 900);
    assert.ok(
      after.score.finalThroughput < before.score.finalThroughput * 0.75,
      `expected the cap to bite; ${before.score.finalThroughput.toFixed(2)} -> ` +
        `${after.score.finalThroughput.toFixed(2)}`,
    );
  });
});
