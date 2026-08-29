/**
 * HEADCOUNT — remote MCP server (streamable HTTP).
 *
 * TrueForge registers MCP servers by URL, never by stdio command, so this is an
 * HTTP service rather than a subprocess. It runs stateless: a fresh
 * McpServer + transport per POST, no session ids, JSON responses. That makes it
 * trivially restartable mid-demo and safe to call from curl.
 *
 *   npx tsx src/mcp/server.ts        # http://localhost:3001/mcp
 *
 * Tool annotations are the contract with TrueForge's approval system: read-only
 * tools carry `readOnlyHint: true`, mutating tools carry `destructiveHint: true`
 * so the default `["@write", "@destructive"]` approval selectors gate exactly
 * the three tools that can change the live game.
 */

import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { loadEngine, type PlayPolicy } from './engineAdapter.js';
import {
  applyPatchToPack,
  commitPatch,
  derive,
  downsample,
  getGame,
  installPolicy,
  playtest,
  roleReadout,
} from './gameStore.js';
import { ContentPatchSchema, PlayPolicySchema } from './schemas.js';
import { mint, recall, tokenFingerprint, verify, type Verdict } from './evidence.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';

/** Every tool answers with pretty JSON — the agent reads it, so keep it legible. */
function json(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string, extra: Record<string, unknown> = {}): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, null, 2) }] };
}

