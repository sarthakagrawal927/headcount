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

import { append, judge, readLedger, settle, standing, type Metrics, type Outcome } from './ledger.js';
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

  const seen = new Set(readLedger().map((o) => o.version));
  let pending: { version: number; before: Metrics; deadline: number } | null = null;
  let last = await readGame();

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const now = await readGame();
    if (!now) continue;

    // A settled change can be judged.
    if (pending && now.metrics && Date.now() >= pending.deadline) {
      const verdict = judge(pending.before, now.metrics);
      settle(pending.version, now.metrics, verdict.regression, verdict.reason);
      console.log(
        `  v${pending.version} ${verdict.regression ? bold('REGRESSION') : 'held'} — ${verdict.reason}`,
      );
      pending = null;
      await reconcile();
    }

    // A new change has landed.
    if (last && now.version > last.version && !seen.has(now.version)) {
      const entry = now.patchLog.find((p) => p.version === now.version);
      const outcome: Outcome = {
        version: now.version,
        at: entry?.at ?? 0,
        recordedAt: new Date().toISOString(),
        summary: entry?.summary ?? [],
        note: entry?.note ?? '',
        before: last.metrics,
        after: null,
        regression: null,
        reason: null,
      };
      append(outcome);
      seen.add(now.version);
      console.log(
        `\n  v${now.version} landed — ${outcome.summary.join('; ') || 'no summary'}` +
          dim(`\n  watching for ${SETTLE_SECONDS}s before judging it`),
      );
      pending = {
        version: now.version,
        before: last.metrics,
        deadline: Date.now() + SETTLE_SECONDS * 1000,
      };
    }

    last = now;
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
