/**
 * The seed ContentPack — deliberately small.
 *
 * This is where the agent starts, not where it ends. One producing role, one
 * supervising role, one written procedure, and a tenure ladder. Everything
 * beyond this is meant to be designed by the agent, simulated, and approved by
 * a human before it reaches the live game.
 *
 * Tuning note: at confusion 0.30 and one task/sec, each riveter sends ~0.30
 * questions/sec at a player who can answer 1.0. So the wall lands at roughly
 * the fourth hire — early enough to be felt inside a three-minute demo.
 */

import type { ContentPack } from './types.js';

export const SEED_PACK: ContentPack = {
  version: 1,
  playerAnswerRate: 1.0,
  clickRevenue: 1,
  incidentThreshold: 25,
  // Six reports is where a single manager starts losing the thread.
  spanOfControl: 6,
  coordinationPenalty: 0.35,

  roles: [
    {
      id: 'riveter',
      name: 'Riveter',
      blurb: 'Hits the thing with the hammer. Sometimes unsure which thing.',
      tier: 1,
      throughput: 1.0,
      confusion: 0.3,
      revenuePerTask: 1,
      answerRate: 0,
      escalateFraction: 0,
      baseCost: 10,
      costGrowth: 1.15,
    },
    {
      id: 'line_lead',
      name: 'Line Lead',
      blurb: 'Fields questions from the floor. Escalates only the genuinely hard ones.',
      tier: 2,
      throughput: 0,
      confusion: 0,
      revenuePerTask: 0,
      answerRate: 3.0,
      escalateFraction: 0.15,
      baseCost: 220,
      costGrowth: 1.3,
    },
  ],

  sops: [
    {
      id: 'rivet_spec',
      name: 'Rivet Specification v1',
      blurb: 'Two pages. Halves the number of times anyone asks about tolerances.',
      roleId: 'riveter',
      confusionMultiplier: 0.5,
      cost: 150,
    },
  ],

  // Index 0 is untenured: asks about everything, gets everything right.
  tenureLadder: [
    { escalationMultiplier: 1.0, errorRate: 0.0, cost: 0 },
    { escalationMultiplier: 0.55, errorRate: 0.02, cost: 300 },
    { escalationMultiplier: 0.3, errorRate: 0.05, cost: 1200 },
    { escalationMultiplier: 0.12, errorRate: 0.1, cost: 5000 },
  ],
};
