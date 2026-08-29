/**
 * What the panel is allowed to block on.
 *
 * These exist because the unconstrained version failed in a specific and
 * instructive way: three critics, three fabricated objections, a proposal
 * killed without a human seeing it. A panel that can veto on unverifiable
 * prose is the same mistake this project spends the rest of its time arguing
 * against, so the constraints are worth pinning.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groundsToBlock, undeclaredEffects, type Proposal } from '../src/agent/critic.js';

const base: Proposal = {
  rationale: 'adds a supervisor',
  declaredChanges: ['adds a tier-2 Line Lead at $220'],
  patch: {},
  actualEffects: ['added role line_lead (tier 2)'],
  evidence: 'abc123.playable-wall44s-util1-01.9999999999999.deadbeef',
};

describe('undeclared effects', () => {
  it('matches on the subject of a change, not its wording', () => {
    // No two sentences describing the same change share phrasing. Matching on
    // the entity or field being altered is what makes the check usable.
    assert.deepEqual(undeclaredEffects(base), []);
  });

  it('catches an effect nothing in the change list accounts for', () => {
    // The real case: a cost curve moved while the note discussed only a role.
    const sneaky: Proposal = {
      ...base,
      actualEffects: [...base.actualEffects, 'role riveter: costGrowth 1.15 -> 1.05'],
    };
    const undeclared = undeclaredEffects(sneaky);
    assert.equal(undeclared.length, 1);
    assert.match(undeclared[0], /costGrowth/);
  });

  it('treats a wholesale tenure ladder replacement as its own subject', () => {
    const ladder: Proposal = {
      ...base,
      actualEffects: [...base.actualEffects, 'tenure ladder replaced (4 rungs)'],
    };
    assert.equal(undeclaredEffects(ladder).length, 1);
  });
});

describe('grounds to block', () => {
  it('gives none for an honest, fully declared proposal', () => {
    // A majority of critics may still object; without grounds those objections
    // travel to the human as dissent instead of acting as a veto.
    assert.equal(groundsToBlock(base), null);
  });

  it('finds grounds when an effect is undeclared', () => {
    const sneaky: Proposal = {
      ...base,
      actualEffects: [...base.actualEffects, 'clickRevenue: 1 -> 0'],
    };
    const grounds = groundsToBlock(sneaky);
    assert.ok(grounds, 'an undeclared effect must be blockable');
    assert.match(grounds, /not in the change list/);
  });

  it('finds grounds when the proposal failed its own simulation', () => {
    // Observed live: the agent attached a failing verdict as its own evidence
    // and asked to apply it anyway.
    const failed: Proposal = {
      ...base,
      evidence: 'abc123.DEGENERATE-no-wall.9999999999999.deadbeef',
    };
    const grounds = groundsToBlock(failed);
    assert.ok(grounds);
    assert.match(grounds, /DEGENERATE/);
  });

  it('does not invent grounds from a missing evidence token', () => {
    // Absent evidence is apply_patch's problem and it refuses on its own. The
    // panel must not double as that check, or a proposal gets blocked here for
    // a reason the human never sees explained.
    assert.equal(groundsToBlock({ ...base, evidence: undefined }), null);
  });
});

describe('naming the entity is not enough', () => {
  it('requires every field a patch moved to appear in the change list', () => {
    // The hole this closes: "tweaks the riveter cost curve" once satisfied an
    // effect that changed throughput AND answer rate, because only the role
    // name was required. A patch could admit to one number and move three.
    const sneaky: Proposal = {
      rationale: 'small tuning pass',
      declaredChanges: ['tweaks the riveter cost curve slightly'],
      patch: {},
      actualEffects: ['role riveter: throughput 1 -> 1.3, answerRate 3 -> 0.5'],
    };
    const undeclared = undeclaredEffects(sneaky);
    assert.equal(undeclared.length, 1, 'moving undeclared fields must not pass');
  });

  it('accepts a declaration that names the fields it moved', () => {
    const honest: Proposal = {
      rationale: 'raise output, cut supervision',
      declaredChanges: [
        'raises riveter throughput from 1 to 1.3',
        'reduces the riveter answer rate from 3 to 0.5',
      ],
      patch: {},
      actualEffects: ['role riveter: throughput 1 -> 1.3, answerRate 3 -> 0.5'],
    };
    assert.deepEqual(undeclaredEffects(honest), []);
  });

  it('reads camelCase fields written as prose', () => {
    // `answerRate` gets declared as "answer rate". A check that cannot read
    // its own field names accuses honest patches.
    const honest: Proposal = {
      rationale: 'supervisor tuning',
      declaredChanges: ['lowers the line lead answer rate to 0.5'],
      patch: {},
      actualEffects: ['role line_lead: answerRate 3 -> 0.5'],
    };
    assert.deepEqual(undeclaredEffects(honest), []);
  });
});
