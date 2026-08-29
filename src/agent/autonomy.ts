/**
 * The supervisor: an independent process that decides how much the agent is
 * allowed to do on its own, based on what it has actually shipped.
 *
 * This is the mechanic the project is really about. Approval gates are a good
 * default and a bad steady state — a human who must approve everything forever
 * ends up approving everything without reading it, which is worse than no gate
 * at all. So autonomy here is a consequence rather than a setting:
 *
 *   - it watches the live game for changes the agent has landed
 *   - it measures the floor before and after each one
 *   - a run of changes that did not make things worse earns clearance
 *   - one that did takes it back immediately
 *
 * It talks to nothing but the game's read surface and the harness's agent API,
 * which means it works no matter who or what applied the change — the driver
 * script, the chat UI, or a person. There is no cooperation to forget.
 *
 *   npx tsx src/agent/autonomy.ts          # run the supervisor
 *   npx tsx src/agent/autonomy.ts --once   # evaluate standing and exit
 */

import { append, entryKey, judge, readLedger, settle, standing, type Metrics, type Outcome } from './ledger.js';
import { grantClearance, readClearance, revokeClearance } from './trust.js';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:3001';
const POLL_MS = Number(process.env.AUTONOMY_POLL_MS ?? 2000);

/**
 * How long to let a change settle before judging it.
 *
 * The floor is a feedback system: a change ripples through the queue before
 * throughput finds its new level, so measuring immediately measures the
 * transient rather than the outcome.
 */
const SETTLE_SECONDS = Number(process.env.AUTONOMY_SETTLE_SECONDS ?? 25);

/** Clean changes required before the agent may apply patches unattended. */
const CLEARANCE_THRESHOLD = Number(process.env.AUTONOMY_THRESHOLD ?? 3);

/** The tool autonomy is granted over. The rest stay gated regardless. */
const EARNABLE = 'apply_patch';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

interface GameView {
  /** Identifies this run of the game process; versions restart with it. */
  bootId: string;
  version: number;
  metrics: Metrics;
  patchLog: Array<{ at: number; note: string; summary: string[]; version: number }>;
}

