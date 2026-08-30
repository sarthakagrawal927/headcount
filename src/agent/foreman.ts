/**
 * The foreman — the game's help system, as an agent on the harness.
 *
 * The console's field guide has a question box. Questions go to
 * `headcount-foreman`, a TrueForge agent whose MCP access is read-only BY
 * CONSTRUCTION: its manifest enables only the three observation tools, so
 * there is nothing to gate and nothing to approve — it cannot touch the game
 * it explains. It reads the live floor over MCP before answering "what should
 * I do next", which makes the help system itself a demonstration of the
 * harness: same server, same tool annotations, opposite end of the trust
 * spectrum from the designer.
 *
 *   npx tsx src/agent/foreman.ts "why is my output falling?"   # ask from a shell
 */

import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';

import { createClient, explain } from './client.js';
import { DEFAULT_MODEL_FQN, MCP_SERVER_NAME } from './manifest.js';

export const FOREMAN = 'headcount-foreman';

/** Everything the foreman may assert without looking; tools cover the rest. */
const INSTRUCTIONS = `You are the shift foreman for HEADCOUNT, an idle game played from an
operations console. Players ask you what to do; judges ask you how the project works. Answer in
at most 4 short sentences, plain words, no bullet lists unless asked. Plain text only — the
console renders no markdown, so never use asterisks, backticks or headings. Never invent a number —
cite only numbers you read from your tools this turn, and prefer calling get_telemetry before
answering any "what should I do" question so the advice matches the live floor.

THE GAME (fixed facts):
- Workers complete tasks but raise questions. The player answers at a fixed rate that never
  rises. Throughput settles at answer-rate divided by confusion; headcount is not in that
  equation, so hiring past the span of control lowers output instead of raising it.
- The ways out are structural: write SOPs (fewer questions), hire tier-2 supervisors (absorb
  questions), promote tenure (fewer questions, silent defects), prestige when offered.

THE CONSOLE (where to click):
- Top card: questions arriving vs the fixed answer rate, with the share of the team working.
- "Questions for you": answer them (button or the A key) — each one waiting blocks a worker.
- "Grow the company": Hire / SOPs / Promote tabs; buttons show the price.
- "AI designer": the live log of mechanics an agent designed, simulated, and a human approved.
- Space works the line by hand; Hold pauses the shift.

THE HARNESS (how TrueForge is used, if asked):
- The game is a remote MCP server with 7 annotated tools; the harness gates the 3 mutating ones
  behind human approval. The designer agent must prove changes in simulation first — evidence
  is an HMAC token bound to the diff, minted by the server, impossible to fabricate.
- Three read-only critic subagents try to refute each proposal before a human sees it.
- A supervisor process rewrites the designer's approval policy at runtime: autonomy is earned
  by changes that helped and revoked when one hurts. You yourself are read-only by
  construction — your manifest enables only observation tools.`;

/** The manifest is tiny on purpose: no skills, no sandbox, no UI, no approvals to configure. */
function foremanManifest() {
  return {
    model: { name: process.env.MODEL_FQN ?? DEFAULT_MODEL_FQN },
    instructions: INSTRUCTIONS,
    mcpServers: [
      {
        name: MCP_SERVER_NAME,
        // Read-only by construction: the mutating tools are not enabled at
        // all, so no approval selector is needed and none could fire.
        enableTools: ['get_state', 'get_telemetry', 'get_content'],
        preload: false,
        preloadTools: ['get_telemetry', 'get_state'],
        requireApprovalForTools: [],
      },
    ],
    config: {
      sandbox: { enabled: false },
      dynamicSubAgents: { enabled: false },
      askUserQuestions: { enabled: false },
      generativeUi: { enabled: false },
      iterationLimit: 5,
    },
  } as never;
}

let cachedSessionId: string | null = null;

async function ensureForeman(): Promise<void> {
  const client = createClient();
  const existing = await client.agents.list();
  const found = (existing.data ?? []).find((a) => a.name === FOREMAN);
  if (found) await client.agents.update(found.id, { manifest: foremanManifest() });
  else await client.agents.create({ name: FOREMAN, manifest: foremanManifest() });
}

/**
 * One question in, one plain-text answer out.
 *
 * The session is reused across questions so a follow-up ("and then?") lands in
 * context; if the harness lost it (restart, expiry), one fresh session is the
 * retry — not an error the player should ever see.
 */
export async function askForeman(question: string): Promise<{ answer: string; sessionId: string }> {
  const client = createClient();

  const run = async (sessionId: string): Promise<string> => {
    const events = new Map<string, unknown>();
    const stream = await client.sessions.createTurnStream(sessionId, {
      input: [{ type: 'user.message', content: question }],
    });
    for await (const { data: event } of stream.withMetadata()) {
      if (isEventDelta(event)) {
        const base = events.get((event as { id: string }).id);
        if (base) mergeEventDelta(base as never, event);
      } else {
        events.set((event as { id: string }).id, event);
      }
    }
    let text = '';
    for (const e of events.values()) {
      const ev = e as { type?: string; content?: unknown };
      if (ev.type === 'model.message' && typeof ev.content === 'string') text += ev.content;
    }
    return text.trim();
  };

  if (!cachedSessionId) {
    await ensureForeman();
    const { data: session } = await client.sessions.create({ agent: { name: FOREMAN } });
    cachedSessionId = session.id;
  }

  try {
    const answer = await run(cachedSessionId);
    if (answer) return { answer, sessionId: cachedSessionId };
    throw new Error('empty reply');
  } catch {
    // One retry on a fresh session covers harness restarts and expiry.
    await ensureForeman();
    const { data: session } = await client.sessions.create({ agent: { name: FOREMAN } });
    cachedSessionId = session.id;
    const answer = await run(cachedSessionId);
    return { answer, sessionId: cachedSessionId };
  }
}

/* ------------------------------------------------------------------ CLI */
if (process.argv[1]?.endsWith('foreman.ts')) {
  const question = process.argv.slice(2).join(' ') || 'What should I do first?';
  askForeman(question)
    .then(({ answer, sessionId }) => {
      console.log(`[${FOREMAN} · session ${sessionId}]\n${answer}`);
    })
    .catch((err) => {
      console.error(explain(err));
      process.exit(1);
    });
}
