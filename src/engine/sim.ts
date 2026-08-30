/**
 * Headless simulation and scoring.
 *
 * This is the agent's evidence machine. When it proposes a design change it
 * does not get to assert the change is good — it runs it through `simulate`
 * and reports what came back. `scoreRun` deliberately reports the two ways a
 * design fails (it trivialises the economy, or it stalls it dead) rather than
 * collapsing everything into a single number, because "good" here is a shape,
 * not a scalar.
 */

import type { ContentPack, GameState, Telemetry } from './types.js';
import { prestigeGain, step, unitCost } from './engine.js';
import { buySop, grantTenure, hire, prestige } from './actions.js';

export interface PlayPolicy {
  /** `greedy` buys the best marginal revenue per cash at every opportunity. */
  mode: 'greedy' | 'scripted';
  /** For `scripted`: ordered purchase intents, retried until affordable. */
  script?: Array<
    | { type: 'hire'; roleId: string; upTo: number }
    | { type: 'sop'; sopId: string }
    | { type: 'tenure'; roleId: string }
  >;
  /** Archetype label, used when fanning playtests across subagents. */
  label?: string;
}

/** One purchasing decision. Returns the state unchanged if nothing was bought. */
function buyOnce(
  state: GameState,
  pack: ContentPack,
  policy: PlayPolicy,
): GameState {
  if (policy.mode === 'scripted' && policy.script) {
    for (const intent of policy.script) {
      if (intent.type === 'hire') {
        if ((state.headcount[intent.roleId] ?? 0) >= intent.upTo) continue;
        const r = hire(state, pack, intent.roleId);
        if (r.ok) return r.state;
      } else if (intent.type === 'sop') {
        if (state.sops.includes(intent.sopId)) continue;
        const r = buySop(state, pack, intent.sopId);
        if (r.ok) return r.state;
      } else {
        const r = grantTenure(state, pack, intent.roleId);
        if (r.ok) return r.state;
      }
    }
    return state;
  }

  // Greedy on marginal return per unit of cash — but over EVERY option, not
  // only the ones currently affordable.
  //
  // Considering just what it can afford right now looks like greed and is
  // actually myopia: cheap producers are always affordable, so the run spends
  // every dollar the moment it arrives and never accumulates enough for the
  // expensive structural purchase that would raise the ceiling. It hires
  // seventeen workers and never buys the supervisor worth seven of them.
  //
  // That was not a balance quirk. It made simulation blind to precisely the
  // changes the agent proposes most — new supervisor tiers — so a patch adding
  // one scored identically to no patch at all, and the evidence the agent cited
  // was uninformative. Saving for the best option is both better play and the
  // only way the simulator can see the design.
  let best: { ratio: number; cost: number; apply: () => GameState } | null = null;

  for (const role of pack.roles) {
    const owned = state.headcount[role.id] ?? 0;
    const cost = unitCost(role, owned);
    // Supervisors earn nothing directly; value them by attention relieved.
    const marginal =
      role.tier === 1
        ? role.throughput * role.revenuePerTask
        : role.answerRate * (1 - role.escalateFraction);
    const ratio = marginal / cost;
    if (!best || ratio > best.ratio) {
      best = {
        ratio,
        cost,
        apply: () => {
          const r = hire(state, pack, role.id);
          return r.ok ? r.state : state;
        },
      };
    }
  }

  for (const sop of pack.sops) {
    if (state.sops.includes(sop.id)) continue;
    // Value an SOP by the questions it stops from ever being asked.
    const role = pack.roles.find((r) => r.id === sop.roleId);
    if (!role) continue;
    const owned = state.headcount[role.id] ?? 0;
    const relieved =
      owned * role.throughput * role.confusion * (1 - sop.confusionMultiplier);
    const ratio = relieved / sop.cost;
    if (!best || ratio > best.ratio) {
      best = {
        ratio,
        cost: sop.cost,
        apply: () => {
          const r = buySop(state, pack, sop.id);
          return r.ok ? r.state : state;
        },
      };
    }
  }

  // Save rather than settle: if the best available purchase cannot be afforded
  // yet, buy nothing this tick.
  if (!best || best.cost > state.cash) return state;
  return best.apply();
}

export interface RunResult {
  telemetry: Telemetry[];
  final: GameState;
  score: RunScore;
}

