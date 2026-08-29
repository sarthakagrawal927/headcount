/**
 * The live game the agent is looking at.
 *
 * One process-wide instance: the MCP server, the HTTP read surface, and any
 * future UI bridge all observe the same running company. Time advances against
 * the wall clock so the agent's read of "the state" is a read of a game that
 * kept playing while it was thinking.
 */

import type { ContentPack, GameState, Telemetry } from '../engine/types.js';
import {
  buyOnce,
  loadEngine,
  loadSeedPack,
  seedState,
  type Engine,
  type PlayPolicy,
  type RunScore,
} from './engineAdapter.js';
import type { ContentPatch } from './schemas.js';

const TICK_DT = 0.25;
/** Never fast-forward more than this after a pause; a stalled process should not teleport. */
const MAX_CATCHUP_SECONDS = 30;
const TELEMETRY_CAP = 1200;

export interface PatchLogEntry {
  at: number;
  note?: string;
  summary: string[];
  version: number;
}

export interface LiveGame {
  engine: Engine;
  pack: ContentPack;
  state: GameState;
  telemetry: Telemetry[];
  policy: PlayPolicy;
  policySetAt: number | null;
  patchLog: PatchLogEntry[];
  lastWallClock: number;
}

let game: LiveGame | null = null;

export async function getGame(): Promise<LiveGame> {
  if (game) {
    advance(game);
    return game;
  }
  const engine = await loadEngine();
  const pack = await loadSeedPack();
  game = {
    engine,
    pack,
    state: seedState(pack, engine.createInitialState),
    telemetry: [],
    // A default policy so the company is actually running when the agent
    // first looks at it. Greedy is the naive optimiser: it hires into the wall.
    policy: { mode: 'greedy', label: 'default-greedy' },
    policySetAt: null,
    patchLog: [],
    lastWallClock: Date.now(),
  };
  // An idle game has to keep running while nobody is looking, or the agent's
  // "current state" is only ever a state it caused by asking.
  const ticker = setInterval(() => {
    if (game) advance(game);
  }, TICK_DT * 1000);
  ticker.unref?.();
  return game;
}

/** Advance the live game to now, applying the installed policy as it goes. */
function advance(g: LiveGame): void {
  const now = Date.now();
  let elapsed = (now - g.lastWallClock) / 1000;
  if (elapsed > MAX_CATCHUP_SECONDS) {
    // Drop the excess rather than teleporting through it.
    g.lastWallClock = now - MAX_CATCHUP_SECONDS * 1000;
    elapsed = MAX_CATCHUP_SECONDS;
  }
  const steps = Math.floor(elapsed / TICK_DT);
  if (steps <= 0) return;
  // Consume only the time actually simulated: banking the remainder is what
  // keeps frequent reads from quietly eating the clock.
  g.lastWallClock += steps * TICK_DT * 1000;

  for (let i = 0; i < steps; i++) {
    g.state = buyOnce(g.state, g.pack, g.policy, g.engine);
    const r = g.engine.step(g.state, g.pack, TICK_DT);
    g.state = r.state;
    g.telemetry.push(r.telemetry);
  }
  if (g.telemetry.length > TELEMETRY_CAP) {
    g.telemetry.splice(0, g.telemetry.length - TELEMETRY_CAP);
  }
}

/* --------------------------------------------------------- derived reads */

export interface DerivedMetrics {
  throughput: number;
  escalationRate: number;
  /** Escalations divided by what the player can personally answer. >1 = drowning. */
  attentionUtilisation: number;
  /** Fraction of producers stuck waiting on an answer. */
  blockedFraction: number;
  /** Player rate plus every supervisor's answer rate, net of what they escalate. */
  answerCapacity: number;
  queue: number;
  cashPerSecond: number;
  defectRate: number;
  headcountTotal: number;
  /** Plain-language read of where the company is on the attention curve. */
  diagnosis: string;
}