/* ------------------------------------------------------------- the tools */

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'headcount', version: '0.1.0' },
    {
      instructions:
        'HEADCOUNT is an idle game about managing AI-agent-like workers. Workers are fast but uncertain: every ' +
        'completed task may raise a QUESTION, and questions escalate to the player, whose attention is a fixed ' +
        'rate that never scales. Hiring saturates attention and collapses throughput — that collapse is the ' +
        'point of the game, not a bug to fix. The three escapes are SOPs (write it down, workers ask less), ' +
        'Supervisors (absorb escalations, at a cost and with leakage), and Tenure (workers act autonomously but ' +
        'start making unreviewed mistakes). You are the game designer. Read the live game, diagnose where the ' +
        'wall is, then propose ContentPack changes — but ALWAYS run simulate_patch first and quote its numbers ' +
        'before asking to apply anything. Evidence before assertion.',
    },
  );

  /* ------------------------------------------------------------ read-only */

  server.registerTool(
    'get_state',
    {
      title: 'Read the live game',
      description:
        'Snapshot of the running company: raw GameState plus derived metrics (throughput, escalation rate, ' +
        'attention utilisation, blocked fraction, answer capacity, defect rate) and a per-role readout with next ' +
        'unit costs and effective confusion after SOPs and tenure. Start here. Attention utilisation above 1 ' +
        'means questions arrive faster than the player can answer; blocked fraction above 0.5 is the wall.',
      inputSchema: {},
      annotations: { title: 'Read the live game', readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const game = await getGame();
      return json({
        state: game.state,
        derived: derive(game),
        roles: roleReadout(game),
        packVersion: game.pack.version,
        activePolicy: game.policy,
        patchLog: game.patchLog,
      });
    },
  );

  server.registerTool(
    'get_telemetry',
    {
      title: 'Read recent telemetry',
      description:
        'Recent per-tick telemetry from the live game, newest last: t, throughput (tasks/sec), escalationRate ' +
        '(questions/sec reaching the player), queue, blockedFraction, cash, headcountTotal. Use it to see the ' +
        'shape of the wall over time rather than a single instant — the moment blockedFraction starts climbing ' +
        'while headcountTotal keeps rising is the collapse you are designing around.',
      inputSchema: {
        seconds: z.number().min(1).max(600).default(120)
          .describe('How far back to look, in in-game seconds.'),
        points: z.number().int().min(4).max(200).default(40)
          .describe('Downsample the window to about this many evenly spaced points.'),
      },
      annotations: { title: 'Read recent telemetry', readOnlyHint: true, openWorldHint: false },
    },
    async ({ seconds, points }) => {
      const game = await getGame();
      const cutoff = game.state.t - seconds;
      const window = game.telemetry.filter((s) => s.t >= cutoff);
      return json({
        window: { seconds, from: window[0]?.t ?? game.state.t, to: game.state.t, samples: window.length },
        telemetry: downsample(window, points),
      });
    },
  );

  server.registerTool(
    'get_content',
    {
      title: 'Read the active ContentPack',
      description:
        'The full active ContentPack: roles (with tier, throughput, confusion, revenue, answer rate, escalate ' +
        'fraction, costs), SOPs, the shared tenure ladder, and the global knobs (playerAnswerRate, clickRevenue, ' +
        'incidentThreshold). This is the design surface — every change you can propose is a diff against this ' +
        'object. Read it before writing a patch so your ids match.',
      inputSchema: {},
      annotations: { title: 'Read the active ContentPack', readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const game = await getGame();
      return json({ pack: game.pack, engineProvenance: game.engine.provenance });
    },
  );

  server.registerTool(
    'simulate_patch',
    {
      title: 'Playtest a proposed change (headless)',
      description:
        'Your evidence tool, and the only honest way to argue for a design. Applies a proposed ContentPack diff ' +
        'to a COPY of the active pack, runs a headless playtest under a given play policy, and runs the same ' +
        'policy against the unpatched pack for comparison. Returns both scores plus deltas: time-to-wall, peak ' +
        'and final throughput, mean attention utilisation, lifetime cash, incidents, and two failure flags — ' +
        '`degenerate` (no wall ever, the player is never needed, there is no game) and `stalled` (throughput ' +
        'collapsed and never recovered). Never touches the live game. Run this before apply_patch, and quote the ' +
        'numbers when you ask a human to approve.',
      inputSchema: {
        patch: ContentPatchSchema,
        policy: PlayPolicySchema.optional()
          .describe('How the simulated player spends. Defaults to greedy — the naive optimiser that hires into the wall.'),
        seconds: z.number().min(10).max(3600).default(300)
          .describe('In-game seconds to simulate. 300 covers a typical run to the wall and past it.'),
      },
      annotations: { title: 'Playtest a proposed change', readOnlyHint: true, openWorldHint: false },
    },
    async ({ patch, policy, seconds }) => {
      const game = await getGame();
      const { pack: patched, summary, errors } = applyPatchToPack(game.pack, patch);
      if (errors.length) {
        return fail('The patch is not valid against the active pack, so it was not simulated.', { problems: errors });
      }
      const chosen: PlayPolicy = (policy as PlayPolicy | undefined) ?? { mode: 'greedy', label: 'default-greedy' };
      const result = playtest(game.engine, game.pack, patched, chosen, seconds);

      // Bind the verdict to this exact diff. apply_patch will not accept the
      // change without it, so the agent cannot cite numbers it did not produce.
      const verdict: Verdict = {
        degenerate: Boolean(result.patched?.degenerate),
        stalled: Boolean(result.patched?.stalled),
        timeToWall: result.patched?.timeToWall ?? null,
        attentionUtilisation: Number(result.patched?.attentionUtilisation ?? 0),
        peakThroughput: Number(result.patched?.peakThroughput ?? 0),
      };
      const evidence = mint(patch, verdict);

      return json({
        applied: summary.length ? summary : ['patch is a no-op against the active pack'],
        note: patch.note,
        ...result,
        evidence,
        nextStep:
          'If the numbers support the change, call apply_patch with `evidence` set to the token above and ' +
          'NO patch argument — that applies exactly what was just simulated. Do not retype the diff; ' +
          'regenerating it produces a different patch and the change will be refused.',
      });
    },
  );

  /* -------------------------------------------------------------- mutating */

  server.registerTool(
    'apply_patch',
    {
      title: 'Apply a change to the live game',
      description:
        'DESTRUCTIVE. Merges a ContentPack diff into the LIVE running game: players feel this immediately and it ' +
        'cannot be undone except by another patch. Headcount, installed SOPs and tenure levels are reconciled ' +
        'against the new pack (workers in deleted roles are lost, tenure above the new ladder is clipped). ' +
        'Call it with the `evidence` token from simulate_patch and NO patch argument: that applies exactly ' +
        'the diff that was measured. Retyping the diff regenerates it into something subtly different and ' +
        'the change will be refused. Put your reasoning in `rationale` — that is what the approving human reads.',
      inputSchema: {
        patch: ContentPatchSchema.optional()
          .describe(
            'OPTIONAL, and best left out. Omit it and the exact patch you simulated is applied — which is ' +
            'almost always what you want. Supply it only to be explicit, and then it must match what the ' +
            'evidence token was minted for, byte for byte in meaning.',
          ),
        rationale: z.string().min(1)
          .describe('Why this change, in one or two sentences, citing the simulated numbers you are relying on.'),
        changes: z.array(z.string()).min(1)
          .describe(
            'EVERY change this patch makes, one per line, in plain English — including anything incidental. ' +
            'This is the list the approving human reads, so it must be complete: the server compares it ' +
            'against what the patch actually does and refuses the change if anything is undeclared. ' +
            'Example: ["adds a tier-2 Quality Inspector at $150", "sets clickRevenue to 0", ' +
            '"lowers incidentThreshold to 1"].',
          ),
        evidence: z.string().min(1)
          .describe(
            'The token returned by simulate_patch for THIS EXACT patch. It is signed and carries the verdict, ' +
            'so the human approving the change reads the simulation result rather than your account of it. ' +
            'A patch with no token, a token minted for a different diff, or a token whose verdict was ' +
            'degenerate or stalled will be refused.',
          ),
      },
      annotations: {
        title: 'Apply a change to the live game',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ patch, rationale, changes, evidence }) => {
      // Apply what was measured. When the caller does not restate the patch we
      // recover it from the simulation the token was minted for, which removes
      // the whole class of drift between simulating one diff and applying a
      // regenerated one.
      // An empty object counts as "not supplied". Models reliably emit `{}`
      // for an optional object rather than omitting the key, and treating that
      // as a real (empty) patch fingerprints to something the token was never
      // minted for — a refusal with a confusing explanation.
      const supplied =
        patch && Object.values(patch).some((v) => v !== undefined);

      let subject = supplied ? patch : undefined;
      if (!subject) {
        const fp = tokenFingerprint(evidence);
        subject = fp ? recall(fp) : undefined;
        if (!subject) {
          return fail('Patch refused: the live game is unchanged.', {
            problem:
              'No patch was supplied and the evidence token does not correspond to a simulation still on ' +
              'record. Run simulate_patch again and apply with the token it returns.',
          });
        }
      }

      // Checked before anything else: an unevidenced change is refused even
      // when a human has already approved it. Approval covers whether the
      // change is wanted, not whether it was ever measured.
      const check = verify(evidence, subject);
      if (!check.ok) {
        return fail('Patch refused: evidence check failed. The live game is unchanged.', {
          problem: check.reason,
        });
      }

      const game = await getGame();
      const { pack, summary, errors } = applyPatchToPack(game.pack, subject);
      if (errors.length) return fail('Patch rejected; the live game is unchanged.', { problems: errors });

      // Applying by reference means the diff itself never appears in the tool
      // arguments, so the human approving it would otherwise be reading a
      // rationale and taking the rest on trust. Requiring a declaration and
      // checking it against the real summary puts the changes back in front of
      // them — and catches the specific failure this was written for: a patch
      // that quietly zeroed click revenue while arguing about supervisors.
      const undeclared = summary.filter((change) => {
        const subject = declarationKey(change);
        return !changes.some((d) => d.toLowerCase().includes(subject));
      });
      if (undeclared.length) {
        return fail('Patch refused: the change list is incomplete. The live game is unchanged.', {
          undeclared,
          problem:
            'Every change must appear in `changes`, including incidental ones. The human approving this ' +
            'reads that list and nothing else. Declare these and call again.',
        });
      }

      commitPatch(game, pack, summary, subject.note ?? rationale);
      return json({
        ok: true,
        packVersion: pack.version,
        applied: summary,
        declared: changes,
        rationale,
        evidenceVerdict: check.verdict,
        state: game.state,
        derived: derive(game),
      });
    },
  );

  server.registerTool(
    'set_policy',
    {
      title: 'Install the play policy',
      description:
        'DESTRUCTIVE. Replaces the buying policy the live game plays itself with — what it buys and in what ' +
        'order. `greedy` chases the best marginal return at every tick and reliably walks into the attention ' +
        'wall; `scripted` follows your ordered plan of hires (up to a cap), SOP installs and tenure grants. This ' +
        'is you taking the wheel of the company, so it is gated.',
      inputSchema: {
        policy: PlayPolicySchema,
        rationale: z.string().min(1).describe('What this policy is meant to prove or achieve.'),
      },
      annotations: {
        title: 'Install the play policy',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ policy, rationale }) => {
      const game = await getGame();
      const chosen = policy as PlayPolicy;
      if (chosen.mode === 'scripted' && (!chosen.script || chosen.script.length === 0)) {
        return fail('A scripted policy needs a non-empty script. The live policy is unchanged.');
      }
      const unknown: string[] = [];
      for (const intent of chosen.script ?? []) {
        if (intent.type === 'sop') {
          if (!game.pack.sops.some((s) => s.id === intent.sopId)) unknown.push(`sop:${intent.sopId}`);
        } else if (!game.pack.roles.some((r) => r.id === intent.roleId)) {
          unknown.push(`role:${intent.roleId}`);
        }
      }
      if (unknown.length) {
        return fail('The script references ids that are not in the active pack. The live policy is unchanged.', {
          unknown,
          hint: 'Call get_content for the current ids.',
        });
      }
      installPolicy(game, chosen);
      return json({ ok: true, policy: chosen, rationale, atGameTime: game.state.t });
    },
  );

  server.registerTool(
    'grant_tenure',
    {
      title: 'Promote a role up the tenure ladder',
      description:
        'DESTRUCTIVE. Spends cash to raise one role a rung on the tenure ladder in the LIVE game. The role stops ' +
        'asking (its confusion is multiplied down) and starts making unreviewed mistakes at the rung error rate; ' +
        'accumulated defects trigger an incident that claws a rung back. This is the autonomy trade the whole ' +
        'game is about, so a human approves each grant. Fails cleanly if there is not enough cash or the role is ' +
        'already at the top of the ladder.',
      inputSchema: {
        roleId: z.string().describe('Role id to promote. See get_content or get_state for valid ids.'),
        rationale: z.string().min(1).describe('Why this role is ready for autonomy, and what error rate you are accepting.'),
      },
      annotations: {
        title: 'Promote a role up the tenure ladder',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ roleId, rationale }) => {
      const game = await getGame();
      const before = game.state.tenure[roleId] ?? 0;
      const result = game.engine.grantTenure(game.state, game.pack, roleId);
      if (!result.ok) return fail(`Could not grant tenure to "${roleId}": ${result.reason}`, { tenureLevel: before });
      game.state = result.state;
      const level = game.state.tenure[roleId] ?? 0;
      const rung = game.pack.tenureLadder[level];
      return json({
        ok: true,
        roleId,
        tenureLevel: { from: before, to: level },
        rung,
        rationale,
        cashRemaining: game.state.cash,
        derived: derive(game),
      });
    },
  );

  return server;
}

/* --------------------------------------------------------------- transport */

/**
 * The identifying subject of a change summary line, used to check that the
 * agent's plain-English declaration actually mentions it. Summary lines look
 * like "clickRevenue: 1 -> 0" or "added role quality_inspector (tier 2)"; the
 * subject is the field or entity being changed.
 */
function declarationKey(change: string): string {
  const scalar = /^([A-Za-z]+):/.exec(change);
  if (scalar) return scalar[1].toLowerCase();
  const entity = /\b(role|SOP)\s+([A-Za-z0-9_.-]+)/i.exec(change);
  if (entity) return entity[2].toLowerCase();
  if (/tenure ladder/i.test(change)) return 'tenure';
  return change.toLowerCase().slice(0, 12);
}

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID'],
  }),
);

