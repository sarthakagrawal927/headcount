/**
 * The ledger decides whether an agent keeps its autonomy, so its judgement is
 * the most consequential logic here and the easiest to get subtly wrong in the
 * generous direction.
 *
 * The bias these tests encode: when in doubt, call it a regression. A false
 * regression costs the agent autonomy it has to re-earn. A missed one leaves it
 * acting alone after it has already broken something.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { judge, standing, type Metrics, type Outcome } from '../src/agent/ledger.js';

const healthy: Metrics = {
  throughput: 4.0,
  attentionUtilisation: 0.95,
  blockedFraction: 0.3,
};

function outcome(version: number, regression: boolean | null): Outcome {
  return {
    version,
    at: version * 10,
    recordedAt: new Date(version * 1000).toISOString(),
    summary: [],
    note: '',
    before: healthy,
    after: regression === null ? null : healthy,
    regression,
    reason: regression === null ? null : 'test',
  };
}

describe('judging a change that has landed', () => {
  it('accepts a change that left the floor alone', () => {
    assert.equal(judge(healthy, { ...healthy, throughput: 4.1 }).regression, false);
  });

  it('catches the collapse that passed simulation', () => {
    // The real case: riveter confusion 0.3 -> 0.9 cleared every pre-flight
    // check, then took two thirds of the floor's output with it.
    const v = judge(healthy, { ...healthy, throughput: 1.56 });
    assert.equal(v.regression, true);
    assert.match(v.reason, /throughput fell/);
  });

  it('catches a change that quietly blocks the workforce', () => {
    const v = judge(healthy, { ...healthy, blockedFraction: 0.8 });
    assert.equal(v.regression, true);
    assert.match(v.reason, /blocked workforce/);
  });

  it('treats removing the player job as a regression, not a win', () => {
    // Every headline metric improves when nobody needs to be asked anything.
    // That is the failure mode the whole game is about, so it must not read as
    // success here either.
    const v = judge(healthy, {
      throughput: 4.0,
      attentionUtilisation: 0.02,
      blockedFraction: 0.0,
    });
    assert.equal(v.regression, true);
    assert.match(v.reason, /removed the player/);
  });

  it('does not fire on a floor that was already quiet', () => {
    // Low attention that was low beforehand is not evidence about this change.
    const quiet: Metrics = { throughput: 1, attentionUtilisation: 0.1, blockedFraction: 0 };
    assert.equal(judge(quiet, { ...quiet, attentionUtilisation: 0.05 }).regression, false);
  });

  it('tolerates ordinary noise without punishing the agent', () => {
    assert.equal(
      judge(healthy, { ...healthy, throughput: 3.6 }).regression,
      false,
      'a 10% dip is noise, not a regression',
    );
  });
});

describe('standing', () => {
  it('counts only consecutive clean changes', () => {
    const s = standing([outcome(1, false), outcome(2, true), outcome(3, false), outcome(4, false)]);
    assert.equal(s.cleanStreak, 2, 'the streak restarts after a regression');
    assert.equal(s.shipped, 4);
    assert.equal(s.regressions, 1);
  });

  it('reports a streak of zero immediately after a regression', () => {
    assert.equal(standing([outcome(1, false), outcome(2, false), outcome(3, true)]).cleanStreak, 0);
  });

  it('ignores changes still inside their observation window', () => {
    // An unsettled change has not been judged, so it must not count toward
    // clearance — otherwise autonomy could be earned by shipping fast enough
    // that nothing has been measured yet.
    const s = standing([outcome(1, false), outcome(2, null), outcome(3, null)]);
    assert.equal(s.cleanStreak, 1);
    assert.equal(s.shipped, 1);
  });

  it('starts from nothing', () => {
    const s = standing([]);
    assert.equal(s.cleanStreak, 0);
    assert.equal(s.lastRegressionAt, null);
  });
});