export function derive(g: LiveGame): DerivedMetrics {
  const last = g.telemetry[g.telemetry.length - 1];
  const throughput = last?.throughput ?? 0;
  const escalationRate = last?.escalationRate ?? 0;
  const blockedFraction = last?.blockedFraction ?? 0;

  const supervisorCapacity = g.pack.roles
    .filter((r) => r.tier >= 2)
    .reduce((sum, r) => sum + (g.state.headcount[r.id] ?? 0) * r.answerRate * (1 - r.escalateFraction), 0);
  const answerCapacity = g.pack.playerAnswerRate + supervisorCapacity;

  const window = g.telemetry.slice(-8);
  const cashPerSecond =
    window.length >= 2
      ? (window[window.length - 1].cash - window[0].cash) / ((window.length - 1) * TICK_DT)
      : 0;

  let producers = 0;
  let weightedError = 0;
  for (const role of g.pack.roles.filter((r) => r.tier === 1)) {
    const owned = g.state.headcount[role.id] ?? 0;
    const rung = g.pack.tenureLadder[Math.min(g.state.tenure[role.id] ?? 0, g.pack.tenureLadder.length - 1)];
    producers += owned;
    weightedError += owned * rung.errorRate;
  }
  const defectRate = producers > 0 ? weightedError / producers : 0;
  const attentionUtilisation = escalationRate / Math.max(g.pack.playerAnswerRate, 1e-9);

  let diagnosis: string;
  if (g.state.headcount && Object.values(g.state.headcount).every((n) => n === 0)) {
    diagnosis = 'Empty company — nobody hired yet.';
  } else if (blockedFraction > 0.6) {
    diagnosis = `Hard wall: ${(blockedFraction * 100).toFixed(0)}% of the workforce is idle waiting on the player. Hiring makes this worse. Look at SOPs, supervisors, or tenure.`;
  } else if (attentionUtilisation > 1) {
    diagnosis = 'Attention saturated: questions arrive faster than they can be answered. The queue is about to convert headcount into idle time.';
  } else if (attentionUtilisation > 0.6) {
    diagnosis = 'Approaching the wall: the player is answering most of the day. A few more hires will tip it.';
  } else {
    diagnosis = 'Headroom: escalations are comfortably inside answer capacity. Growth is still free.';
  }

  return {
    throughput,
    escalationRate,
    attentionUtilisation,
    blockedFraction,
    answerCapacity,
    queue: g.state.queue,
    cashPerSecond,
    defectRate,
    headcountTotal: Object.values(g.state.headcount).reduce((a, b) => a + b, 0),
    diagnosis,
  };
}

/** Per-role read that the agent needs to reason about the next purchase. */
export function roleReadout(g: LiveGame) {
  return g.pack.roles.map((role) => {
    const owned = g.state.headcount[role.id] ?? 0;
    const tenureLevel = g.state.tenure[role.id] ?? 0;
    const nextRung = g.pack.tenureLadder[tenureLevel + 1];
    return {
      id: role.id,
      name: role.name,
      tier: role.tier,
      owned,
      nextUnitCost: g.engine.unitCost(role, owned),
      effectiveConfusion: g.engine.effectiveConfusion(role, g.pack, g.state),
      baseConfusion: role.confusion,
      tenureLevel,
      nextTenureCost: nextRung ? nextRung.cost : null,
      questionsPerSecond:
        role.tier === 1 ? owned * role.throughput * g.engine.effectiveConfusion(role, g.pack, g.state) : 0,
      answersPerSecond: role.tier >= 2 ? owned * role.answerRate * (1 - role.escalateFraction) : 0,
    };
  });
}

/* ------------------------------------------------------------- patching */

/** Apply a validated diff to a pack. Pure: returns a new pack plus a changelog. */
/**
 * Domain rules the schema cannot express.
 *
 * A JSON schema will happily accept a supervisor whose answer rate is zero — a
 * manager who absorbs nothing — and models propose exactly that, repeatedly and
 * with confident prose attached. These are the invariants that make a
 * ContentPack mean what it says. Rejecting here, with the reason spelled out,
 * teaches the agent mid-run; leaving it to the simulator only teaches it that
 * the numbers came out flat.
 */
