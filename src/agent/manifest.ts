/**
 * The HEADCOUNT agent manifest, defined in code.
 *
 * It lives here rather than in the TrueForge UI for one reason: the approval
 * gate (`require_approval_for_tools`) is API-only, and that gate is the game's
 * signature mechanic. The agent's autonomy IS this object — `src/agent/trust.ts`
 * rewrites it at runtime to widen or narrow what the agent may do without
 * asking. Keeping the manifest as a plain exported value is what makes that
 * rewrite a data edit instead of a redeploy.
 */

import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

import { OPENUI_DASHBOARD_INSTRUCTIONS_COMPACT } from './openui.js';

/** Name of the MCP server as registered in TrueForge (Settings → Connectors). */
export const MCP_SERVER_NAME = process.env.HEADCOUNT_MCP_NAME ?? 'headcount';

/** Name of the agent. Immutable in TrueForge once created. */
export const AGENT_NAME = process.env.HEADCOUNT_AGENT_NAME ?? 'headcount-designer';

/** Default URL of our streamable-HTTP MCP server. */
export const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3001/mcp';

/** Tools that only observe. Safe to run unattended. */
export const READ_ONLY_TOOLS = ['get_state', 'get_telemetry', 'get_content', 'simulate_patch'] as const;

/**
 * Tools that change the live game.
 *
 * Each one emits BOTH `readOnlyHint: false` and `destructiveHint: true`. That
 * is not decoration: TrueForge resolves `@write` as
 * `readOnlyHint === false && destructiveHint !== true`, so a tool with NO
 * annotations block matches neither `@write` nor `@destructive` and therefore
 * runs with no approval and no error. Omission fails open. See
 * `verifyToolAnnotations()` below, which provision.ts runs on every provision.
 *
 * We still list the names literally in the manifest so the gate never depends
 * on annotation interpretation at all.
 */
export const MUTATING_TOOLS = ['apply_patch', 'set_policy', 'grant_tenure'] as const;

/**
 * The annotations `src/mcp/server.ts` emits, mirrored here so the selector maths
 * below matches what the harness actually computes. Kept honest by
 * `verifyToolAnnotations()`, which reads the live tools/list.
 */
export const TOOL_ANNOTATIONS: Record<string, { readOnlyHint: boolean; destructiveHint?: boolean }> = {
  get_state: { readOnlyHint: true },
  get_telemetry: { readOnlyHint: true },
  get_content: { readOnlyHint: true },
  simulate_patch: { readOnlyHint: true },
  apply_patch: { readOnlyHint: false, destructiveHint: true },
  set_policy: { readOnlyHint: false, destructiveHint: true },
  grant_tenure: { readOnlyHint: false, destructiveHint: true },
};

export const ALL_TOOLS = [...READ_ONLY_TOOLS, ...MUTATING_TOOLS] as const;

/**
 * TrueForge's tool-selector semantics, reproduced exactly (see
 * `core/mcp/toolSelectors.ts`):
 *
 *   @all         every tool
 *   @read-only   readOnlyHint === true
 *   @write       readOnlyHint === false AND destructiveHint !== true
 *   @destructive destructiveHint === true
 *
 * Note the consequence for THIS server: `@write` and `@destructive` are
 * mutually exclusive, and since all three mutating tools are destructive,
 * `@write` matches NOTHING here. A gate of `['@write']` alone would leave the
 * agent completely ungated. trust.ts relies on this being modelled exactly
 * rather than approximated, so that what it reports back is what the harness
 * will actually enforce.
 */
export function expandSelector(selector: string): string[] {
  const matches = (name: string): boolean => {
    const a = TOOL_ANNOTATIONS[name];
    switch (selector) {
      case '@all':
        return true;
      case '@read-only':
        return a?.readOnlyHint === true;
      case '@write':
        return a?.readOnlyHint === false && a.destructiveHint !== true;
      case '@destructive':
        return a?.destructiveHint === true;
      default:
        return selector === name;
    }
  };
  return ALL_TOOLS.filter(matches);
}

/** Expand a whole selector list into the concrete set of gated tool names. */
export function expandSelectors(selectors: readonly string[] | undefined): string[] {
  if (!selectors?.length) return [];
  const out = new Set<string>();
  for (const selector of selectors) for (const tool of expandSelector(selector)) out.add(tool);
  return ALL_TOOLS.filter((t) => out.has(t));
}

/**
 * Fetch the live tools/list from the MCP server and assert every tool carries
 * the annotations the gate depends on. This is the check that matters: a tool
 * that silently loses its annotations executes unapproved.
 */
