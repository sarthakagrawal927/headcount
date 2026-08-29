/**
 * HEADCOUNT — deterministic simulation engine.
 *
 * Design constraints, in priority order:
 *  1. Deterministic. Same ContentPack + policy + duration => byte-identical
 *     telemetry. The agent's design proposals are judged by simulation, so the
 *     simulator must not be able to disagree with itself.
 *  2. Headless and fast. A ten-hour game run must simulate in milliseconds so a
 *     subagent can score hundreds of candidate designs.
 *  3. Pure. `step` takes state and returns state; nothing here touches I/O.
 *
 * Error and defect rates are applied as expected values rather than sampled.
 * Sampling would make simulation results noisy and force the agent to average
 * many runs to see through the variance — which costs time and buys nothing,
 * because the quantity it actually needs to reason about is the mean.
 */

import type {
  ContentPack,
  GameState,
  Role,
  Telemetry,
} from './types.js';

/** Price of the next unit of a role, given how many are already owned. */
export function unitCost(role: Role, owned: number): number {
  return role.baseCost * Math.pow(role.costGrowth, owned);
}

/**
 * Coordination overhead — Brooks's Law as a multiplier.
 *
 * Every manager, the player included, can hold only so many reports before
 * ownership gets blurry and people start asking about things that used to be
 * obvious. Past that limit each additional hire raises confusion for the whole
 * workforce, so over-hiring stops being merely wasteful and starts being
 * actively harmful. Without this term the supervisor tier is optional; with it
 * the supervisor tier is survival.
 */
export function coordinationMultiplier(
  pack: ContentPack,
  state: GameState,
): number {
  const limit = pack.spanOfControl ?? 0;
  const k = pack.coordinationPenalty ?? 0;
  if (limit <= 0 || k <= 0) return 1;

  const workers = pack.roles
    .filter((r) => r.tier === 1)
    .reduce((n, r) => n + (state.headcount[r.id] ?? 0), 0);
  const managers = pack.roles
    .filter((r) => r.tier >= 2)
    .reduce((n, r) => n + (state.headcount[r.id] ?? 0), 0);

  // The player counts as a manager whether they want to or not.
  const span = workers / (managers + 1);
  if (span <= limit) return 1;
  return 1 + k * ((span - limit) / limit);
}

/**
 * Diminishing returns past a soft cap.
 *
 * Only the units beyond the threshold are discounted, so a cap slows a
 * strategy down rather than ending it — the point is to retire a dominant
 * option, not to delete it.
 */
export function softCapMultiplier(role: Role, state: GameState): number {
  const cap = role.softCap;
  if (!cap) return 1;

  const counted =
    cap.when === 'queueAbove' ? state.queue : (state.headcount[role.id] ?? 0);
  if (counted <= cap.threshold) return 1;

  if (cap.when === 'queueAbove') return cap.throughputMultiplier;

  // Headcount caps apply to the excess only: the first `threshold` units are
  // unaffected, so crossing it is a bend in the curve and not a cliff.
  const owned = state.headcount[role.id] ?? 0;
  if (owned === 0) return 1;
  const full = cap.threshold;
  const excess = owned - full;
  return (full + excess * cap.throughputMultiplier) / owned;
}

/** Effective confusion for a role after SOPs, tenure and coordination. */
export function effectiveConfusion(
  role: Role,
  pack: ContentPack,
  state: GameState,
): number {
  const sopMultiplier = pack.sops
    .filter((s) => s.roleId === role.id && state.sops.includes(s.id))
    .reduce((acc, s) => acc * s.confusionMultiplier, 1);

  const level = state.tenure[role.id] ?? 0;
  const rung = pack.tenureLadder[Math.min(level, pack.tenureLadder.length - 1)];

  return (
    role.confusion *
    sopMultiplier *
    rung.escalationMultiplier *
    coordinationMultiplier(pack, state)
  );
}

export function createInitialState(pack: ContentPack): GameState {
  const headcount: Record<string, number> = {};
  const tenure: Record<string, number> = {};
  for (const role of pack.roles) {
    headcount[role.id] = 0;
    tenure[role.id] = 0;
  }
  return {
    t: 0,
    cash: 0,
    lifetimeCash: 0,
    tasksCompleted: 0,
    defects: 0,
    headcount,
    sops: [],
    tenure,
    queue: 0,
    answered: 0,
    incidents: 0,
    seed: 1,
  };
}

