/**
 * The single seam between the MCP layer and the simulation.
 *
 * Everything under `src/mcp` and `src/agent` talks to the game through this
 * module and nothing else. The engine is owned by a different author and moves
 * independently, so imports here are dynamic and guarded: if a module is
 * renamed or a helper has not landed yet, we degrade to a local equivalent
 * instead of taking the whole server down. Swapping engines is a one-file job.
 */

import type { ContentPack, GameState, Telemetry } from '../engine/types.js';

/* ------------------------------------------------------------------ types */

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

/** How a headless run spends its money. Mirrors `src/engine/sim.ts`. */
export interface PlayPolicy {
  /** `greedy` buys the best marginal return available at every opportunity. */
  mode: 'greedy' | 'scripted';
  /** For `scripted`: ordered purchase intents, retried until affordable. */
  script?: Array<
    | { type: 'hire'; roleId: string; upTo: number }
    | { type: 'sop'; sopId: string }
    | { type: 'tenure'; roleId: string }
  >;
  /** Archetype label, useful when fanning playtests across subagents. */
  label?: string;
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

export interface RunResult {
  telemetry: Telemetry[];
  final: GameState;
  score: RunScore;
}

export interface Engine {
  createInitialState(pack: ContentPack): GameState;
  step(state: GameState, pack: ContentPack, dt: number): { state: GameState; telemetry: Telemetry };
  unitCost(role: ContentPack['roles'][number], owned: number): number;
  effectiveConfusion(role: ContentPack['roles'][number], pack: ContentPack, state: GameState): number;
  hire(state: GameState, pack: ContentPack, roleId: string): ActionResult;
  buySop(state: GameState, pack: ContentPack, sopId: string): ActionResult;
  grantTenure(state: GameState, pack: ContentPack, roleId: string): ActionResult;
  simulate(
    pack: ContentPack,
    policy: PlayPolicy,
    seconds: number,
    dt?: number,
    initial?: GameState,
  ): RunResult;
  scoreRun(telemetry: Telemetry[], final: GameState, pack: ContentPack): RunScore;
  /** Which pieces came from `src/engine` and which are local stand-ins. */
  provenance: Record<string, 'engine' | 'adapter-fallback'>;
}

/* ------------------------------------------------------------- fallbacks */

function fallbackUnitCost(role: ContentPack['roles'][number], owned: number): number {
  return role.baseCost * Math.pow(role.costGrowth, owned);
}

function fallbackHire(state: GameState, pack: ContentPack, roleId: string): ActionResult {
  const role = pack.roles.find((r) => r.id === roleId);
  if (!role) return { ok: false, reason: `no such role: ${roleId}` };
  const owned = state.headcount[roleId] ?? 0;
  const cost = fallbackUnitCost(role, owned);
  if (state.cash < cost) return { ok: false, reason: 'insufficient cash' };
  return {
    ok: true,
    state: { ...state, cash: state.cash - cost, headcount: { ...state.headcount, [roleId]: owned + 1 } },
  };
}

function fallbackBuySop(state: GameState, pack: ContentPack, sopId: string): ActionResult {
  const sop = pack.sops.find((s) => s.id === sopId);
  if (!sop) return { ok: false, reason: `no such SOP: ${sopId}` };
  if (state.sops.includes(sopId)) return { ok: false, reason: 'already installed' };
  if (state.cash < sop.cost) return { ok: false, reason: 'insufficient cash' };
  return { ok: true, state: { ...state, cash: state.cash - sop.cost, sops: [...state.sops, sopId] } };
}

function fallbackGrantTenure(state: GameState, pack: ContentPack, roleId: string): ActionResult {
  const role = pack.roles.find((r) => r.id === roleId);
  if (!role) return { ok: false, reason: `no such role: ${roleId}` };
  const next = (state.tenure[roleId] ?? 0) + 1;
  if (next >= pack.tenureLadder.length) return { ok: false, reason: 'already fully tenured' };
  const cost = pack.tenureLadder[next].cost;
  if (state.cash < cost) return { ok: false, reason: 'insufficient cash' };
  return { ok: true, state: { ...state, cash: state.cash - cost, tenure: { ...state.tenure, [roleId]: next } } };
}

function fallbackScoreRun(telemetry: Telemetry[], final: GameState, pack: ContentPack): RunScore {
  const peakThroughput = telemetry.reduce((m, s) => Math.max(m, s.throughput), 0);
  const finalThroughput = telemetry.length ? telemetry[telemetry.length - 1].throughput : 0;
  const wall = telemetry.find((s) => s.blockedFraction > 0.5);
  const attentionUtilisation =
    telemetry.reduce((sum, s) => sum + s.escalationRate / pack.playerAnswerRate, 0) /
    Math.max(1, telemetry.length);
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

/* ------------------------------------------------------------- resolution */

async function tryImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch (err) {
    console.error(`[engineAdapter] could not load ${specifier}: ${(err as Error).message}`);
    return null;
  }
}

let cached: Engine | null = null;
let cachedPack: ContentPack | null = null;

/**
 * Resolve the engine once, mixing real exports with local stand-ins for
 * anything missing. `provenance` records which is which so the MCP server can
 * tell the agent whether it is looking at the real physics.
 */
export async function loadEngine(): Promise<Engine> {
  if (cached) return cached;

  const core = await tryImport<any>('../engine/engine.js');
  if (!core || typeof core.createInitialState !== 'function' || typeof core.step !== 'function') {
    throw new Error(
      'HEADCOUNT engine unavailable: src/engine/engine.ts must export createInitialState(pack) and step(state, pack, dt). ' +
        'This is the only place that needs changing — see src/mcp/engineAdapter.ts.',
    );
  }

  const actions = await tryImport<any>('../engine/actions.js');
  const sim = await tryImport<any>('../engine/sim.js');
  const provenance: Record<string, 'engine' | 'adapter-fallback'> = {};
  const pick = <T>(key: string, real: T | undefined, fallback: T): T => {
    const ok = typeof real === 'function';
    provenance[key] = ok ? 'engine' : 'adapter-fallback';
    return ok ? (real as T) : fallback;
  };

  const unitCost = pick('unitCost', core.unitCost, fallbackUnitCost);
  const effectiveConfusion = pick(
    'effectiveConfusion',
    core.effectiveConfusion,
    (role: any, pack: ContentPack, state: GameState) => {
      const sops = pack.sops
        .filter((s) => s.roleId === role.id && state.sops.includes(s.id))
        .reduce((acc, s) => acc * s.confusionMultiplier, 1);
      const rung = pack.tenureLadder[Math.min(state.tenure[role.id] ?? 0, pack.tenureLadder.length - 1)];
      return role.confusion * sops * rung.escalationMultiplier;
    },
  );
  provenance.createInitialState = 'engine';
  provenance.step = 'engine';

  const hire = pick('hire', actions?.hire, fallbackHire);
  const buySop = pick('buySop', actions?.buySop, fallbackBuySop);
  const grantTenure = pick('grantTenure', actions?.grantTenure, fallbackGrantTenure);
  const scoreRun = pick('scoreRun', sim?.scoreRun, fallbackScoreRun);

  /** Last-resort simulator: step the engine and buy greedily when we can. */
  const fallbackSimulate = (
    pack: ContentPack,
    policy: PlayPolicy,
    seconds: number,
    dt = 0.25,
    initial?: GameState,
  ): RunResult => {
    let state = initial ?? seedState(pack, core.createInitialState);
    const telemetry: Telemetry[] = [];
    const steps = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < steps; i++) {
      state = buyOnce(state, pack, policy, { hire, buySop, grantTenure, unitCost });
      const r = core.step(state, pack, dt);
      state = r.state;
      telemetry.push(r.telemetry);
    }
    return { telemetry, final: state, score: scoreRun(telemetry, state, pack) };
  };

