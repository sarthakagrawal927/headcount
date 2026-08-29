/**
 * ============================================================================
 *  THE SEAM
 * ============================================================================
 *  Every piece of engine access in the UI goes through this module. Nothing
 *  else in src/ui imports the engine, the mock, or any simulation code.
 *
 *  To plug in the real engine, change exactly one line — the import below —
 *  to something like:
 *
 *      import { createEngine } from '../engine/engine';
 *
 *  ...as long as it satisfies the `EngineApi` interface declared here. That
 *  interface is the contract; `src/engine/types.ts` is the data model it moves
 *  around. If the real engine's factory has a different name, alias it:
 *  `import { makeGame as createEngine } from '../engine/game'`.
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContentPack, GameState, Telemetry } from '../engine/types';
import { DEFAULT_PACK, QUESTION_BANK } from './content';

// ---------------------------------------------------------------- SEAM (1/1)
import { createEngine as createLocalEngine } from '../engine/createEngine';
import { createRemoteEngine } from './remoteEngine';

/**
 * By default the console attaches to the shared company running in the MCP
 * server, so the player and the agent act on the same game. `?local=1` runs a
 * private in-browser company instead, which is useful when the server is not
 * running and for testing the engine in isolation.
 */
function createEngine(pack: ContentPack) {
  const local =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('local') === '1';
  return local ? createLocalEngine(pack) : createRemoteEngine(pack);
}
// ---------------------------------------------------------------------------

/** The surface the UI needs from any engine implementation. */
export interface EngineApi {
  /** The content pack this run was built from. */
  readonly content: ContentPack;
  /** Current authoritative state. May be returned by reference. */
  getState(): GameState;
  /** Advance the simulation by `dt` seconds and report what happened. */
  tick(dt: number): Telemetry;
  /** The player completes one task by hand. */
  work(): void;
  /** The player answers `count` questions. Returns how many were cleared. */
  answer(count?: number): number;
  /** Attempt to hire one unit of a role. Returns false if unaffordable. */
  hire(roleId: string): boolean;
  /** Attempt to install a written procedure. */
  installSop(sopId: string): boolean;
  /** Attempt to move a role one rung up the tenure ladder. */
  grantTenure(roleId: string): boolean;
  /** Price of the next unit of a role. */
  hireCost(roleId: string): number;
  /** Price of the next tenure rung, or null when the ladder is topped out. */
  tenureCost(roleId: string): number | null;
}

/* -------------------------------------------------------------------------- */
/* Presentation-side types                                                     */
/* -------------------------------------------------------------------------- */

export interface Question {
  id: number;
  roleId: string;
  roleName: string;
  where: string;
  text: string;
  /** In-game seconds when it was raised — drives the "waiting" clock. */
  raisedAt: number;
}

export type Pressure = 'nominal' | 'strained' | 'saturated' | 'critical';

export interface LogEntry {
  id: number;
  t: number;
  kind: 'hire' | 'sop' | 'tenure' | 'incident' | 'note';
  text: string;
}

export interface Sample {
  t: number;
  throughput: number;
  escalationRate: number;
  queue: number;
  blockedFraction: number;
}

export interface GameActions {
  /** The opening beat: you, personally, doing one task. */
  work(): void;
  /** Answer one question. Pass a question id to clear that specific card. */
  answer(id?: number): void;
  hire(roleId: string): void;
  installSop(sopId: string): void;
  grantTenure(roleId: string): void;
  hireCost(roleId: string): number;
  tenureCost(roleId: string): number | null;
  /** Hold / resume the shift clock. */
  toggleRunning(): void;
}

export interface GameSnapshot {
  content: ContentPack;
  state: GameState;
  telemetry: Telemetry;
  history: Sample[];
  questions: Question[];
  /** Queued questions beyond the ones we render individually. */
  hiddenQueue: number;
  pressure: Pressure;
  /** escalations arriving ÷ the player's fixed answer rate. */
  load: number;
  /** Questions per second absorbed by supervisors, by tier. */
  orgCapacity: number;
  /** Null when the content pack doesn't model span of control. */
  span: SpanReading | null;
  log: LogEntry[];
  running: boolean;
}

const TICK = 1 / 20; // simulation step, seconds
const SAMPLE_EVERY = 0.25; // chart resolution, in-game seconds
const HISTORY = 160; // ~40s of chart
const MAX_CARDS = 40; // rendered question cards before we summarise
const MAX_LOG = 40;

function pressureOf(load: number, queue: number): Pressure {
  if (queue >= 14 || load >= 1.75) return 'critical';
  if (queue >= 5 || load >= 1.0) return 'saturated';
  if (queue >= 1.5 || load >= 0.65) return 'strained';
  return 'nominal';
}

export interface SpanReading {
  /** Tier-1 bodies that need supervising. */
  reports: number;
  /** How many of them the supervisory layer (plus you) can actually hold. */
  capacity: number;
  load: number;
}

