/**
 * Provision the HEADCOUNT agent against a TrueForge harness.
 *
 *   npx tsx src/agent/provision.ts
 *
 * Two registrations, in order:
 *   1. the MCP server, as a tenant-level connector (name + remote URL), because
 *      TrueForge attaches MCP servers by NAME and resolves the URL itself;
 *   2. the agent, whose manifest references that connector name and carries the
 *      approval gate — `require_approval_for_tools` has no UI, it is API-only,
 *      which is exactly why this file exists.
 *
 * Env:
 *   TRUEFORGE_BASE_URL   default http://localhost:8790
 *   TRUEFORGE_TOKEN      only if the harness has auth enabled
 *   MCP_URL              default http://localhost:3001/mcp
 *                        (use http://host.docker.internal:3001/mcp if the
 *                         harness runs in Docker and we run on the host)
 *   MODEL_FQN            default anthropic/claude-sonnet-4-6
 *   HEADCOUNT_AGENT_NAME default headcount-designer
 *
 * Nothing here throws at the caller: a missing harness, a missing model
 * provider or a missing API key each produce an explanation and a non-zero
 * exit, never a stack trace.
 */

import { BASE_URL, createClient, explain, isUnreachable } from './client.js';
import {
  AGENT_NAME,
  buildAgentManifest,
  buildMcpServerManifest,
  DEFAULT_MODEL_FQN,
  MCP_SERVER_NAME,
  MCP_URL,
  MUTATING_TOOLS,
  READ_ONLY_TOOLS,
  verifyToolAnnotations,
} from './manifest.js';

const log = (...args: unknown[]) => console.log('[provision]', ...args);
const warn = (...args: unknown[]) => console.warn('[provision]', ...args);

