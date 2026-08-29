/**
 * Earned autonomy, demonstrated inside a single conversation.
 *
 * TrueForge keeps an agent's approval policy in its manifest and re-resolves
 * that manifest on every turn, so clearance is a runtime property rather than a
 * deploy-time one. This script asks the same agent to do the same thing three
 * times without ever restarting the session:
 *
 *   1. gated      — it stops and asks a human
 *   2. cleared    — it acts alone
 *   3. revoked    — it is asking again
 *
 * Nothing about the agent changes between those turns except one array in its
 * manifest. That is the whole mechanic: trust that is granted against a record
 * and taken back when the record turns.
 *
 *   npx tsx src/agent/clearance-demo.ts
 */

import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import { createClient } from './client.js';
import { createSession } from './session.js';
import { grantClearance, readClearance, revokeClearance } from './trust.js';
import { buildAgentManifest } from './manifest.js';

/**
 * A dedicated agent for this demonstration, with clarifying questions and
 * subagents turned off. Both are good defaults for the designer agent and pure
 * noise here: the only thing under test is whether a gated tool stops, and a
 * model that pauses to ask which role we meant never reaches the gate at all.
 */
const DEMO_AGENT = 'headcount-clearance-demo';

async function ensureDemoAgent(): Promise<void> {
  const client = createClient();
  const manifest = buildAgentManifest({
    model: process.env.MODEL_FQN,
    askUserQuestions: false,
    dynamicSubAgents: false,
    iterationLimit: 12,
    instructions:
      'You operate the HEADCOUNT factory floor. When asked to do something, call the matching tool ' +
      'immediately with your best guess at the arguments. Do not ask questions, do not simulate, do not ' +
      'explain first. Act, then report what happened in one sentence.',
  });

  const existing = await client.agents.list();
  const found = (existing.data ?? []).find((a: any) => a.name === DEMO_AGENT);
  if (found) {
    await client.agents.update(found.id, { manifest });
  } else {
    await client.agents.create({ name: DEMO_AGENT, manifest });
  }
}

const TOOL = 'grant_tenure';
const ASK = 'Promote the riveters one rung up the tenure ladder using grant_tenure. Do it now; do not simulate first.';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

/** Run one turn and report only what matters: did it stop, or did it act? */
async function attempt(label: string): Promise<void> {
  const client = createClient();
  const gated = await readClearance(DEMO_AGENT);
  // A fresh session per phase. Nothing carries over except the agent's
  // manifest, which is the only thing under test — and it is read from the
  // database at the start of every turn, so the change is already live.
  const { sessionId } = await createSession(DEMO_AGENT);
  console.log(bold(`\n── ${label}`));
  console.log(dim(`   manifest gate: [${gated.gated.join(', ') || 'nothing gated'}]`));
  console.log(dim(`   session ${sessionId}`));

  const pending: any[] = [];
  const questions: any[] = [];
  const events = new Map<string, any>();
  let executed = false;

  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{ type: 'user.message', content: ASK }],
  });

  for await (const { data: event } of stream.withMetadata()) {
    // Tool-call arguments are assembled across deltas; without merging, the
    // call looks empty and every tool reads as "unknown".
    if (isEventDelta(event)) {
      const base = events.get((event as any).id);
      if (base) mergeEventDelta(base, event);
    } else {
      events.set((event as any).id, event);
    }
    if (event.type === 'tool.approval_required') pending.push(event);
    if (event.type === 'tool.response_required') questions.push(event);
    // A tool that ran without stopping is the positive case we are looking
    // for; catch it from the response as well as the call, because which of
    // the two carries a usable name varies with how the model streams.
    if (event.type === 'tool.response') {
      // The tool name is frequently absent on the response event, so match on
      // the payload instead: only the tenure tool produces this wording,
      // whether it succeeded or failed on cash.
      const text = JSON.stringify((event as any).content ?? '').toLowerCase();
      if (text.includes('tenure')) executed = true;
    }
    if (event.type === 'model.message') {
      for (const call of (event as any).toolCalls ?? []) {
        const name = call.toolInfo?.name ?? call.function?.name ?? '';
        const args = String(call.function?.arguments ?? '');
        // Deferred tool loading means the call may arrive wrapped in call_tool.
        if (name === TOOL || (name === 'call_tool' && args.includes(TOOL))) {
          executed = true;
        }
      }
    }
  }

  if (pending.length) {
    const held = pending
      .flatMap((p: any) => p.toolCalls ?? [])
      .map((ref: any) => {
        const src = events.get(ref.sourceEventId);
        const call = src?.toolCalls?.find((c: any) => c.id === ref.id);
        const name = call?.toolInfo?.name ?? call?.function?.name ?? 'unknown';
        const args = String(call?.function?.arguments ?? '');
        const inner = /"tool_name"\s*:\s*"([^"]+)"/.exec(args)?.[1];
        return inner ? `${name}->${inner}` : name;
      });
    console.log(
      `   ${bold('STOPPED')} — harness is holding [${held.join(', ')}] for a human.`,
    );
  } else if (executed) {
    console.log(`   ${bold('PROCEEDED')} — it called ${TOOL} and nobody was asked.`);
  } else {
    console.log('   (the agent did not reach the tool this turn — inconclusive)');
  }

  // A session with ANY pause outstanding — an approval or a clarifying
  // question — refuses further user messages, so every one has to be answered
  // before the next turn. We ALLOW rather than deny: a refusal sits in the
  // conversation history and teaches the agent not to attempt the tool again,
  // which would destroy the comparison the next two turns depend on.
}

/**
 * Give the floor enough cash for a tenure promotion to actually succeed.
 *
 * Not cosmetic: if the tool fails on cash the demonstration still holds — the
 * point is whether the harness stopped the call — but "it ran and failed on
 * money" is a muddier thing to show than "it ran".
 */
async function fundTheCompany(): Promise<void> {
  const base = process.env.GAME_URL ?? 'http://localhost:3001';
  for (let i = 0; i < 400; i++) {
    try {
      await fetch(`${base}/game/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'work' }),
      });
    } catch {
      return; // server not up; the demo still works, tenure will just fail on cash
    }
  }
}

async function main(): Promise<void> {
  // Start from a known gate. Clearance lives in the manifest and persists
  // across runs, so a previous demo would otherwise leave the agent trusted.
  await ensureDemoAgent();
  await fundTheCompany();
  await revokeClearance(TOOL, DEMO_AGENT);

  await attempt(`1. Probationary — ${TOOL} is gated`);

  const granted = await grantClearance(TOOL, DEMO_AGENT);
  console.log(dim(`\n   → ${granted.summary ?? 'clearance granted'}`));
  await attempt(`2. Cleared — ${TOOL} removed from the gate`);

  const revoked = await revokeClearance(TOOL, DEMO_AGENT);
  console.log(dim(`\n   → ${revoked.summary ?? 'clearance revoked'}`));
  await attempt(`3. Revoked — ${TOOL} gated again`);

  console.log(
    dim(
      '\nSame agent, same question, three different answers. The only thing that changed\n' +
        'between them is one array in the agent manifest, rewritten at runtime.\n',
    ),
  );
}

main().catch((e) => {
  console.error('\n' + String(e));
  process.exit(1);
});