/**
 * Span of control, when the content pack declares one. Purely a readout —
 * whether exceeding it actually costs anything is the engine's business.
 */
export function spanOfControl(content: ContentPack, state: GameState): SpanReading | null {
  const span = content.spanOfControl ?? 0;
  if (span <= 0) return null;
  let reports = 0;
  let supervisors = 0;
  for (const r of content.roles) {
    const n = state.headcount[r.id] ?? 0;
    if (r.tier === 1) reports += n;
    else supervisors += n;
  }
  const capacity = (supervisors + 1) * span;
  return { reports, capacity, load: capacity > 0 ? reports / capacity : 0 };
}

/** Questions per second the hired supervisory layers can absorb. */
export function orgAnswerCapacity(content: ContentPack, state: GameState): number {
  return content.roles.reduce(
    (sum, r) => (r.tier > 1 ? sum + (state.headcount[r.id] ?? 0) * r.answerRate : sum),
    0,
  );
}

function cloneState(s: GameState): GameState {
  return { ...s, headcount: { ...s.headcount }, sops: [...s.sops], tenure: { ...s.tenure } };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dev/demo seeding via query string, e.g. `?hire=14&cash=5000&sop=1`.
 *
 * The wall only becomes visible after a few minutes of ordinary play, which
 * makes it painful to test and impossible to re-take a demo shot consistently.
 * This jumps straight to a given floor state. It only ever *adds* — it cannot
 * produce a state the player could not have reached by playing.
 */
function applyDevSeed(engine: EngineApi): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return;

  const cash = Number(params.get('cash') ?? 0);
  for (let i = 0; i < Math.max(0, Math.round(cash)); i++) engine.work();

  const hires = Number(params.get('hire') ?? 0);
  const producer = engine.content.roles.find((r) => r.tier === 1);
  if (producer) {
    for (let i = 0; i < Math.max(0, Math.round(hires)); i++) {
      if (!engine.hire(producer.id)) break;
    }
  }

  if (params.get('sop')) {
    for (const sop of engine.content.sops.slice(0, Number(params.get('sop')))) {
      engine.installSop(sop.id);
    }
  }
}

