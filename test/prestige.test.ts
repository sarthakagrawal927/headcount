/**
 * The reset layer.
 *
 * The design skill teaches prestige exponents in detail — square root needs 4x
 * to double, cube root 8x, Egg Inc.'s 0.14 needs 128x — and the pack could not
 * express one at all, so the agent could only describe reset layers it had no
 * way to build. These pin the maths the skill promises and the two mistakes
 * that would quietly turn a reset layer into something else.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEED_PACK } from '../src/engine/content.js';
import { createInitialState, prestigeGain, prestigeMultiplier } from '../src/engine/engine.js';
import { prestige } from '../src/engine/actions.js';
import { simulate } from '../src/engine/sim.js';
import type { ContentPack } from '../src/engine/types.js';

const withReset = (exponent: number, scale = 1000, bonusPerPoint = 0.25): ContentPack => ({
  ...SEED_PACK,
  prestige: { currencyName: 'Reputation', exponent, scale, bonusPerPoint },
});

const earned = (pack: ContentPack, lifetime: number) => ({
  ...createInitialState(pack),
  lifetimeCash: lifetime,
});

describe('prestige maths', () => {
  it('honours the exponent the skill documents', () => {
    // Cube root: eight times the earnings should roughly double the points.
    const pack = withReset(1 / 3);
    const at1x = prestigeGain(pack, earned(pack, 64_000));
    const at8x = prestigeGain(pack, earned(pack, 64_000 * 8));
    assert.ok(at1x > 0, 'a first reset should pay something');
    assert.ok(
      at8x >= at1x * 1.8 && at8x <= at1x * 2.4,
      `8x earnings should roughly double points: ${at1x} -> ${at8x}`,
    );
  });

  it('pays nothing for resetting twice at the same point', () => {
    // Lifetime earnings deliberately survive a reset. If they did not, a
    // player could farm the same progress repeatedly and the layer would
    // reward resetting rather than growing.
    const pack = withReset(1 / 3);
    const before = earned(pack, 64_000);
    const after = prestige(before, pack);
    assert.ok(after.ok);
    assert.equal(prestigeGain(pack, after.state), 0);
  });

  it('compounds the multiplier across resets', () => {
    const pack = withReset(1 / 3, 1000, 0.25);
    const state = { ...createInitialState(pack), prestigePoints: 4 };
    assert.equal(prestigeMultiplier(pack, state), 2);
  });

  it('is inert when the pack has no reset layer', () => {
    const state = earned(SEED_PACK, 1_000_000);
    assert.equal(prestigeGain(SEED_PACK, state), 0);
    assert.equal(prestigeMultiplier(SEED_PACK, state), 1);
    assert.equal(prestige(state, SEED_PACK).ok, false);
  });
});

describe('a reset clears the company but not its history', () => {
  it('takes the workforce, the procedures and the cash', () => {
    const pack = withReset(1 / 3);
    const built = {
      ...earned(pack, 64_000),
      cash: 5_000,
      headcount: { riveter: 12, line_lead: 2 },
      sops: ['rivet_spec'],
      tenure: { riveter: 2, line_lead: 0 },
      queue: 9,
    };
    const result = prestige(built, pack);
    assert.ok(result.ok);
    assert.equal(result.state.cash, 0);
    assert.equal(result.state.headcount.riveter, 0);
    assert.deepEqual(result.state.sops, []);
    assert.equal(result.state.tenure.riveter, 0);
    assert.equal(result.state.queue, 0);
    assert.equal(result.state.prestigeCount, 1);
    assert.ok(result.state.prestigePoints > 0);
  });
});

describe('the simulator can see a reset layer', () => {
  it('actually resets, rather than scoring the layer as a no-op', () => {
    // The failure this guards against has happened twice in this project: a
    // mechanic the simulated player never exercises scores identically to no
    // mechanic, so the evidence the agent cites says nothing about the thing
    // it is proposing.
    const pack = withReset(1 / 3, 500, 0.3);
    const run = simulate(pack, { mode: 'greedy' }, 1800);
    assert.ok(run.final.prestigeCount > 0, 'the simulated player never reset');
    assert.ok(run.final.prestigePoints > 0);
  });

  it('trades accumulated cash for a higher ceiling', () => {
    // The shape of the bargain: less total money, more throughput.
    const pack = withReset(1 / 3, 500, 0.3);
    const plain = simulate(SEED_PACK, { mode: 'greedy' }, 1800);
    const reset = simulate(pack, { mode: 'greedy' }, 1800);
    assert.ok(
      reset.score.finalThroughput > plain.score.finalThroughput,
      `expected a higher ceiling: ${plain.score.finalThroughput} -> ${reset.score.finalThroughput}`,
    );
    assert.ok(
      reset.final.lifetimeCash < plain.final.lifetimeCash,
      'a reset layer should cost accumulated earnings',
    );
  });
});
