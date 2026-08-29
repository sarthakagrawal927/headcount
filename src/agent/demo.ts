/**
 * The loop, end to end: the agent reads a stalled factory floor, diagnoses it,
 * designs a fix, proves it in simulation, and then has to stop and ask.
 *
 *   npx tsx src/agent/demo.ts            # pause at the gate and wait for you
 *   npx tsx src/agent/demo.ts --approve  # auto-approve, for unattended runs
 *   npx tsx src/agent/demo.ts --deny     # refuse, to show the other branch
 */

import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import { createClient } from './client.js';
import { createSession } from './session.js';

const AUTO_APPROVE = process.argv.includes('--approve');
const AUTO_DENY = process.argv.includes('--deny');

const BRIEF = `Look at the factory floor as it stands right now.

1. Call get_state and get_telemetry and work out what is actually limiting throughput.
2. Design ONE change that raises the ceiling. Consult your idle-game-design skill first,
   and say which kind of structural novelty you are attempting.
3. Prove it: call simulate_patch and report the numbers honestly, including anything
   that got worse. If the simulation says the design removes the tension, discard it
   and try something else rather than arguing with the result.
4. Only then, ask to apply it.`;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main(): Promise<void> {
  const client = createClient();
  const { sessionId } = await createSession();
  console.log(dim(`session ${sessionId}\n`));

  const events = new Map<string, any>();
  const pending: any[] = [];

  const runTurn = async (message: string): Promise<void> => {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{ type: 'user.message', content: message }],
  });

  for await (const { data: event } of stream.withMetadata()) {
    // Streamed events arrive as a base event followed by deltas; tool-call
    // arguments are assembled across them. Without merging, the approval
    // prompt has no proposal to show — which is the one thing worth seeing.
    if (isEventDelta(event)) {
      const base = events.get((event as any).id);
      if (base) mergeEventDelta(base, event);
    } else {
      events.set((event as any).id, event);
    }

    switch (event.type) {
      case 'thread.created':
        console.log(dim(`  ↳ subagent: ${(event as any).title ?? 'untitled'}`));
        break;
      case 'model.message': {
        const calls = (event as any).toolCalls ?? [];
        for (const c of calls) {
          const args = c.function?.arguments;
          const preview =
            typeof args === 'string' && args.length > 2 ? ` ${args.slice(0, 90)}` : '';
          console.log(`  ${bold('→')} ${c.toolInfo?.name ?? c.function?.name}${dim(preview)}`);
        }
        const content = (event as any).content;
        if (typeof content === 'string' && content.trim()) {
          console.log('\n' + content.trim() + '\n');
        }
        break;
      }
      case 'tool.response': {
        const name = (event as any).toolInfo?.name ?? '';
        if (name === 'simulate_patch') {
          console.log(dim('    (simulation returned)'));
        }
        break;
      }
      case 'tool.approval_required':
        pending.push(event);
        break;
      case 'turn.done':
        console.log(dim(`\n[turn ${(event as any).state?.status}]`));
        break;
    }
  }
  };

  await runTurn(BRIEF);

  // Smaller models routinely stop after reporting a good simulation instead of
  // acting on it, and sometimes never reach the tool at all. Nudges escalate
  // in directness rather than repeating; the loop is bounded so that an agent
  // which simply will not ask for the change it validated shows up as a real
  // result rather than an infinite retry.
  const NUDGES = [
    'You validated that design. Call apply_patch now with the exact diff you simulated, and put the simulated numbers in your rationale.',
    'Call simulate_patch on your proposed diff, take the `evidence` token it returns, then call apply_patch with that same diff, your rationale, and that token. Do it in this turn.',
    'Do not explain. Make two tool calls now: simulate_patch with your diff, then apply_patch with the same diff plus the evidence token from the first call.',
  ];
  for (const nudge of NUDGES) {
    if (pending.length) break;
    console.log(dim(`\n— nudging —\n`));
    await runTurn(nudge);
  }

  if (!pending.length) {
    console.log(bold('\nNo approval was requested — the agent never tried to mutate the game.'));
    return;
  }

  for (const p of pending) {
    for (const ref of p.toolCalls ?? []) {
      const source = events.get(ref.sourceEventId);
      const call = source?.toolCalls?.find((c: any) => c.id === ref.id);
      console.log(bold('\n╔══ APPROVAL REQUIRED ══════════════════════════════'));
      console.log(bold(`║ tool: ${call?.toolInfo?.name ?? 'unknown'}`));
      const args = call?.function?.arguments;
      if (args) {
        console.log('║ proposal:');
        for (const line of JSON.stringify(JSON.parse(args), null, 2).split('\n')) {
          console.log(`║   ${line}`);
        }
      }
      console.log(bold('╚═══════════════════════════════════════════════════'));

      if (!AUTO_APPROVE && !AUTO_DENY) {
        console.log(dim('\nRun again with --approve or --deny to resolve it.'));
        return;
      }

      console.log(bold(AUTO_APPROVE ? '\n✓ approving…' : '\n✗ denying…'));

      // Resume as a stream. The approval only unblocks the call; whether the
      // change is actually accepted is decided afterwards by the evidence check
      // on the server, and that outcome is the thing worth watching.
      const resume = await client.sessions.createTurnStream(sessionId, {
        input: [
          {
            type: 'user.tool_approval',
            threadId: p.threadId,
            toolCallId: ref.id,
            approval: AUTO_APPROVE
              ? { status: 'allow' }
              : { status: 'deny', reason: 'not now' },
          } as any,
        ],
      });

      for await (const { data: event } of resume.withMetadata()) {
        if (event.type === 'tool.response') {
          const name = (event as any).toolInfo?.name ?? 'tool';
          const raw = (event as any).content;
          const text =
            typeof raw === 'string' ? raw : JSON.stringify(raw ?? {});
          console.log(`  ${bold('←')} ${name}: ${text.slice(0, 400)}`);
        }
        if (event.type === 'model.message') {
          const c = (event as any).content;
          if (typeof c === 'string' && c.trim()) console.log('\n' + c.trim() + '\n');
        }
        if (event.type === 'turn.done') {
          console.log(dim(`[resume ${(event as any).state?.status}]`));
        }
      }
    }
  }
}

main().catch((e) => {
  console.error('\n' + String(e));
  process.exit(1);
});