async function main(): Promise<number> {
  const client = createClient();

  log(`harness   ${BASE_URL}`);
  log(`mcp url   ${MCP_URL}`);
  log(`agent     ${AGENT_NAME}`);
  log(`model     ${DEFAULT_MODEL_FQN}`);

  /* 1. Is the harness even there? ------------------------------------- */
  try {
    const caps = await client.server.getCapabilities();
    log('harness reachable.', summariseCapabilities(caps));
  } catch (err) {
    if (isUnreachable(err)) {
      console.error('\n' + explain(err) + '\n');
      return 1;
    }
    warn('capability probe failed, continuing anyway:', explain(err));
  }

  /* 2. Is a model provider configured? --------------------------------- */
  //    Fatal, and worth stopping on. The harness rejects an agent whose model
  //    has no provider behind it, so continuing only trades a clear message
  //    here for a raw 422 forty lines later. This is the first command anyone
  //    running the project types; it should say what to do, not what broke.
  try {
    const models = await client.models.list();
    const names = models.data.map((m) => m.name);
    if (names.length === 0) {
      console.error(
        `\nNo model provider is configured on the harness at ${BASE_URL}.\n\n` +
          '  TrueForge ships without one, and an agent cannot be created until a model exists.\n' +
          '  It takes about a minute:\n\n' +
          `    1. open ${BASE_URL}\n` +
          '    2. Settings → Models → pick your provider → paste an API key → Create\n' +
          '    3. re-run this command with the model you just added:\n\n' +
          '         MODEL_FQN=anthropic/claude-sonnet-4-6 npx tsx src/agent/provision.ts\n\n' +
          '  Any provider works — OpenAI, Anthropic, Gemini, or an OpenAI-compatible endpoint.\n',
      );
      process.exit(1);
    } else if (!names.includes(DEFAULT_MODEL_FQN)) {
      warn(
        `MODEL_FQN "${DEFAULT_MODEL_FQN}" is not in this harness's model list. Available: ${names.slice(0, 12).join(', ')}` +
          `${names.length > 12 ? ` (+${names.length - 12} more)` : ''}.\n` +
          `           Provisioning anyway — rerun with MODEL_FQN=<one of the above> to switch.`,
      );
    } else {
      log(`model "${DEFAULT_MODEL_FQN}" is available.`);
    }
  } catch (err) {
    warn('could not list models:', explain(err));
  }

  /* 3. Verify the approval gate can actually see our tools -------------- */
  //    TrueForge resolves @write as `readOnlyHint === false && destructiveHint !== true`
  //    and @destructive as `destructiveHint === true`. A tool with no annotations
  //    block matches NEITHER, so it would run with no approval and no error —
  //    the gate fails OPEN. Check the emitted JSON rather than trusting the code.
  try {
    const check = await verifyToolAnnotations(MCP_URL);
    if (check.ok) {
      log('tool annotations verified on the live tools/list — every mutating tool is gateable.');
    } else {
      warn('TOOL ANNOTATION PROBLEMS — the approval gate may fail open:');
      for (const problem of check.problems) warn(`  - ${problem}`);
    }
  } catch (err) {
    warn(
      `could not read tools/list from ${MCP_URL} to verify annotations: ${(err as Error).message}\n` +
        '           Start the MCP server first: npx tsx src/mcp/server.ts',
    );
  }

  /* 4. Register the MCP server as a connector -------------------------- */
  const mcpManifest = buildMcpServerManifest(MCP_URL);
  try {
    const created = await client.settings.mcpServers.createOrUpdate({ manifest: mcpManifest });
    log(`MCP connector "${created.data.manifest?.name ?? MCP_SERVER_NAME}" registered at ${MCP_URL}`);
  } catch (err) {
    console.error('\nCould not register the MCP server connector.');
    console.error(explain(err));
    console.error(
      '\nCheck that the MCP server is running and reachable FROM the harness process:\n' +
        '    npx tsx src/mcp/server.ts\n' +
        `    curl -s ${MCP_URL.replace(/\/mcp$/, '/health')}\n` +
        '  If TrueForge runs in Docker, "localhost" means the container. Use:\n' +
        '    MCP_URL=http://host.docker.internal:3001/mcp npx tsx src/agent/provision.ts\n',
    );
    return 1;
  }

  //  Best-effort: ask the harness what tools it actually sees. This is the
  //  single most useful signal that the URL is right and the handshake works.
  try {
    const tools = await client.mcpServers.listTools(MCP_SERVER_NAME);
    const names = (tools.data ?? []).map((t) => String(t.name ?? '')).filter(Boolean);
    log(`harness sees ${names.length} tools: ${names.join(', ')}`);
    const missing = [...READ_ONLY_TOOLS, ...MUTATING_TOOLS].filter((t) => !names.includes(t));
    if (names.length && missing.length) warn(`expected tools not visible to the harness: ${missing.join(', ')}`);
  } catch (err) {
    warn(
      'the harness could not list tools on the connector yet (this is usually the URL not being reachable from\n' +
        `           the harness process): ${explain(err)}`,
    );
  }

  /* 5. Create or update the agent -------------------------------------- */
  const manifest = buildAgentManifest();
  try {
    const existing = await client.agents.list();
    const found = existing.data.find((a) => a.name === AGENT_NAME);

    if (found) {
      const updated = await client.agents.update(found.id, { manifest });
      log(`agent "${AGENT_NAME}" updated (id ${updated.data.id}).`);
    } else {
      const created = await client.agents.create({ name: AGENT_NAME, manifest });
      log(`agent "${AGENT_NAME}" created (id ${created.data.id}).`);
    }
  } catch (err) {
    const detail = explain(err);
    const isModelProblem = /model|provider/i.test(detail);
    console.error('\nCould not create or update the agent.');
    // When we can say something useful, say only that: the raw error body is
    // noise to someone who just wants to know which knob to turn.
    if (!isModelProblem) console.error(detail);
    if (isModelProblem) {
      console.error(
        `\n  The harness has no provider backing "${DEFAULT_MODEL_FQN}". Add one in TrueForge → Settings →\n` +
          '  Model Providers (it needs an API key), or provision against a model it already has:\n' +
          '    MODEL_FQN=<provider/model> npx tsx src/agent/provision.ts\n',
      );
    }
    return 1;
  }

  const gate = manifest.mcpServers?.[0]?.requireApprovalForTools ?? [];
  log('approval gate:', gate.length ? gate.join(', ') : '(none — the agent acts unattended)');
  log('unattended   :', READ_ONLY_TOOLS.join(', '));
  log('');
  // Provisioning rewrites the manifest wholesale, which returns the agent to
  // the default gate and discards whatever standing the supervisor recorded.
  // That is the right default — a redeploy should not inherit trust an earlier
  // build earned — but losing autonomy silently looks exactly like never
  // having had it, so it gets said out loud.
  log('');
  log('This reset earned clearance to the default gate. The supervisor');
  log('(src/agent/autonomy.ts) will earn it back from zero.');
  log('');
  log('Widen or narrow that gate at runtime without touching this file:');
  log('  import { grantClearance, revokeClearance } from "./src/agent/trust.js"');
  log('Open sessions ONLY via src/agent/session.ts — it binds by agent NAME. A session created with an');
  log('inline spec freezes the manifest for its lifetime and clearance changes silently do nothing.');

  return 0;
}

function summariseCapabilities(caps: unknown): string {
  try {
    const data = (caps as { data?: Record<string, unknown> }).data ?? {};
    const enabled = Object.entries(data)
      .filter(([, v]) => v === true || (typeof v === 'object' && v !== null && (v as any).enabled))
      .map(([k]) => k);
    return enabled.length ? `capabilities: ${enabled.join(', ')}` : '';
  } catch {
    return '';
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[provision] unexpected failure:', explain(err));
    process.exit(1);
  });