async function readGame(): Promise<GameView | null> {
  try {
    const res = await fetch(`${GAME_URL}/game`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return {
      bootId: String(data.bootId ?? 'unknown'),
      version: data.pack?.version ?? 0,
      metrics: {
        throughput: Number(data.derived?.throughput ?? 0),
        attentionUtilisation: Number(data.derived?.attentionUtilisation ?? 0),
        blockedFraction: Number(data.derived?.blockedFraction ?? 0),
      },
      patchLog: data.patchLog ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Bring the agent's gate into line with what it has earned.
 *
 * Idempotent, and deliberately re-checked on every decision rather than
 * tracked in memory: the manifest is the source of truth, and something else
 * may have changed it.
 */
async function reconcile(): Promise<void> {
  const s = standing();
  const current = await readClearance();
  const gated = current.gated.includes(EARNABLE);
  const earned = s.cleanStreak >= CLEARANCE_THRESHOLD;

  if (earned && gated) {
    await grantClearance(EARNABLE);
    console.log(
      bold(`\n  CLEARANCE GRANTED — ${EARNABLE}`) +
        dim(`\n  ${s.cleanStreak} consecutive changes shipped without a regression.` +
          `\n  It no longer needs a human for this.\n`),
    );
  } else if (!earned && !gated) {
    await revokeClearance(EARNABLE);
    console.log(
      bold(`\n  CLEARANCE REVOKED — ${EARNABLE}`) +
        dim(`\n  clean streak is ${s.cleanStreak}, below the threshold of ${CLEARANCE_THRESHOLD}.` +
          `\n  It is asking again.\n`),
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--once')) {
    const s = standing();
    console.log(JSON.stringify({ standing: s, clearance: await readClearance() }, null, 2));
    return;
  }

  console.log(dim(`supervisor watching ${GAME_URL} — ${CLEARANCE_THRESHOLD} clean changes earns ${EARNABLE}\n`));

  // A change whose observation window was still open when the supervisor died
  // can never be judged: the floor it would have been measured against is gone.
  // Leaving it unresolved sounds neutral and is not — `standing` ignores
  // unsettled entries, so a change that shipped moments before a crash would
  // count neither for nor against clearance, and a regression could disappear
  // by being badly timed. Unobserved is treated as failed, which is the same
  // bias every other judgement here takes.
  const stranded = readLedger().filter((o) => o.regression === null);
  for (const o of stranded) {
    settle(
      { bootId: o.bootId, version: o.version },
      o.before,
      true,
      'never observed — the supervisor was not running when its window closed',
    );
  }
  if (stranded.length) {
    console.log(
      dim(`  ${stranded.length} change(s) were mid-observation at the last shutdown; counted as unproven.\n`),
    );
  }

  // Bring the live gate in line with the record before watching anything.
  // reconcile only ran after a settle, so a regression recorded before a
  // restart left earned clearance in place until the *next* change happened to
  // land — and on a quiet system that could be never.
  await reconcile();

  // Keyed by run and version together. Keying on version alone meant that
  // after a server restart — when versions begin again at 1 — a fresh run's
  // first few changes were treated as already seen and never judged, quietly
  // suspending supervision exactly when nobody was watching.
  const seen = new Set(readLedger().map(entryKey));

  /**
   * Observations still inside their settling window, keyed by version.
   *
   * A map rather than a single slot: changes can land faster than they settle,
   * and holding only the newest would leave earlier ones permanently unjudged.
   * That is worse than it sounds — an unjudged change counts neither toward
   * clearance nor against it, so a fast enough sequence would freeze the
   * agent's standing entirely.
   */
  const pending = new Map<number, { before: Metrics; deadline: number; bootId: string }>();
  let last: GameView | null = await readGame();

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const now = await readGame();
    if (!now) continue;

    // Judge everything whose window has closed. Oldest first, so the ledger
    // stays in the order changes actually landed.
    let settledAny = false;
    for (const [version, obs] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
      if (Date.now() < obs.deadline) continue;
      const verdict = judge(obs.before, now.metrics);
      settle({ bootId: obs.bootId, version }, now.metrics, verdict.regression, verdict.reason);
      console.log(
        `  v${version} ${verdict.regression ? bold('REGRESSION') : 'held'} — ${verdict.reason}`,
      );
      pending.delete(version);
      settledAny = true;
    }
    if (settledAny) await reconcile();

    // Record every change that landed since the last poll, not only the newest.
    // Several can arrive inside one interval, and a change nobody recorded is a
    // change nobody can hold the agent to.
    const previous = last;
    if (previous) {
      const landed = now.patchLog
        .filter(
          (p) => p.version > previous.version && !seen.has(entryKey({ bootId: now.bootId, version: p.version })),
        )
        .sort((a, b) => a.version - b.version);

      for (const entry of landed) {
        const outcome: Outcome = {
          bootId: now.bootId,
          version: entry.version,
          at: entry.at ?? 0,
          recordedAt: new Date().toISOString(),
          summary: entry.summary ?? [],
          note: entry.note ?? '',
          before: previous.metrics,
          after: null,
          regression: null,
          reason: null,
        };
        append(outcome);
        seen.add(entryKey({ bootId: now.bootId, version: entry.version }));
        console.log(
          `\n  v${entry.version} landed — ${outcome.summary.join('; ') || 'no summary'}` +
            dim(`\n  watching for ${SETTLE_SECONDS}s before judging it`),
        );
        pending.set(entry.version, {
          bootId: now.bootId,
          before: previous.metrics,
          deadline: Date.now() + SETTLE_SECONDS * 1000,
        });
      }
    }

    last = now;
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