export function useGame(pack: ContentPack = DEFAULT_PACK) {
  const engine = useMemo(() => {
    const e = createEngine(pack);
    applyDevSeed(e);
    return e;
  }, [pack]);
  // Role metadata is read off the engine, not the seed pack. When the agent's
  // patch is approved the live pack changes mid-shift and the console has to
  // follow it — otherwise it renders a company that no longer exists.

  const emptyTelemetry: Telemetry = {
    t: 0,
    throughput: 0,
    escalationRate: 0,
    queue: 0,
    blockedFraction: 0,
    cash: 0,
    headcountTotal: 0,
  };

  const telemetryRef = useRef<Telemetry>(emptyTelemetry);
  const questionsRef = useRef<Question[]>([]);
  const historyRef = useRef<Sample[]>([]);
  const logRef = useRef<LogEntry[]>([
    { id: 0, t: 0, kind: 'note', text: 'Shift open. You are the only one on the floor.' },
  ]);
  const nextId = useRef(1);
  const sinceSample = useRef(0);
  const lastIncidents = useRef(0);
  const runningRef = useRef(true);

  const [running, setRunning] = useState(true);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => ({
    content: engine.content,
    state: cloneState(engine.getState()),
    telemetry: emptyTelemetry,
    history: [],
    questions: [],
    hiddenQueue: 0,
    pressure: 'nominal',
    load: 0,
    orgCapacity: 0,
    span: spanOfControl(pack, engine.getState()),
    log: logRef.current,
    running: true,
  }));

  const pushLog = useCallback((kind: LogEntry['kind'], text: string) => {
    const t = engine.getState().t;
    logRef.current = [{ id: nextId.current++, t, kind, text }, ...logRef.current].slice(0, MAX_LOG);
  }, [engine]);

  /** Keep the rendered question list in step with the engine's queue depth. */
  const reconcileQuestions = useCallback(
    (state: GameState) => {
      const target = Math.min(MAX_CARDS, Math.floor(state.queue));
      const list = questionsRef.current;

      if (list.length > target) {
        // Attention drained the oldest ones. FIFO.
        questionsRef.current = list.slice(0, target);
        return;
      }
      if (list.length === target) return;

      // Weight who is asking by who is actually hired.
      const live = engine.content;
      const names = new Map(live.roles.map((r) => [r.id, r.name] as const));
      const askers = live.roles.filter((r) => r.tier === 1 && (state.headcount[r.id] ?? 0) > 0);
      const pool = askers.length > 0 ? askers : live.roles.filter((r) => r.tier === 1);
      const weightTotal = pool.reduce((s, r) => s + Math.max(1, state.headcount[r.id] ?? 0), 0);

      const added: Question[] = [];
      for (let i = list.length; i < target; i++) {
        let pick = Math.random() * weightTotal;
        let role = pool[pool.length - 1];
        for (const r of pool) {
          pick -= Math.max(1, state.headcount[r.id] ?? 0);
          if (pick <= 0) {
            role = r;
            break;
          }
        }
        const candidates = QUESTION_BANK.filter((q) => q.roleId === role.id);
        const bank = candidates.length > 0 ? candidates : QUESTION_BANK;
        // Don't put the same question on screen twice if we can help it.
        const onScreen = new Set([...list, ...added].map((x) => x.text));
        let q = bank[Math.floor(Math.random() * bank.length)];
        for (let tries = 0; tries < 6 && onScreen.has(q.text); tries++) {
          q = bank[Math.floor(Math.random() * bank.length)];
        }
        added.push({
          id: nextId.current++,
          roleId: role.id,
          roleName: names.get(role.id) ?? role.name,
          where: q.where,
          text: q.text,
          raisedAt: state.t,
        });
      }
      questionsRef.current = [...list, ...added];
    },
    [engine],
  );

  const publish = useCallback(
    (telemetry: Telemetry) => {
      telemetryRef.current = telemetry;
      const state = engine.getState();
      reconcileQuestions(state);

      if (state.incidents !== lastIncidents.current) {
        lastIncidents.current = state.incidents;
        pushLog('incident', 'INCIDENT — defect review. Tenure clawed back one rung, floor-wide.');
      }

      const load = telemetry.escalationRate / Math.max(0.0001, engine.content.playerAnswerRate);
      setSnapshot({
        content: engine.content,
        state: cloneState(state),
        telemetry,
        history: historyRef.current,
        questions: questionsRef.current,
        hiddenQueue: Math.max(0, Math.floor(state.queue) - questionsRef.current.length),
        pressure: pressureOf(load, state.queue),
        load,
        orgCapacity: orgAnswerCapacity(pack, state),
        span: spanOfControl(pack, state),
        log: logRef.current,
        running: runningRef.current,
      });
    },
    [engine, pack, pushLog, reconcileQuestions],
  );

  // --- the clock -----------------------------------------------------------
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    let sincePublish = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const elapsed = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!runningRef.current) return;

      carry += elapsed;
      let telemetry: Telemetry | null = null;
      let guard = 0;
      while (carry >= TICK && guard++ < 30) {
        carry -= TICK;
        telemetry = engine.tick(TICK);
        sinceSample.current += TICK;
        if (sinceSample.current >= SAMPLE_EVERY) {
          sinceSample.current = 0;
          const next = [
            ...historyRef.current,
            {
              t: telemetry.t,
              throughput: telemetry.throughput,
              escalationRate: telemetry.escalationRate,
              queue: telemetry.queue,
              blockedFraction: telemetry.blockedFraction,
            },
          ];
          historyRef.current = next.length > HISTORY ? next.slice(next.length - HISTORY) : next;
        }
      }

      sincePublish += elapsed;
      if (telemetry && sincePublish >= 0.06) {
        sincePublish = 0;
        publish(telemetry);
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine, publish]);

  // --- actions -------------------------------------------------------------
  const actions = useMemo<GameActions>(
    () => ({
      work() {
        engine.work();
        publish(telemetryRef.current);
      },
      answer(id?: number) {
        const cleared = engine.answer(1);
        if (cleared > 0) {
          questionsRef.current =
            id === undefined
              ? questionsRef.current.slice(1)
              : questionsRef.current.filter((q) => q.id !== id);
        }
        publish(telemetryRef.current);
      },
      hire(roleId: string) {
        if (engine.hire(roleId)) {
          const role = engine.content.roles.find((r) => r.id === roleId);
          const n = engine.getState().headcount[roleId] ?? 0;
          pushLog('hire', `Hired ${role?.name ?? roleId} #${n}.`);
        }
        publish(telemetryRef.current);
      },
      installSop(sopId: string) {
        if (engine.installSop(sopId)) {
          const sop = engine.content.sops.find((s) => s.id === sopId);
          pushLog('sop', `${sop?.name ?? sopId} published to the floor.`);
        }
        publish(telemetryRef.current);
      },
      grantTenure(roleId: string) {
        const before = engine.getState().tenure[roleId] ?? 0;
        if (engine.grantTenure(roleId)) {
          const role = engine.content.roles.find((r) => r.id === roleId);
          pushLog('tenure', `${role?.name ?? roleId} promoted to tenure rung ${before + 1}.`);
        }
        publish(telemetryRef.current);
      },
      hireCost: (roleId: string) => engine.hireCost(roleId),
      tenureCost: (roleId: string) => engine.tenureCost(roleId),
      toggleRunning() {
        runningRef.current = !runningRef.current;
        setRunning(runningRef.current);
        publish(telemetryRef.current);
      },
    }),
    [engine, publish, pushLog],
  );

  return { ...snapshot, running, actions };
}

export type Game = ReturnType<typeof useGame>;