function coherenceErrors(pack: ContentPack): string[] {
  const problems: string[] = [];

  for (const role of pack.roles) {
    if (role.tier >= 2) {
      if (!(role.answerRate > 0)) {
        problems.push(
          `role "${role.id}" is tier ${role.tier} (a supervisor) but its answerRate is ${role.answerRate}. ` +
            'A supervisor exists to absorb questions; with an answer rate of zero it absorbs none and ' +
            'changes nothing. Give it a positive answerRate.',
        );
      }
      if (role.escalateFraction >= 1) {
        problems.push(
          `role "${role.id}" escalates ${role.escalateFraction} of what it handles — everything it absorbs ` +
            'is passed straight up, so it relieves nobody. Use a fraction below 1.',
        );
      }
    }

    if (role.tier === 1 && !(role.throughput > 0)) {
      problems.push(
        `role "${role.id}" is tier 1 (a producer) but its throughput is ${role.throughput}, so it produces ` +
          'nothing. Producers need positive throughput.',
      );
    }

    if (role.escalateFraction < 0 || role.escalateFraction > 1) {
      problems.push(`role "${role.id}" has escalateFraction ${role.escalateFraction}; it must be between 0 and 1.`);
    }
    if (role.costGrowth <= 1) {
      problems.push(
        `role "${role.id}" has costGrowth ${role.costGrowth}. Costs must outgrow output or there is no ` +
          'tension — use a value above 1 (1.07 to 1.15 is the usual band).',
      );
    }
  }

  const rung0 = pack.tenureLadder[0];
  if (!rung0 || rung0.escalationMultiplier !== 1 || rung0.errorRate !== 0 || rung0.cost !== 0) {
    problems.push(
      'tenureLadder index 0 is the untenured rung and must be exactly ' +
        '{ escalationMultiplier: 1, errorRate: 0, cost: 0 }.',
    );
  }
  if (pack.tenureLadder.length < 2) {
    problems.push(
      'tenureLadder has no rungs above untenured, so tenure cannot be granted at all. Replacing the ladder ' +
        'wholesale deletes the autonomy mechanic — patch the rungs you mean to change instead.',
    );
  }

  for (const sop of pack.sops) {
    if (!pack.roles.some((r) => r.id === sop.roleId)) {
      problems.push(`SOP "${sop.id}" documents role "${sop.roleId}", which does not exist.`);
    }
    if (sop.confusionMultiplier <= 0 || sop.confusionMultiplier >= 1) {
      problems.push(
        `SOP "${sop.id}" has confusionMultiplier ${sop.confusionMultiplier}; it must be between 0 and 1 ` +
          '(below 1 to reduce questions, above 0 because no document eliminates them entirely).',
      );
    }
  }

  if (!(pack.playerAnswerRate > 0)) {
    problems.push('playerAnswerRate must be positive — the player is the premise of the game.');
  }

  return problems;
}

