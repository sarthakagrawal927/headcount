/**
 * Tests for the claims the whole project rests on.
 *
 * These are not coverage exercises. Each one asserts something HEADCOUNT
 * asserts in its README, so that if the economy is ever "tuned" into agreeing
 * with intuition instead of with itself, the build says so.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEED_PACK } from '../src/engine/content.js';
import { coordinationMultiplier, step } from '../src/engine/engine.js';
import { simulate, type PlayPolicy } from '../src/engine/sim.js';
import { createInitialState } from '../src/engine/engine.js';
import { hire } from '../src/engine/actions.js';

/** Hire `n` of a role without waiting to afford them. */
function withStaff(roleId: string, n: number) {
  let state = createInitialState(SEED_PACK);
  state = { ...state, cash: 1e9 };
  for (let i = 0; i < n; i++) {
    const r = hire(state, SEED_PACK, roleId);
    assert.ok(r.ok, `could not hire ${roleId} #${i + 1}`);
    state = r.state;
  }
  return { ...state, cash: 0 };
}

/** Run the live step loop to steady state and report throughput. */
function settle(state: ReturnType<typeof withStaff>, seconds = 400) {
  let s = state;
  let last = 0;
  const steps = Math.round(seconds / 0.25);
  for (let i = 0; i < steps; i++) {
    const r = step(s, SEED_PACK, 0.25);
    s = r.state;
    last = r.telemetry.throughput;
  }
  return last;
}

describe('the attention ceiling', () => {
  it('caps throughput at playerAnswerRate / confusion regardless of headcount', () => {
    const riveter = SEED_PACK.roles.find((r) => r.id === 'riveter')!;
    const expected = SEED_PACK.playerAnswerRate / riveter.confusion;

    const modest = settle(withStaff('riveter', 5));
    assert.ok(
      Math.abs(modest - expected) < expected * 0.15,
      `expected throughput near ${expected.toFixed(2)}, got ${modest.toFixed(2)}`,
    );
  });

  it('does not reward hiring past the ceiling', () => {
    // Span of control is disabled for this comparison so the only effect under
    // test is the attention ceiling itself, not coordination overhead.
    const flat = { ...SEED_PACK, coordinationPenalty: 0 };
    const run = (n: number) => {
      let s = { ...withStaff('riveter', n) };
      let last = 0;
      for (let i = 0; i < 1600; i++) {
        const r = step(s, flat, 0.25);
        s = r.state;
        last = r.telemetry.throughput;
      }
      return last;
    };

    const eight = run(8);
    const thirty = run(30);
    assert.ok(
      thirty <= eight * 1.05,
      `30 workers produced ${thirty.toFixed(2)} vs 8 workers ${eight.toFixed(2)} — ` +
        'hiring should not raise the ceiling',
    );
  });
});

describe("Brooks's Law", () => {
  it('raises confusion once span of control is exceeded', () => {
    const under = coordinationMultiplier(SEED_PACK, withStaff('riveter', 3));
    const over = coordinationMultiplier(SEED_PACK, withStaff('riveter', 30));
    assert.equal(under, 1, 'inside the span limit there should be no penalty');
    assert.ok(over > 1, `expected a penalty above the span limit, got ${over}`);
  });

  it('makes a hire-only strategy decline from its own peak', () => {
    const policy: PlayPolicy = {
      mode: 'scripted',
      label: 'hire-only',
      script: [{ type: 'hire', roleId: 'riveter', upTo: 60 }],
    };
    const { score } = simulate(SEED_PACK, policy, 900);
    assert.ok(
      score.finalThroughput < score.peakThroughput * 0.75,
      `hire-only ended at ${score.finalThroughput.toFixed(2)} against a peak of ` +
        `${score.peakThroughput.toFixed(2)} — it should decline, not plateau`,
    );
  });
});

describe('determinism', () => {
  it('produces identical telemetry for identical inputs', () => {
    const policy: PlayPolicy = { mode: 'greedy', label: 'greedy' };
    const a = simulate(SEED_PACK, policy, 300);
    const b = simulate(SEED_PACK, policy, 300);
    assert.deepEqual(
      a.telemetry,
      b.telemetry,
      'the simulator must not be able to disagree with itself — the agent’s ' +
        'evidence depends on a human being able to reproduce it',
    );
  });
});

describe('scoring reports failure shapes, not a single number', () => {
  it('flags a design that deletes the wall as degenerate', () => {
    // Raising the player's answer rate enormously makes every metric look
    // better and the game pointless. That is the trap the flag exists for.
    const noTension = { ...SEED_PACK, playerAnswerRate: 1000 };
    const { score } = simulate(noTension, { mode: 'greedy' }, 300);
    assert.equal(score.timeToWall, null, 'expected no wall in this pack');
    assert.ok(score.degenerate, 'a pack with no attention pressure should be degenerate');
  });
});
