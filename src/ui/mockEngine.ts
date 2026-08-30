/**
 * MOCK ENGINE — a stand-in simulation so the console is playable before the
 * real engine lands.
 *
 * It implements `EngineApi` (declared in ./useGame.ts) and nothing else knows
 * it exists. To swap in the real engine, change the single import at the top
 * of ./useGame.ts. See the SEAM comment there.
 *
 * The model, in one breath:
 *   tier-1 roles complete tasks -> a fraction of tasks raise a question ->
 *   questions climb the org chart, each tier absorbing what it can and
 *   escalating a fraction of that upward -> whatever survives lands in the
 *   player's queue -> every queued question blocks a worker, so throughput
 *   falls as the queue grows. Attention is fixed. Headcount is not.
 */
import type { ContentPack, GameState, Telemetry } from '../engine/types';
import type { EngineApi } from './useGame';

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Small deterministic PRNG so a given seed replays identically. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMockEngine(content: ContentPack, seed = 0x5eed): EngineApi {
  const rng = mulberry32(seed);

  const state: GameState = {
    t: 0,
    cash: 0,
    lifetimeCash: 0,
    tasksCompleted: 0,
    defects: 0,
    headcount: {},
    sops: [],
    tenure: {},
    queue: 0,
    answered: 0,
    incidents: 0,
    prestigePoints: 0,
    prestigeCount: 0,
    seed,
  };

  const roleById = new Map(content.roles.map((r) => [r.id, r]));
  const sopById = new Map(content.sops.map((s) => [s.id, s]));

  const owned = (roleId: string) => state.headcount[roleId] ?? 0;
  const tenureIndex = (roleId: string) => state.tenure[roleId] ?? 0;

  function sopMultiplier(roleId: string) {
    let m = 1;
    for (const id of state.sops) {
      const sop = sopById.get(id);
      if (sop && sop.roleId === roleId) m *= sop.confusionMultiplier;
    }
    return m;
  }

  /**
   * Brooks's Law, in one number. Once the floor outgrows what the supervisory
   * layer can hold, every extra body makes everyone else *more* uncertain.
   * Returns a multiplier on confusion, >= 1. Disabled unless the content pack
   * declares both `spanOfControl` and `coordinationPenalty`.
   */
  function coordinationMultiplier() {
    const span = content.spanOfControl ?? 0;
    const penalty = content.coordinationPenalty ?? 0;
    if (span <= 0 || penalty <= 0) return 1;
    let reports = 0;
    let supervisors = 0;
    for (const role of content.roles) {
      const n = owned(role.id);
      if (role.tier === 1) reports += n;
      else supervisors += n;
    }
    const capacity = (supervisors + 1) * span;
    return 1 + penalty * Math.max(0, reports / capacity - 1);
  }

  function hireCost(roleId: string) {
    const role = roleById.get(roleId);
    if (!role) return Infinity;
    return Math.ceil(role.baseCost * Math.pow(role.costGrowth, owned(roleId)));
  }

  function tenureCost(roleId: string) {
    const next = content.tenureLadder[tenureIndex(roleId) + 1];
    return next ? next.cost : null;
  }

  /** Fired when defect debt crosses the threshold: tenure gets clawed back. */
  function incident() {
    state.incidents += 1;
    state.defects = Math.max(0, state.defects - content.incidentThreshold);
    for (const role of content.roles) {
      const cur = tenureIndex(role.id);
      if (cur > 0) state.tenure[role.id] = cur - 1;
    }
  }

  function tick(dt: number): Telemetry {
    state.t += dt;

    // --- how many bodies are on the floor, and how many are stuck asking ---
    let workforce = 0;
    for (const role of content.roles) if (role.tier === 1) workforce += owned(role.id);

    const blocked = workforce > 0 ? clamp01(state.queue / workforce) : 0;
    const working = 1 - blocked;

    // --- production, revenue, defects, and raw question generation ---
    let tasks = 0;
    let revenue = 0;
    let defects = 0;
    let rawQuestions = 0;
    const overhead = coordinationMultiplier();

    for (const role of content.roles) {
      const n = owned(role.id);
      if (n === 0 || role.tier !== 1) continue;

      const rung = content.tenureLadder[tenureIndex(role.id)] ?? content.tenureLadder[0];
      const done = n * role.throughput * working * dt;
      const bad = done * rung.errorRate;

      tasks += done;
      defects += bad;
      revenue += (done - bad) * role.revenuePerTask;
      rawQuestions +=
        done *
        clamp01(role.confusion * sopMultiplier(role.id) * rung.escalationMultiplier * overhead);
    }

    // --- questions climb the org chart ---
    const tiers = [...new Set(content.roles.map((r) => r.tier))].filter((t) => t > 1).sort((a, b) => a - b);
    let climbing = rawQuestions; // in questions, already dt-scaled
    for (const tier of tiers) {
      let capacity = 0;
      let escalatedWeight = 0;
      for (const role of content.roles) {
        if (role.tier !== tier) continue;
        const cap = owned(role.id) * role.answerRate * dt;
        capacity += cap;
        escalatedWeight += cap * role.escalateFraction;
      }
      if (capacity <= 0) continue;
      const absorbed = Math.min(climbing, capacity);
      const passedThrough = climbing - absorbed;
      const kickedUp = absorbed * (escalatedWeight / capacity);
      climbing = passedThrough + kickedUp;
    }

    // --- what lands on the player's desk ---
    const arriving = climbing;
    state.queue += arriving;

    const attention = content.playerAnswerRate * dt;
    const drained = Math.min(state.queue, attention);
    state.queue -= drained;
    state.answered += drained;

    state.tasksCompleted += tasks;
    state.defects += defects;
    state.cash += revenue;
    state.lifetimeCash += revenue;
    state.seed = (state.seed * 1664525 + 1013904223) >>> 0;

    if (state.defects >= content.incidentThreshold) incident();

    return {
      t: state.t,
      throughput: dt > 0 ? tasks / dt : 0,
      escalationRate: dt > 0 ? arriving / dt : 0,
      queue: state.queue,
      blockedFraction: blocked,
      cash: state.cash,
      headcountTotal: content.roles.reduce((sum, r) => sum + owned(r.id), 0),
    };
  }

  return {
    content,
    getState: () => state,
    tick,
    hireCost,
    tenureCost,

    work() {
      // The player, personally, doing a task. No question: they already know.
      state.tasksCompleted += 1;
      state.cash += content.clickRevenue;
      state.lifetimeCash += content.clickRevenue;
    },

    answer(count = 1) {
      const cleared = Math.min(count, Math.floor(state.queue));
      if (cleared <= 0) return 0;
      state.queue -= cleared;
      state.answered += cleared;
      // A hand-answered question also unblocks a task worth of work.
      state.tasksCompleted += cleared;
      const bonus = content.clickRevenue * cleared * (1 + rng() * 0.5);
      state.cash += bonus;
      state.lifetimeCash += bonus;
      return cleared;
    },

    hire(roleId) {
      const cost = hireCost(roleId);
      if (!roleById.has(roleId) || state.cash < cost) return false;
      state.cash -= cost;
      state.headcount[roleId] = owned(roleId) + 1;
      return true;
    },

    installSop(sopId) {
      const sop = sopById.get(sopId);
      if (!sop || state.sops.includes(sopId) || state.cash < sop.cost) return false;
      state.cash -= sop.cost;
      state.sops = [...state.sops, sopId];
      return true;
    },

    grantTenure(roleId) {
      const cost = tenureCost(roleId);
      if (cost === null || state.cash < cost) return false;
      state.cash -= cost;
      state.tenure[roleId] = tenureIndex(roleId) + 1;
      return true;
    },
  };
}