export function applyPatchToPack(
  pack: ContentPack,
  patch: ContentPatch,
): { pack: ContentPack; summary: string[]; errors: string[] } {
  const next: ContentPack = structuredClone(pack);
  const summary: string[] = [];
  const errors: string[] = [];

  for (const scalar of ['playerAnswerRate', 'clickRevenue', 'incidentThreshold'] as const) {
    const value = patch[scalar];
    if (value !== undefined && value !== next[scalar]) {
      summary.push(`${scalar}: ${next[scalar]} -> ${value}`);
      (next[scalar] as number) = value;
    }
  }

  for (const removal of patch.removeRoles ?? []) {
    const idx = next.roles.findIndex((r) => r.id === removal);
    if (idx === -1) {
      errors.push(`removeRoles: no such role "${removal}"`);
      continue;
    }
    next.roles.splice(idx, 1);
    const orphaned = next.sops.filter((s) => s.roleId === removal).map((s) => s.id);
    next.sops = next.sops.filter((s) => s.roleId !== removal);
    summary.push(`removed role ${removal}${orphaned.length ? ` (and SOPs ${orphaned.join(', ')})` : ''}`);
  }

  for (const patchRole of patch.roles ?? []) {
    const existing = next.roles.find((r) => r.id === patchRole.id);
    if (existing) {
      const changed = Object.entries(patchRole)
        .filter(([k, v]) => k !== 'id' && v !== undefined && (existing as any)[k] !== v)
        .map(([k, v]) => `${k} ${(existing as any)[k]} -> ${v}`);
      Object.assign(existing, Object.fromEntries(Object.entries(patchRole).filter(([, v]) => v !== undefined)));
      if (changed.length) summary.push(`role ${patchRole.id}: ${changed.join(', ')}`);
    } else {
      const required = ['name', 'tier', 'throughput', 'confusion', 'revenuePerTask', 'answerRate', 'escalateFraction', 'baseCost', 'costGrowth'] as const;
      const missing = required.filter((k) => patchRole[k] === undefined);
      if (missing.length) {
        errors.push(`new role "${patchRole.id}" is missing required fields: ${missing.join(', ')}`);
        continue;
      }
      next.roles.push({ blurb: '', ...(patchRole as any) });
      summary.push(`added role ${patchRole.id} (tier ${patchRole.tier})`);
    }
  }

  for (const removal of patch.removeSops ?? []) {
    const idx = next.sops.findIndex((s) => s.id === removal);
    if (idx === -1) {
      errors.push(`removeSops: no such SOP "${removal}"`);
      continue;
    }
    next.sops.splice(idx, 1);
    summary.push(`removed SOP ${removal}`);
  }

  for (const patchSop of patch.sops ?? []) {
    const existing = next.sops.find((s) => s.id === patchSop.id);
    if (existing) {
      const changed = Object.entries(patchSop)
        .filter(([k, v]) => k !== 'id' && v !== undefined && (existing as any)[k] !== v)
        .map(([k, v]) => `${k} ${(existing as any)[k]} -> ${v}`);
      Object.assign(existing, Object.fromEntries(Object.entries(patchSop).filter(([, v]) => v !== undefined)));
      if (changed.length) summary.push(`SOP ${patchSop.id}: ${changed.join(', ')}`);
    } else {
      const missing = (['name', 'roleId', 'confusionMultiplier', 'cost'] as const).filter((k) => patchSop[k] === undefined);
      if (missing.length) {
        errors.push(`new SOP "${patchSop.id}" is missing required fields: ${missing.join(', ')}`);
        continue;
      }
      next.sops.push({ blurb: '', ...(patchSop as any) });
      summary.push(`added SOP ${patchSop.id}`);
    }
  }

  if (patch.tenureLadder) {
    next.tenureLadder = structuredClone(patch.tenureLadder);
    summary.push(`tenure ladder replaced (${patch.tenureLadder.length} rungs)`);
  }

  for (const sop of next.sops) {
    if (!next.roles.some((r) => r.id === sop.roleId)) {
      errors.push(`SOP "${sop.id}" points at missing role "${sop.roleId}"`);
    }
  }
  if (next.roles.length === 0) errors.push('the pack would have no roles left');
  if (!next.roles.some((r) => r.tier === 1)) errors.push('the pack would have no tier-1 producers, so nothing can be made');
  const rung0 = next.tenureLadder[0];
  if (!rung0 || rung0.escalationMultiplier !== 1 || rung0.errorRate !== 0 || rung0.cost !== 0) {
    errors.push('tenureLadder[0] must be the untenured rung: escalationMultiplier 1, errorRate 0, cost 0');
  }

  next.version = pack.version + 1;
  errors.push(...coherenceErrors(next));

  return { pack: next, summary, errors };
}

/* ------------------------------------------------------------ playtests */

/** Telemetry is long and repetitive; the agent only needs the shape of it. */
export function downsample(telemetry: Telemetry[], points = 24): Telemetry[] {
  if (telemetry.length <= points) return telemetry;
  const stride = telemetry.length / points;
  return Array.from({ length: points }, (_, i) => telemetry[Math.min(telemetry.length - 1, Math.floor(i * stride))]);
}