/** The player doing the work by hand — the opening beat of the genre. */
export function manualWork(state: GameState, pack: ContentPack): GameState {
  return {
    ...state,
    cash: state.cash + pack.clickRevenue,
    lifetimeCash: state.lifetimeCash + pack.clickRevenue,
    tasksCompleted: state.tasksCompleted + 1,
  };
}

/**
 * Advance the simulation by `dt` seconds.
 *
 * The load-bearing rule: every unanswered question blocks exactly one worker.
 * Escalations scale with headcount; the player's answer rate does not. So the
 * queue is what converts "hire more people" from a solution into the problem.
 */
export function step(
  state: GameState,
  pack: ContentPack,
  dt: number,
): { state: GameState; telemetry: Telemetry } {
  const producers = pack.roles.filter((r) => r.tier === 1);
  const supervisors = pack.roles.filter((r) => r.tier >= 2);

  const totalProducers = producers.reduce(
    (n, r) => n + (state.headcount[r.id] ?? 0),
    0,
  );

  // Blocked workers are waiting on an answer and produce nothing.
  const blocked = Math.min(state.queue, totalProducers);
  const activeFraction =
    totalProducers > 0 ? (totalProducers - blocked) / totalProducers : 0;

  let cashEarned = 0;
  let tasks = 0;
  let defects = 0;
  let questions = 0;

  for (const role of producers) {
    const owned = state.headcount[role.id] ?? 0;
    if (owned === 0) continue;

    const roleTasks =
      owned * activeFraction * role.throughput * softCapMultiplier(role, state) * dt;
    const level = state.tenure[role.id] ?? 0;
    const rung = pack.tenureLadder[Math.min(level, pack.tenureLadder.length - 1)];

    // Autonomy trades questions for unreviewed mistakes.
    const roleDefects = roleTasks * rung.errorRate;

    tasks += roleTasks;
    defects += roleDefects;
    cashEarned += (roleTasks - roleDefects) * role.revenuePerTask;
    questions += roleTasks * effectiveConfusion(role, pack, state);
  }

  // Supervisors answer what they can, and pass the hard ones up.
  let supervisorCapacity = 0;
  let weightedEscalate = 0;
  for (const role of supervisors) {
    const owned = state.headcount[role.id] ?? 0;
    if (owned === 0) continue;
    const capacity = owned * role.answerRate * dt;
    supervisorCapacity += capacity;
    weightedEscalate += capacity * role.escalateFraction;
  }

  const absorbed = Math.min(questions, supervisorCapacity);
  const escalateFraction =
    supervisorCapacity > 0 ? weightedEscalate / supervisorCapacity : 1;
  const reachingPlayer =
    absorbed * escalateFraction + (questions - absorbed);

  let queue = state.queue + reachingPlayer;

  // The player answers at a fixed rate. This never scales. That is the point.
  const playerAnswered = Math.min(queue, pack.playerAnswerRate * dt);
  queue -= playerAnswered;

  let totalDefects = state.defects + defects;
  let incidents = state.incidents;
  const tenure = { ...state.tenure };

  // Accumulated defects claw autonomy back — trust is spent by failure.
  while (totalDefects >= pack.incidentThreshold) {
    totalDefects -= pack.incidentThreshold;
    incidents += 1;
    const worst = Object.entries(tenure)
      .filter(([, level]) => level > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (!worst) break;
    tenure[worst[0]] = worst[1] - 1;
  }

  const next: GameState = {
    ...state,
    t: state.t + dt,
    cash: state.cash + cashEarned,
    lifetimeCash: state.lifetimeCash + cashEarned,
    tasksCompleted: state.tasksCompleted + tasks,
    defects: totalDefects,
    queue,
    answered: state.answered + playerAnswered,
    incidents,
    tenure,
  };

  const telemetry: Telemetry = {
    t: next.t,
    throughput: dt > 0 ? tasks / dt : 0,
    escalationRate: dt > 0 ? reachingPlayer / dt : 0,
    queue,
    blockedFraction: totalProducers > 0 ? blocked / totalProducers : 0,
    cash: next.cash,
    headcountTotal: Object.values(next.headcount).reduce((a, b) => a + b, 0),
  };

  return { state: next, telemetry };
}
