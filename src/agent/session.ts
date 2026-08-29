/**
 * Session helpers.
 *
 * ONE RULE, and it is the whole reason this file exists:
 *
 *   Bind the session to the agent BY NAME — `{ agent: { name } }`.
 *
 * TrueForge stores a session's agent one of two ways (see the harness's
 * `sessionAgentColumns.ts`): as a REFERENCE (`agent_id` + `agent_name`, spec
 * left null and re-read from the agent store on every turn), or INLINE
 * (`agent_spec` written into the session row as a frozen snapshot). If you pass
 * `{ agent: { spec: {...} } }` you get the inline form, and the manifest is
 * frozen for the life of that session — `grantClearance()` / `revokeClearance()`
 * will update the agent row, report success, and change nothing that session
 * sees. The failure is completely silent.
 *
 * Since runtime manifest rewriting IS our signature mechanic, every session
 * must use the by-name form. That is what `createSession()` below does, and it
 * is the only session constructor anything in this repo should call.
 */

import { createClient, explain } from './client.js';
import { AGENT_NAME } from './manifest.js';

/**
 * Open a session bound to the HEADCOUNT agent by reference, so that clearance
 * changes made mid-session take effect on the very next turn.
 */
export async function createSession(agentName = AGENT_NAME): Promise<{ sessionId: string }> {
  const client = createClient();
  try {
    // By-name reference — NOT `{ spec }`. See the note at the top of this file.
    const session = await client.sessions.create({ agent: { name: agentName } });
    return { sessionId: session.data.id };
  } catch (err) {
    throw new Error(explain(err));
  }
}

/**
 * Send one turn and wait for it to finish.
 *
 * There is no `schedules` API in the harness (v0.1.4 exposes zero endpoints for
 * it), so anything long-running is driven by an external loop posting turns —
 * this is the call that loop makes.
 */
export async function sendTurn(sessionId: string, message: string): Promise<unknown> {
  const client = createClient();
  try {
    const turn = await client.sessions.createTurn(sessionId, {
      input: [{ type: 'user.message', content: message }],
    });
    return turn.data;
  } catch (err) {
    throw new Error(explain(err));
  }
}

/**
 * Answer a pending approval for a gated tool call — the human half of the
 * mechanic. A turn that hits `apply_patch`, `set_policy` or `grant_tenure`
 * while that tool is gated stops and emits a tool-approval request carrying a
 * `threadId` and `toolCallId`; the turn resumes only once this is posted.
 *
 * Approval items must not be mixed with user messages in the same turn input.
 */
export async function respondToApproval(
  sessionId: string,
  args: { threadId: string; toolCallId: string; allow: boolean; reason?: string },
): Promise<unknown> {
  const client = createClient();
  try {
    const turn = await client.sessions.createTurn(sessionId, {
      input: [
        {
          type: 'user.tool_approval',
          threadId: args.threadId,
          toolCallId: args.toolCallId,
          approval: args.allow ? { status: 'allow' } : { status: 'deny', ...(args.reason ? { reason: args.reason } : {}) },
        },
      ],
    });
    return turn.data;
  } catch (err) {
    throw new Error(explain(err));
  }
}
