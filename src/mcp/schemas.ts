/**
 * Zod schemas for everything the agent is allowed to send us.
 *
 * Generated design is data, never code: a proposal is a `ContentPack` diff that
 * has to survive validation before it can be simulated, and survive simulation
 * before a human is asked to approve it. The `.describe()` text on every field
 * is the agent's only documentation, so it is written for an LLM reader.
 */

import { z } from 'zod';

export const RolePatchSchema = z.object({
  id: z.string().describe('Stable role id. Existing id = edit that role; new id = add a role.'),
  name: z.string().optional().describe('Display name in the org chart.'),
  blurb: z.string().optional().describe('One line of flavour. Write it like a job ad nobody proofread.'),
  tier: z.number().int().min(1).max(3).optional()
    .describe('1 = individual contributor (produces + asks questions), 2 = supervisor (absorbs questions), 3 = manager of managers.'),
  throughput: z.number().min(0).optional().describe('Tasks completed per second by one unblocked worker. Supervisors: 0.'),
  confusion: z.number().min(0).max(1).optional()
    .describe('Probability a completed task raises a question. This is the pressure on player attention — the single most load-bearing number in the game.'),
  revenuePerTask: z.number().min(0).optional().describe('Cash per non-defective task. Supervisors earn nothing directly.'),
  answerRate: z.number().min(0).optional().describe('Questions per second this role answers on the player behalf. Producers: 0.'),
  escalateFraction: z.number().min(0).max(1).optional()
    .describe('Fraction of questions a supervisor answers but still escalates upward. 0 = absorbs everything, 1 = pure middle management.'),
  baseCost: z.number().min(0).optional().describe('Price of the first unit.'),
  costGrowth: z.number().min(1).optional().describe('Geometric price growth per unit owned: cost = baseCost * growth^owned. Typical 1.10–1.40.'),
});

export const SopPatchSchema = z.object({
  id: z.string().describe('Stable SOP id. Existing id = edit, new id = add.'),
  name: z.string().optional(),
  blurb: z.string().optional(),
  roleId: z.string().optional().describe('Role this written procedure documents. Must match a role id in the pack.'),
  confusionMultiplier: z.number().min(0).max(1).optional()
    .describe('Multiplier on that role confusion. 0.5 halves how often it asks. This is the "write it down" escape from the attention wall.'),
  cost: z.number().min(0).optional(),
});

export const TenureLevelSchema = z.object({
  escalationMultiplier: z.number().min(0).max(1).describe('Multiplier on confusion — how much less this rung asks.'),
  errorRate: z.number().min(0).max(1).describe('Probability a task is silently defective. Autonomy is financed by risk.'),
  cost: z.number().min(0),
});

export const ContentPatchSchema = z.object({
  note: z.string().optional().describe('One line on the design intent. Shown to the human who approves the patch.'),
  roles: z.array(RolePatchSchema).optional().describe('Upsert by id. Fields you omit keep their current value; unlisted roles are untouched.'),
  removeRoles: z.array(z.string()).optional().describe('Role ids to delete. Also deletes SOPs pointing at them.'),
  sops: z.array(SopPatchSchema).optional().describe('Upsert by id, same merge rules as roles.'),
  removeSops: z.array(z.string()).optional(),
  tenureLadder: z.array(TenureLevelSchema).min(1).optional()
    .describe('Full replacement of the tenure ladder. Index 0 must be the untenured rung: escalationMultiplier 1, errorRate 0, cost 0.'),
  playerAnswerRate: z.number().min(0).optional()
    .describe('Questions per second the player can personally answer. The one resource that never scales — raise it only deliberately.'),
  clickRevenue: z.number().min(0).optional().describe('Cash for a task the player completes by hand.'),
  incidentThreshold: z.number().min(1).optional().describe('Defects tolerated before an incident claws a tenure rung back.'),
}).describe('A diff against the active ContentPack. Everything omitted stays as it is.');

export const PlayPolicySchema = z.object({
  mode: z.enum(['greedy', 'scripted']).default('greedy')
    .describe('greedy = buy the best marginal return affordable at every tick (the naive optimiser, and the one that walks straight into the wall). scripted = follow your ordered plan.'),
  // Deliberately a flat object rather than a discriminated union. A union
  // serialises to `oneOf`, and several model providers reject `oneOf` inside a
  // tool's parameter schema outright — which surfaces as an opaque 400 rather
  // than a useful error. The per-type field rules are documented below and
  // enforced at execution instead.
  script: z.array(
    z.object({
      type: z.enum(['hire', 'sop', 'tenure'])
        .describe('hire = add headcount to a role; sop = install a written procedure; tenure = promote a role one rung.'),
      roleId: z.string().optional()
        .describe('Required for "hire" and "tenure". Ignored for "sop".'),
      sopId: z.string().optional()
        .describe('Required for "sop". Ignored otherwise.'),
      upTo: z.number().int().min(1).optional()
        .describe('For "hire": stop hiring this role once headcount reaches this number.'),
    }),
  ).optional().describe('Ordered purchase intents, retried every tick until affordable. Earlier entries win. Required when mode is "scripted".'),
  label: z.string().optional().describe('Archetype name, e.g. "hire-only", "sop-first", "tenure-rush". Use it when comparing playtests.'),
}).describe('How a run spends money. This is the "player" in a headless playtest.');

export type ContentPatch = z.infer<typeof ContentPatchSchema>;
export type PlayPolicyInput = z.infer<typeof PlayPolicySchema>;