export interface PlaytestComparison {
  seconds: number;
  policy: PlayPolicy;
  baseline: RunScore;
  patched: RunScore;
  delta: Record<string, number | null>;
  verdict: string;
  curve: Telemetry[];
}

/** Run the same policy against the current pack and the patched pack. */
export function playtest(
  engine: Engine,
  basePack: ContentPack,
  patchedPack: ContentPack,
  policy: PlayPolicy,
  seconds: number,
): PlaytestComparison {
  const baseline = engine.simulate(basePack, policy, seconds).score;
  const run = engine.simulate(patchedPack, policy, seconds);
  const patched = run.score;

  const delta = {
    peakThroughput: patched.peakThroughput - baseline.peakThroughput,
    finalThroughput: patched.finalThroughput - baseline.finalThroughput,
    timeToWall:
      patched.timeToWall === null || baseline.timeToWall === null
        ? null
        : patched.timeToWall - baseline.timeToWall,
    attentionUtilisation: patched.attentionUtilisation - baseline.attentionUtilisation,
    lifetimeCash: patched.lifetimeCash - baseline.lifetimeCash,
    incidents: patched.incidents - baseline.incidents,
  };

  const notes: string[] = [];
  if (patched.degenerate) notes.push('DEGENERATE: the run never hits a wall and never uses the player. There is no game here — growth is unopposed.');
  if (patched.stalled) notes.push('STALLED: throughput collapsed to under a fifth of its peak and never recovered. The economy is a dead end.');
  if (patched.timeToWall === null && !patched.degenerate) notes.push('No wall inside the window — either the pressure is too gentle or the run is too short.');
  if (patched.timeToWall !== null) notes.push(`Wall at t=${patched.timeToWall.toFixed(1)}s (baseline ${baseline.timeToWall === null ? 'never' : baseline.timeToWall.toFixed(1) + 's'}).`);
  if (patched.incidents > baseline.incidents) notes.push(`Autonomy is being paid for: ${patched.incidents} incidents vs ${baseline.incidents} on baseline.`);
  if (!patched.degenerate && !patched.stalled && patched.timeToWall !== null) {
    notes.push('Shape holds: the run grows, meets the attention wall, and stays playable past it.');
  }
  if (delta.timeToWall === null && (patched.timeToWall === null) !== (baseline.timeToWall === null)) {
    notes.push(
      patched.timeToWall === null
        ? 'The patch removed the wall entirely — check that the game still asks anything of the player.'
        : 'The patch introduced a wall where the baseline had none.',
    );
  }

  return { seconds, policy, baseline, patched, delta, verdict: notes.join(' '), curve: downsample(run.telemetry) };
}

/* ------------------------------------------------------------ mutations */

export function installPolicy(g: LiveGame, policy: PlayPolicy): void {
  g.policy = policy;
  g.policySetAt = g.state.t;
}

export function commitPatch(g: LiveGame, pack: ContentPack, summary: string[], note?: string): void {
  g.pack = pack;
  // Headcount for a deleted role has to go, or the state references ghosts.
  for (const roleId of Object.keys(g.state.headcount)) {
    if (!pack.roles.some((r) => r.id === roleId)) {
      delete g.state.headcount[roleId];
      delete g.state.tenure[roleId];
    }
  }
  for (const role of pack.roles) {
    g.state.headcount[role.id] ??= 0;
    g.state.tenure[role.id] ??= 0;
  }
  g.state.sops = g.state.sops.filter((id) => pack.sops.some((s) => s.id === id));
  const maxRung = pack.tenureLadder.length - 1;
  for (const roleId of Object.keys(g.state.tenure)) {
    g.state.tenure[roleId] = Math.min(g.state.tenure[roleId], maxRung);
  }
  g.patchLog.push({ at: g.state.t, note, summary, version: pack.version });
}
