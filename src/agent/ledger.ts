/**
 * The record autonomy is granted against.
 *
 * Clearance in this project is not a flag somebody sets. It is a consequence of
 * what the agent has actually shipped, so something has to remember that — and
 * remember it in a form a human can audit, because "the agent may now act
 * alone" is not a claim to make from memory.
 *
 * One JSON line per shipped change: what it was, what the simulator said before
 * it went in, and what the running company did afterwards. Everything the
 * autonomy policy decides is derived from this file and nothing else.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LEDGER_PATH = process.env.LEDGER_PATH ?? '.headcount/ledger.jsonl';

export interface Outcome {
  /** Pack version this change produced. */
  version: number;
  /** In-game time the change landed. */
  at: number;
  /** Wall-clock, so a human reading the file can line it up with a session. */
  recordedAt: string;
  /** What the change actually did, as computed by the server — not as described. */
  summary: string[];
  /** The agent's stated reason. Kept for audit, never used in the decision. */
  note: string;
  /** Floor metrics immediately before the change. */
  before: Metrics;
  /** Floor metrics after settling. Null until the observation window closes. */
  after: Metrics | null;
  /** Set once `after` is known. */
  regression: boolean | null;
  /** Why it was judged that way, in one line. */
  reason: string | null;
}

export interface Metrics {
  throughput: number;
  attentionUtilisation: number;
  blockedFraction: number;
}

function ensureDir(): void {
  const dir = dirname(LEDGER_PATH);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readLedger(): Outcome[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as Outcome;
      } catch {
        return null;
      }
    })
    .filter((x): x is Outcome => x !== null);
}

export function append(entry: Outcome): void {
  ensureDir();
  appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
}

/**
 * Replace the most recent entry for a version — used to fill in `after` once
 * the observation window closes. Rewriting rather than appending keeps one
 * line per shipped change, which is what makes the file readable.
 */
export function settle(version: number, after: Metrics, regression: boolean, reason: string): void {
  const all = readLedger();
  const idx = all.map((o) => o.version).lastIndexOf(version);
  if (idx === -1) return;
  all[idx] = { ...all[idx], after, regression, reason };
  ensureDir();
  const body = all.map((o) => JSON.stringify(o)).join('\n') + '\n';
  writeAtomic(body);
}

function writeAtomic(body: string): void {
  const tmp = `${LEDGER_PATH}.tmp`;
  writeFileSync(tmp, body);
  // Rename is atomic on POSIX, so a reader never sees a half-written ledger.
  renameSync(tmp, LEDGER_PATH);
}

/**
 * Did the change make the running company worse?
 *
 * Deliberately blunt, and deliberately not a judgement about design quality —
 * that is what simulation is for. This asks only whether the floor got worse
 * after a change reached it, which is the question autonomy should turn on.
 */
export function judge(before: Metrics, after: Metrics): { regression: boolean; reason: string } {
  if (after.throughput < before.throughput * 0.75) {
    return {
      regression: true,
      reason:
        `throughput fell from ${before.throughput.toFixed(2)} to ${after.throughput.toFixed(2)} ` +
        'tasks/s after the change landed',
    };
  }
  if (after.blockedFraction > before.blockedFraction + 0.25) {
    return {
      regression: true,
      reason:
        `blocked workforce rose from ${(before.blockedFraction * 100).toFixed(0)}% to ` +
        `${(after.blockedFraction * 100).toFixed(0)}%`,
    };
  }
  // A floor nobody has to attend to is a failure of a different kind: the game
  // stops needing a player. Simulation calls this degenerate; here it just
  // means the change removed the thing that made the job interesting.
  if (after.attentionUtilisation < 0.15 && before.attentionUtilisation > 0.5) {
    return {
      regression: true,
      reason:
        `attention utilisation collapsed from ${before.attentionUtilisation.toFixed(2)} to ` +
        `${after.attentionUtilisation.toFixed(2)} — the change removed the player's job`,
    };
  }
  return {
    regression: false,
    reason:
      `throughput ${before.throughput.toFixed(2)} -> ${after.throughput.toFixed(2)}, ` +
      `attention ${before.attentionUtilisation.toFixed(2)} -> ${after.attentionUtilisation.toFixed(2)}`,
  };
}

export interface Standing {
  /** Settled changes with no regression, most recent first, uninterrupted. */
  cleanStreak: number;
  shipped: number;
  regressions: number;
  lastRegressionAt: string | null;
}

/** The agent's standing, derived only from settled entries. */
export function standing(ledger: Outcome[] = readLedger()): Standing {
  const settled = ledger.filter((o) => o.regression !== null);
  let streak = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].regression) break;
    streak++;
  }
  const regressions = settled.filter((o) => o.regression);
  return {
    cleanStreak: streak,
    shipped: settled.length,
    regressions: regressions.length,
    lastRegressionAt: regressions.length ? regressions[regressions.length - 1].recordedAt : null,
  };
}

export { LEDGER_PATH };