  const simulate = pick('simulate', sim?.simulate, fallbackSimulate);

  cached = {
    createInitialState: core.createInitialState,
    step: core.step,
    unitCost,
    effectiveConfusion,
    hire,
    buySop,
    grantTenure,
    simulate,
    scoreRun,
    provenance,
  };
  return cached;
}

/** The seed ContentPack the live game boots with. */
export async function loadSeedPack(): Promise<ContentPack> {
  if (cachedPack) return structuredClone(cachedPack);
  const content = await tryImport<any>('../engine/content.js');
  const pack = content?.SEED_PACK ?? content?.defaultPack ?? content?.default;
  if (!pack || !Array.isArray(pack.roles)) {
    throw new Error(
      'HEADCOUNT content unavailable: src/engine/content.ts must export a ContentPack (SEED_PACK). ' +
        'See src/mcp/engineAdapter.ts.',
    );
  }
  cachedPack = pack as ContentPack;
  return structuredClone(cachedPack);
}

/**
 * A run needs enough cash for the first hire or nothing ever happens; the
 * genre calls this the opening click. We seed it rather than simulate clicking.
 */
export function seedState(pack: ContentPack, createInitialState: (p: ContentPack) => GameState): GameState {
  const base = createInitialState(pack);
  const cheapest = Math.min(...pack.roles.map((r) => r.baseCost));
  return { ...base, cash: Math.max(base.cash, cheapest), lifetimeCash: Math.max(base.lifetimeCash, cheapest) };
}