/**
 * Stateless: one server + transport per request, torn down when the response
 * closes. No session ids to lose, so a restart never orphans a TrueForge
 * connection, and `curl` can do a full handshake in a single POST.
 */
app.post(MCP_PATH, async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request failed', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal server error: ${(err as Error).message}` },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'This MCP server is stateless: use POST for JSON-RPC. GET/DELETE streams are not supported.' },
    id: null,
  });
};
app.get(MCP_PATH, methodNotAllowed);
app.delete(MCP_PATH, methodNotAllowed);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'headcount-mcp', mcpPath: MCP_PATH });
});

/** Plain read surface for the UI, so it can watch the same running company. */
app.get('/game', async (_req, res) => {
  try {
    const game = await getGame();
    res.json({
      state: game.state,
      derived: derive(game),
      roles: roleReadout(game),
      pack: game.pack,
      telemetry: downsample(game.telemetry.slice(-240), 60),
      policy: game.policy,
      patchLog: game.patchLog,
    });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

/**
 * Player actions from the operations console.
 *
 * The console and the agent act on the *same* running company — that is the
 * whole point of the piece. The player hires and answers questions here; the
 * agent redesigns the rules underneath them through MCP. Neither is a view of
 * a private copy.
 */
app.post('/game/action', async (req, res) => {
  try {
    const game = await getGame();
    const { type, id, count } = req.body ?? {};

    switch (type) {
      case 'work':
        // The opening beat of the genre: you, alone, doing the job by hand.
        // No question is raised, because you never have to ask yourself.
        game.state = {
          ...game.state,
          cash: game.state.cash + game.pack.clickRevenue,
          lifetimeCash: game.state.lifetimeCash + game.pack.clickRevenue,
          tasksCompleted: game.state.tasksCompleted + 1,
        };
        break;
      case 'answer': {
        const n = Math.min(Number(count ?? 1), game.state.queue);
        game.state = {
          ...game.state,
          queue: game.state.queue - n,
          answered: game.state.answered + n,
        };
        break;
      }
      case 'hire':
      case 'sop':
      case 'tenure': {
        const action =
          type === 'hire'
            ? game.engine.hire
            : type === 'sop'
              ? game.engine.buySop
              : game.engine.grantTenure;
        const result = action(game.state, game.pack, String(id));
        if (!result.ok) {
          res.status(409).json({ ok: false, reason: result.reason });
          return;
        }
        game.state = result.state;
        break;
      }
      default:
        res.status(400).json({ ok: false, reason: `unknown action "${type}"` });
        return;
    }

    res.json({ ok: true, state: game.state, derived: derive(game) });
  } catch (err) {
    res.status(503).json({ ok: false, reason: (err as Error).message });
  }
});

async function main() {
  // Fail loudly at boot if the engine is missing, rather than on first tool call.
  const engine = await loadEngine();
  await getGame();
  app.listen(PORT, HOST, () => {
    console.log(`[headcount-mcp] listening on http://${HOST}:${PORT}${MCP_PATH}`);
    console.log(`[headcount-mcp] engine provenance: ${JSON.stringify(engine.provenance)}`);
    console.log('[headcount-mcp] read-only: get_state, get_telemetry, get_content, simulate_patch');
    console.log('[headcount-mcp] gated (destructive): apply_patch, set_policy, grant_tenure');
  });
}

main().catch((err) => {
  console.error('[headcount-mcp] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
