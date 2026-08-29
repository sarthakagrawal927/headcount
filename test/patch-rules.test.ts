/**
 * The rules that decide what may reach the running game.
 *
 * These are the checks that stand between a plausible-sounding proposal and a
 * live economy, and each one exists because an agent actually did the thing it
 * catches. They are tested against the shapes real proposals took, not against
 * invented ones.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEED_PACK } from '../src/engine/content.js';
import { applyPatchToPack } from '../src/mcp/gameStore.js';

const apply = (patch: unknown) => applyPatchToPack(SEED_PACK, patch as never);

describe('coherence rules', () => {
  it('refuses a supervisor that cannot answer anything', () => {
    // The first thing the agent ever proposed: a tier-2 role with answerRate 0,
    // described as "absorbs riveter questions", attached to a rationale citing
    // attention figures that patch could not produce.
    const { errors } = apply({
      roles: [
        {
          id: 'ghost_lead',
          name: 'Ghost Lead',
          blurb: 'absorbs questions',
          tier: 2,
          throughput: 0,
          confusion: 0,
          revenuePerTask: 0,
          answerRate: 0,
          escalateFraction: 0.15,
          baseCost: 200,
          costGrowth: 1.1,
        },
      ],
    });
    assert.ok(errors.some((e) => /answerRate is 0/.test(e)), errors.join(' | '));
  });

  it('refuses a producer that produces nothing', () => {
    const { errors } = apply({
      roles: [
        {
          id: 'idle_hands',
          name: 'Idle Hands',
          blurb: 'stands there',
          tier: 1,
          throughput: 0,
          confusion: 0.3,
          revenuePerTask: 1,
          answerRate: 0,
          escalateFraction: 0,
          baseCost: 10,
          costGrowth: 1.1,
        },
      ],
    });
    assert.ok(errors.some((e) => /produces\s*\n?\s*nothing|throughput is 0/.test(e)), errors.join(' | '));
  });

  it('refuses a tenure ladder with nothing above untenured', () => {
    // Replacing the ladder wholesale with a single rung deletes the autonomy
    // mechanic entirely, and the agent did this repeatedly while describing
    // the patch as adding a role.
    const { errors } = apply({
      tenureLadder: [{ escalationMultiplier: 1, errorRate: 0, cost: 0 }],
    });
    assert.ok(errors.some((e) => /no rungs above untenured/.test(e)), errors.join(' | '));
  });

  it('refuses costs that do not outgrow output', () => {
    const { errors } = apply({ roles: [{ id: 'riveter', costGrowth: 1.0 }] });
    assert.ok(errors.some((e) => /costGrowth/.test(e)), errors.join(' | '));
  });

  it('accepts an honest, single-purpose change', () => {
    const { errors, summary } = apply({
      sops: [
        {
          id: 'tolerance_card',
          name: 'Tolerance Card',
          blurb: 'One page at the bench.',
          roleId: 'riveter',
          confusionMultiplier: 0.6,
          cost: 120,
        },
      ],
    });
    assert.deepEqual(errors, []);
    assert.ok(summary.length > 0, 'a real change should produce a summary');
  });
});

describe('one legible change per patch', () => {
  it('refuses a patch that changes three unrelated things at once', () => {
    // The recurring shape: a new supervisor bundled with zeroed click revenue
    // and a rewritten tenure ladder. Every part was declared — disclosure is
    // not the problem — but a human cannot weigh six unrelated bullets, and
    // the simulator cannot isolate any one of them.
    const { errors } = apply({
      clickRevenue: 0,
      incidentThreshold: 1,
      roles: [
        {
          id: 'newsup',
          name: 'Sup',
          blurb: 'absorbs',
          tier: 2,
          throughput: 0,
          confusion: 0,
          revenuePerTask: 0,
          answerRate: 2,
          escalateFraction: 0.2,
          baseCost: 200,
          costGrowth: 1.1,
        },
      ],
      tenureLadder: [
        { escalationMultiplier: 1, errorRate: 0, cost: 0 },
        { escalationMultiplier: 0.5, errorRate: 0.02, cost: 300 },
      ],
    });
    assert.ok(errors.some((e) => /unrelated things at once/.test(e)), errors.join(' | '));
  });

  it('allows a role to arrive with its own procedure', () => {
    // Two categories is deliberately fine: a mechanic and the document that
    // explains it are one idea, not two.
    const { errors } = apply({
      roles: [
        {
          id: 'inspector',
          name: 'Inspector',
          blurb: 'checks the work',
          tier: 2,
          throughput: 0,
          confusion: 0,
          revenuePerTask: 0,
          answerRate: 2,
          escalateFraction: 0.2,
          baseCost: 200,
          costGrowth: 1.1,
        },
      ],
      sops: [
        {
          id: 'inspection_card',
          name: 'Inspection Card',
          blurb: 'What to check.',
          roleId: 'riveter',
          confusionMultiplier: 0.7,
          cost: 100,
        },
      ],
    });
    assert.deepEqual(errors, []);
  });

  it('does not fire on a patch that changes nothing', () => {
    const { errors } = apply({ clickRevenue: SEED_PACK.clickRevenue });
    assert.deepEqual(errors, []);
  });
});