/**
 * One purchasing decision under a policy. Used by the live game (which the
 * engine's own simulator cannot drive) and by the fallback simulator.
 */
export function buyOnce(
  state: GameState,
  pack: ContentPack,
  policy: PlayPolicy,
  api: Pick<Engine, 'hire' | 'buySop' | 'grantTenure' | 'unitCost'>,
): GameState {
  if (policy.mode === 'scripted' && policy.script) {
    for (const intent of policy.script) {
      if (intent.type === 'hire') {
        if ((state.headcount[intent.roleId] ?? 0) >= intent.upTo) continue;
        const r = api.hire(state, pack, intent.roleId);
        if (r.ok) return r.state;
      } else if (intent.type === 'sop') {
        if (state.sops.includes(intent.sopId)) continue;
        const r = api.buySop(state, pack, intent.sopId);
        if (r.ok) return r.state;
      } else {
        const r = api.grantTenure(state, pack, intent.roleId);
        if (r.ok) return r.state;
      }
    }
    return state;
  }

  let best: { ratio: number; apply: () => GameState } | null = null;

  for (const role of pack.roles) {
    const owned = state.headcount[role.id] ?? 0;
    const cost = api.unitCost(role, owned);
    if (cost > state.cash) continue;
    const marginal =
      role.tier === 1
        ? role.throughput * role.revenuePerTask
        : role.answerRate * (1 - role.escalateFraction);
    const ratio = marginal / cost;
    if (!best || ratio > best.ratio) {
      best = {
        ratio,
        apply: () => {
          const r = api.hire(state, pack, role.id);
          return r.ok ? r.state : state;
        },
      };
    }
  }

  for (const sop of pack.sops) {
    if (state.sops.includes(sop.id) || sop.cost > state.cash) continue;
    const role = pack.roles.find((r) => r.id === sop.roleId);
    if (!role) continue;
    const owned = state.headcount[role.id] ?? 0;
    const relieved = owned * role.throughput * role.confusion * (1 - sop.confusionMultiplier);
    const ratio = relieved / sop.cost;
    if (!best || ratio > best.ratio) {
      best = {
        ratio,
        apply: () => {
          const r = api.buySop(state, pack, sop.id);
          return r.ok ? r.state : state;
        },
      };
    }
  }

  return best ? best.apply() : state;
}

export type { ContentPack, GameState, Telemetry };