export async function verifyToolAnnotations(mcpUrl: string = MCP_URL): Promise<{
  ok: boolean;
  problems: string[];
  seen: Record<string, unknown>;
}> {
  const rpc = async (body: unknown) => {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${mcpUrl} returned HTTP ${res.status}`);
    return res.json() as Promise<{ result?: { tools?: Array<{ name: string; annotations?: Record<string, unknown> }> } }>;
  };

  await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gate-check', version: '0' } },
  });
  const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

  const tools = listed.result?.tools ?? [];
  const seen: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const name of ALL_TOOLS) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      problems.push(`${name}: not present in tools/list`);
      continue;
    }
    const a = tool.annotations;
    seen[name] = a ?? null;
    if (!a) {
      problems.push(`${name}: NO annotations block — TrueForge would run it with no approval`);
      continue;
    }
    if ((MUTATING_TOOLS as readonly string[]).includes(name)) {
      if (a.readOnlyHint !== false) problems.push(`${name}: readOnlyHint must be explicitly false, got ${JSON.stringify(a.readOnlyHint)}`);
      if (a.destructiveHint !== true) problems.push(`${name}: destructiveHint must be explicitly true, got ${JSON.stringify(a.destructiveHint)}`);
    } else if (a.readOnlyHint !== true) {
      problems.push(`${name}: readOnlyHint must be explicitly true, got ${JSON.stringify(a.readOnlyHint)}`);
    }
  }

  return { ok: problems.length === 0, problems, seen };
}

export const DEFAULT_MODEL_FQN = process.env.MODEL_FQN ?? 'anthropic/claude-sonnet-4-6';

export const SKILL_NAME = 'idle-game-design';

export const INSTRUCTIONS = `You are the staff game designer on HEADCOUNT, an idle game whose production units are
AI-agent-like workers: fast, tireless, and uncertain. Uncertain workers raise QUESTIONS. Questions escalate to the
player, whose attention is a fixed rate that never scales. Hiring more workers therefore saturates attention and
collapses throughput. That collapse — the attention wall — is the game, not a defect. The player escapes it three
ways, each with a price:

  * SOPs — write the procedure down; the role asks less, forever, for cash up front.
  * Supervisors — a tier-2 role absorbs escalations, but leaks a fraction upward and earns nothing itself.
  * Tenure — the role acts autonomously, and starts making unreviewed mistakes; enough defects trigger an incident
    that claws a rung back. Autonomy is financed by risk.

The tech tree is an org chart. You are designing the shape of that curve.

How to work:

1. Read before you write: get_state for where the company is now, get_telemetry for how it got there, get_content
   for the ids and numbers you can change.
2. Diagnose out loud. Name where the wall is and which of the three escapes the current pack fails to make
   attractive. "Throughput is falling" is not a diagnosis; "eleven riveters generate 3.3 questions/sec against an
   answer capacity of 1.0, so 68% of the floor is idle and the only affordable relief costs 400" is.
3. Prove it with simulate_patch BEFORE proposing anything. It runs your diff headlessly against the same policy as
   the unpatched pack and returns both scores. Try more than one play policy — a greedy hire-everything run and a
   scripted sop-first or tenure-rush run rarely agree, and where they disagree is where your design lives.
4. Only then call apply_patch — passing the evidence token from simulate_patch and NO patch argument. That
   applies exactly the diff that was measured. Do not retype the diff: regenerating it produces a subtly
   different patch, the fingerprint will not match, and the change will be refused. Put the simulated numbers in
   your rationale. Fill "changes" with EVERY effect of the patch in plain English, incidental ones included —
   the simulate_patch response lists them under "applied", so copy from there. The human approving this reads
   your rationale and that list and nothing else, and the server refuses the patch if anything is undeclared.

Design taste for this game:
  * Two failure modes are worse than an imperfect patch. "degenerate" means the run never hits a wall and never
    needs the player — there is no game. "stalled" means throughput collapsed and never recovered — there is no
    game either. Reject your own patches that produce either.
  * A good change moves WHEN the wall arrives or WHAT it costs to get past it. A change that only raises numbers
    everywhere moves nothing.
  * Never raise playerAnswerRate to solve a design problem. The fixed player is the premise.
  * One legible change per patch — this is enforced, not advice. A patch touching more than two unrelated
    areas (global economy, roles, procedures, the tenure ladder) is rejected before it is simulated. A change
    entangled with three others cannot be weighed by a human or isolated by the simulator.

You may spawn subagents to playtest competing policies in parallel and report their scores back. Ask the human
questions when a design choice is a matter of taste rather than evidence.

${OPENUI_DASHBOARD_INSTRUCTIONS_COMPACT}`;

/** The MCP server registration. TrueForge attaches MCP servers by URL, not stdio. */
export function buildMcpServerManifest(url: string = MCP_URL): TrueForgeApi.McpServerManifest {
  return {
    name: MCP_SERVER_NAME,
    type: 'remote',
    url,
    description:
      'The live HEADCOUNT game. Read-only tools expose the running company, its telemetry and its ContentPack, ' +
      'plus a headless simulator for scoring proposed design changes. Mutating tools patch the content pack, ' +
      'install a play policy, and grant tenure in the live game.',
  };
}

export interface ManifestOptions {
  /** Git-backed SKILL.md packs to attach. Requires the sandbox. */
  skills?: string[];
  /** Isolated execution for skills and code. Required by `skills`. */
  sandbox?: boolean;
  /** Let the agent ask clarifying questions. Off for focused demos. */
  askUserQuestions?: boolean;
  /** Let the harness fan out to subagents. */
  dynamicSubAgents?: boolean;
  /** Model FQN, `provider/model`. */
  model?: string;
  /** MCP server name to attach. */
  mcpServerName?: string;
  /**
   * Which tools pause for human approval. Defaults to the three mutating tools.
   * `[]` means full autonomy; `['@all']` means the agent asks before everything.
   */
  requireApprovalForTools?: TrueForgeApi.McpServerApprovalToolSelector[];
  /** Max agent-loop iterations per turn. */
  iterationLimit?: number;
  instructions?: string;
}

/**
 * The agent manifest. `requireApprovalForTools` is the only field that changes
 * during a session — see trust.ts.
 */
export function buildAgentManifest(options: ManifestOptions = {}): TrueForgeApi.AgentSpec {
  const {
    model = DEFAULT_MODEL_FQN,
    mcpServerName = MCP_SERVER_NAME,
    requireApprovalForTools = [...MUTATING_TOOLS],
    iterationLimit = 40,
    instructions = INSTRUCTIONS,
    askUserQuestions = true,
    dynamicSubAgents = true,
    skills = [SKILL_NAME],
    sandbox = true,
  } = options;

  return {
    model: { name: model },
    instructions,
    mcpServers: [
      {
        name: mcpServerName,
        enableTools: ['@all'],
        // Deferred tool loading. Only the server's name and description sit in
        // context; individual schemas are fetched when the agent decides it
        // needs one. Seven tools with descriptions written for a model to read
        // is a lot of prompt, and preloading them pushed a single request past
        // the 8,000 tokens-per-minute ceiling on the free gateway — the agent
        // could not be shown the game it was designing. The two tools it needs
        // on the first turn are preloaded by name so the common path costs no
        // extra round trip.
        preload: false,
        // The four it actually invokes are preloaded by name. Deferring
        // apply_patch turned out to be a false economy: the agent called it
        // without having fetched its schema and omitted two required fields,
        // so the turn reached the approval gate, a human approved it, and it
        // then failed validation. A tool the agent is expected to call needs
        // its arguments in view before it calls it.
        preloadTools: ['get_state', 'get_telemetry', 'simulate_patch', 'apply_patch'],
        requireApprovalForTools,
      },
    ],
    // The design playbook — the ceiling equation, prestige exponents, the
    // taxonomy of structural novelty — lives in a git-backed SKILL.md rather
    // than the system prompt. Only its name and description sit in context;
    // the body is read from the sandbox when the agent decides it is relevant.
    // That is what skills are for, and it keeps the prompt about this agent's
    // role rather than about idle-game mathematics.
    skills: skills.map((name) => ({ name })),
    config: {
      // Required for skills, and for any code the agent needs to run.
      sandbox: { enabled: sandbox },
      // Playtesting competing policies is embarrassingly parallel.
      dynamicSubAgents: { enabled: dynamicSubAgents },
      // Design taste is a question for a human, not a thing to guess. Turned
      // off for focused demonstrations where a clarifying question is noise.
      askUserQuestions: { enabled: askUserQuestions },
      // Telemetry deserves a chart, not a paragraph.
      generativeUi: { enabled: true },
      iterationLimit,
    },
  };
}

/** The manifest this repo provisions by default. Exported so trust.ts can diff against it. */
export const HEADCOUNT_AGENT_MANIFEST: TrueForgeApi.AgentSpec = buildAgentManifest();
