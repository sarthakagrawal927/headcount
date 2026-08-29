/**
 * Clearance — the agent's autonomy, as a live edit to its own manifest.
 *
 * HEADCOUNT's tenure ladder says a worker earns the right to act without
 * asking, and pays for it with unreviewed mistakes. This file is that mechanic
 * applied to the agent itself: `requireApprovalForTools` in the TrueForge
 * manifest is the list of things it must stop and ask about. Granting clearance
 * removes a tool from that list; revoking puts it back. There is no other state
 * — the agent's trust level IS its manifest, rewritten through agents.update.
 *
 *   import { grantClearance, revokeClearance, readClearance } from './trust.js';
 *   await grantClearance('grant_tenure');   // stop asking before promotions
 *   await revokeClearance('@all');          // ask before everything again
 *
 * Both functions are safe to call repeatedly; they read the live manifest,
 * rewrite one field, and write it back.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TrueForgeApi as TF } from '@truefoundry/trueforge-sdk';
import { createClient, explain } from './client.js';
import {
  AGENT_NAME,
  ALL_TOOLS,
  expandSelectors,
  MCP_SERVER_NAME,
  MUTATING_TOOLS,
  READ_ONLY_TOOLS,
} from './manifest.js';

/** Friendly aliases so callers (and the UI) need not remember tool names. */
const CLEARANCES: Record<string, readonly string[]> = {
  /** Everything that can change the live game. */
  all: MUTATING_TOOLS,
  everything: MUTATING_TOOLS,
  /** Rewriting the content pack — the designer's own job. */
  designer: ['apply_patch'],
  design: ['apply_patch'],
  apply_patch: ['apply_patch'],
  /** Choosing what the company buys. */
  operator: ['set_policy'],
  policy: ['set_policy'],
  set_policy: ['set_policy'],
  /** Promoting roles up the tenure ladder. */
  manager: ['grant_tenure'],
  tenure: ['grant_tenure'],
  grant_tenure: ['grant_tenure'],
};

export interface ClearanceChange {
  agentId: string;
  agentName: string;
  /** Tools that required approval before the change. */
  before: string[];
  /** Tools that require approval now. */
  after: string[];
  /** Tools this call moved. */
  moved: string[];
  /** One line suitable for showing a player. */
  summary: string;
}

/**
 * Resolve an alias, a literal tool name, or a TrueForge selector into concrete
 * tool names. `@all`, `@write` and `@destructive` all expand to the mutating
 * set, because in this server those are exactly the destructive tools.
 */
export function resolveTools(roleOrTool: string): string[] {
  const key = roleOrTool.trim();
  // Selectors resolve through the same maths TrueForge uses, so `@write`
  // correctly matches NOTHING on this server (all our mutating tools are
  // destructive) instead of being approximated as "the mutating ones".
  if (key.startsWith('@')) return expandSelectors([key]);
  const alias = CLEARANCES[key.toLowerCase()];
  if (alias) return [...alias];
  if ((READ_ONLY_TOOLS as readonly string[]).includes(key)) {
    // Read-only tools are never gated, so there is nothing to grant.
    return [];
  }
  return [key];
}

async function withManifest(
  mutate: (gated: string[]) => { next: string[]; moved: string[]; verb: string },
  agentName = AGENT_NAME,
): Promise<ClearanceChange> {
  const client = createClient();

  let agent: TF.Agent;
  try {
    const list = await client.agents.list();
    const found = list.data.find((a) => a.name === agentName);
    if (!found) {
      throw new Error(
        `No agent named "${agentName}" on this harness. Provision it first: npx tsx src/agent/provision.ts`,
      );
    }
    agent = found;
  } catch (err) {
    throw new Error(explain(err));
  }

  const manifest: TF.AgentSpec = structuredClone(agent.manifest);
  const servers = manifest.mcpServers ?? [];
  const entry = servers.find((s) => s.name === MCP_SERVER_NAME);
  if (!entry) {
    throw new Error(
      `Agent "${agentName}" has no MCP server named "${MCP_SERVER_NAME}" attached, so there is nothing to gate. ` +
        'Rerun provision.ts.',
    );
  }

  const before = expandSelectors(entry.requireApprovalForTools);
  const { next, moved, verb } = mutate(before);
  entry.requireApprovalForTools = next;
  manifest.mcpServers = servers;

  try {
    await client.agents.update(agent.id, { manifest });
  } catch (err) {
    throw new Error(explain(err));
  }

  return {
    agentId: agent.id,
    agentName,
    before,
    after: next,
    moved,
    summary: moved.length
      ? `${verb}: ${moved.join(', ')}. Still gated: ${next.length ? next.join(', ') : 'nothing — the agent acts unattended'}.`
      : `No change. Still gated: ${next.length ? next.join(', ') : 'nothing — the agent acts unattended'}.`,
  };
}

/**
 * Give the agent clearance to use a tool WITHOUT human approval.
 * Accepts a tool name (`apply_patch`), an alias (`designer`, `manager`,
 * `operator`, `all`) or a selector (`@all`, `@destructive`).
 */
export async function grantClearance(roleOrTool: string, agentName = AGENT_NAME): Promise<ClearanceChange> {
  const targets = resolveTools(roleOrTool);
  return withManifest((gated) => {
    const moved = targets.filter((t) => gated.includes(t));
    return { next: gated.filter((t) => !targets.includes(t)), moved, verb: 'Clearance granted' };
  }, agentName);
}

/**
 * Take clearance back: the agent must ask a human before using these tools
 * again. The inverse of grantClearance, and the thing to call when the agent
 * has just done something expensive.
 */
export async function revokeClearance(roleOrTool: string, agentName = AGENT_NAME): Promise<ClearanceChange> {
  const targets = resolveTools(roleOrTool);
  return withManifest((gated) => {
    const moved = targets.filter((t) => !gated.includes(t));
    return { next: [...gated, ...moved], moved, verb: 'Clearance revoked' };
  }, agentName);
}

/** Current gate, without changing it. */
export async function readClearance(agentName = AGENT_NAME): Promise<{
  gated: string[];
  unattended: string[];
}> {
  const client = createClient();
  try {
    const list = await client.agents.list();
    const agent = list.data.find((a) => a.name === agentName);
    if (!agent) throw new Error(`No agent named "${agentName}" on this harness.`);
    const entry = agent.manifest.mcpServers?.find((s) => s.name === MCP_SERVER_NAME);
    const gated = expandSelectors(entry?.requireApprovalForTools ?? ['@write', '@destructive']);
    const unattended = ALL_TOOLS.filter((t) => !gated.includes(t));
    return { gated, unattended };
  } catch (err) {
    throw new Error(explain(err));
  }
}

/* Small CLI so the mechanic is demoable without wiring UI:
 *   npx tsx src/agent/trust.ts read
 *   npx tsx src/agent/trust.ts grant manager
 *   npx tsx src/agent/trust.ts revoke all
 */
const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const [command, target] = process.argv.slice(2);
  const run = async () => {
    if (command === 'read' || !command) return console.log(await readClearance());
    if (!target) throw new Error(`usage: tsx src/agent/trust.ts <read|grant|revoke> [role-or-tool]`);
    if (command === 'grant') return console.log((await grantClearance(target)).summary);
    if (command === 'revoke') return console.log((await revokeClearance(target)).summary);
    throw new Error(`unknown command "${command}" (expected read, grant or revoke)`);
  };
  run().catch((err) => {
    console.error('[trust]', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