export interface RunScore {
  peakThroughput: number;
  finalThroughput: number;
  /** First moment more than half the workforce is stuck waiting on the player. */
  timeToWall: number | null;
  /** Mean fraction of the player's answer capacity consumed. >1 means drowning. */
  attentionUtilisation: number;
  lifetimeCash: number;
  incidents: number;
  /** Throughput never stalled — the design failed to create tension. */
  degenerate: boolean;
  /** Throughput collapsed and never recovered — the design is a dead end. */
  stalled: boolean;
}

export function simulate(
  pack: ContentPack,
  policy: PlayPolicy,
  seconds: number,
  dt = 0.25,
  initial?: GameState,
): RunResult {
  let state =
    initial ??
    (() => {
      // Seed the run with the hand-work needed to afford the first hire.
      const s = createSeedState(pack);
      return s;
    })();

  const telemetry: Telemetry[] = [];
  const steps = Math.max(1, Math.round(seconds / dt));

  for (let i = 0; i < steps; i++) {
    state = maybePrestige(state, pack);
    state = buyOnce(state, pack, policy);
    const r = step(state, pack, dt);
    state = r.state;
    telemetry.push(r.telemetry);
  }

  return { telemetry, final: state, score: scoreRun(telemetry, state, pack) };
}

/**
 * Reset when it is clearly worth it.
 *
 * Without this the simulated player never resets, so a proposed reset layer
 * scores identically to no layer at all and the agent's evidence says nothing
 * about the thing it is proposing — the same blindness that once made a
 * supervisor patch indistinguishable from an empty one.
 *
 * The rule is deliberately crude, because a precise optimal-reset policy is a
 * research problem and the question here is only whether the layer does
 * anything: reset when doing so would raise the permanent multiplier by at
 * least half, and never on the first tick.
 */
function maybePrestige(state: GameState, pack: ContentPack): GameState {
  if (!pack.prestige || state.t <= 0) return state;
  const gain = prestigeGain(pack, state);
  if (gain <= 0) return state;
  if (state.prestigePoints > 0 && gain < state.prestigePoints * 0.5) return state;

  const result = prestige(state, pack);
  if (!result.ok) return state;

  // A reset leaves nothing, and a simulated player has no hands. In the real
  // game you work the line yourself back up to the first hire; without
  // modelling that, every reset ends the run at zero and a prestige layer
  // scores as a catastrophe rather than a trade. Seed the same bootstrap the
  // run started with.
  const bootstrap = Math.min(...pack.roles.map((r) => r.baseCost));
  return { ...result.state, cash: bootstrap, lifetimeCash: result.state.lifetimeCash + bootstrap };
}

function createSeedState(pack: ContentPack): GameState {
  const headcount: Record<string, number> = {};
  const tenure: Record<string, number> = {};
  for (const role of pack.roles) {
    headcount[role.id] = 0;
    tenure[role.id] = 0;
  }
  const cheapest = Math.min(...pack.roles.map((r) => r.baseCost));
  return {
    t: 0,
    cash: cheapest,
    lifetimeCash: cheapest,
    tasksCompleted: 0,
    defects: 0,
    headcount,
    sops: [],
    tenure,
    queue: 0,
    answered: 0,
    incidents: 0,
    prestigePoints: 0,
    prestigeCount: 0,
    seed: 1,
  };
}

export function scoreRun(
  telemetry: Telemetry[],
  final: GameState,
  pack: ContentPack,
): RunScore {
  const peakThroughput = telemetry.reduce((m, s) => Math.max(m, s.throughput), 0);
  const finalThroughput = telemetry.length
    ? telemetry[telemetry.length - 1].throughput
    : 0;

  const wall = telemetry.find((s) => s.blockedFraction > 0.5);
  const attentionUtilisation =
    telemetry.reduce(
      (sum, s) => sum + s.escalationRate / pack.playerAnswerRate,
      0,
    ) / Math.max(1, telemetry.length);

  return {
    peakThroughput,
    finalThroughput,
    timeToWall: wall ? wall.t : null,
    attentionUtilisation,
    lifetimeCash: final.lifetimeCash,
    incidents: final.incidents,
    degenerate: !wall && attentionUtilisation < 0.5,
    stalled: peakThroughput > 0 && finalThroughput < peakThroughput * 0.2,
  };
}
