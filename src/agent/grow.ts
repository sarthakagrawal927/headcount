/**
 * grow — the tech tree as an approval log.
 *
 * HEADCOUNT ships with a one-role seed pack: a riveter, one SOP, one supervisor
 * nobody can afford. Everything above that line is supposed to be *designed*,
 * not authored — by an agent that reads the live game, names the kind of
 * structural novelty it is attempting, proves the design in simulation, and
 * then has to stop and ask a human before the running game changes.
 *
 * This file runs that loop over and over. Each round is a fresh session bound
 * to the agent BY NAME (see session.ts for why that matters), pointed at
 * whatever the game has become since the last round. The output is
 * `docs/grown-tree.md`: not a transcript, but the record of which mechanics
 * survived evidence and approval, and exactly why the rest did not.
 *
 *   npx tsx src/agent/grow.ts                 # 12 rounds, auto-approving
 *   npx tsx src/agent/grow.ts --rounds 3      # a short one
 *   npx tsx src/agent/grow.ts --manual        # stop and ask you at every gate
 *   npx tsx src/agent/grow.ts --out docs/x.md # write the notebook elsewhere
 *
 * Auto-approval is the default here and that is a deliberate, narrow choice: a
 * twelve-round unattended run is about whether the EVIDENCE controls hold, not
 * about whether a human can click Allow. The server still refuses unevidenced,
 * incoherent or undeclared patches after approval, and those refusals are the
 * most interesting rows in the notebook. Use --manual to put a person back in.
 *
 * Rounds fail. That is the point of writing them down.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import { createClient, explain } from './client.js';
import { AGENT_NAME } from './manifest.js';
import { createSession } from './session.js';

/* ------------------------------------------------------------------ flags */

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return fallback;
}

const ROUNDS = Math.max(1, Number(flag('rounds', '12')) || 12);
const MANUAL = process.argv.includes('--manual');
const OUT = resolve(process.cwd(), flag('out', 'docs/grown-tree.md'));
const GAME_URL = process.env.GAME_URL ?? 'http://localhost:3001';

/**
 * How many times one round may resolve a pause (an approval, a clarifying
 * question) or absorb a nudge before we give up and write the round down as it
 * stands. Bounded so that an agent which will not converge shows up as a
 * result rather than as an infinite loop.
 */
const MAX_STEPS_PER_ROUND = 12;

/**
 * Soft wall-clock budget for one round. It cannot interrupt a stream already in
 * flight, but it stops the round from opening another one — which is what keeps
 * a twelve-round run from being held hostage by a single agent that will not
 * converge. A round cut short is written down as a round cut short.
 */
const ROUND_BUDGET_MS = Math.max(30, Number(flag('budget', '300')) || 300) * 1000;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

/* ------------------------------------------------------- the live game */

interface LivePack {
  version: number;
  roles: Array<{ id: string; name: string; tier: number }>;
  sops: string[];
  rungs: number;
  diagnosis: string;
  throughput: number;
  attentionUtilisation: number;
  blockedFraction: number;
  headcount: number;
  patchCount: number;
  /** Raw pack, JSON-stringified, trimmed — what the agent will diff against. */
  packJson: string;
}

/**
 * Read the running company over its plain HTTP surface rather than through the
 * agent. The agent reads it too, with get_content — but the runner needs its
 * own independent read to (a) build the next round's brief and (b) confirm
 * afterwards that the pack version actually moved. An agent reporting that it
 * applied a patch is not evidence that it did.
 */
async function readLive(): Promise<LivePack | null> {
  try {
    const res = await fetch(`${GAME_URL}/game`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const pack = data.pack ?? {};
    return {
      version: pack.version ?? 0,
      roles: (pack.roles ?? []).map((r: any) => ({ id: r.id, name: r.name, tier: r.tier })),
      sops: (pack.sops ?? []).map((s: any) => s.id),
      rungs: (pack.tenureLadder ?? []).length,
      diagnosis: data.derived?.diagnosis ?? '',
      throughput: data.derived?.throughput ?? 0,
      attentionUtilisation: data.derived?.attentionUtilisation ?? 0,
      blockedFraction: data.derived?.blockedFraction ?? 0,
      headcount: data.derived?.headcountTotal ?? 0,
      patchCount: (data.patchLog ?? []).length,
      packJson: JSON.stringify(pack),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- the brief */

const NOVELTY_KINDS = [
  'new resource',
  'cross-unit dependency',
  'rule inversion',
  'soft cap',
  'currency sink',
  'subgame',
  'reset layer',
] as const;

function brief(round: number, live: LivePack | null, alreadyTried: string[]): string {
  const shape = live
    ? [
        `The live game right now (pack v${live.version}, ${live.patchCount} patches applied so far):`,
        `  roles: ${live.roles.map((r) => `${r.id}(tier ${r.tier})`).join(', ') || 'none'}`,
        `  SOPs: ${live.sops.join(', ') || 'none'}   tenure rungs: ${live.rungs}`,
        `  headcount ${live.headcount}, throughput ${live.throughput.toFixed(2)}/s, ` +
          `attention utilisation ${live.attentionUtilisation.toFixed(2)}, ` +
          `${(live.blockedFraction * 100).toFixed(0)}% of the floor blocked`,
        `  engine diagnosis: ${live.diagnosis}`,
      ].join('\n')
    : '(The runner could not read the live game directly. Use get_state and get_content.)';

  const avoid = alreadyTried.length
    ? `\nEarlier rounds of this run already attempted: ${alreadyTried.join('; ')}. ` +
      `Pick a DIFFERENT kind of novelty this time unless you can argue the previous one was left unfinished.`
    : '';

  return `This is design round ${round} of a long run. The game you are looking at is the one previous rounds
built — every mechanic in it was designed by you and approved by a human. Add one more.

${shape}
${avoid}

Do this, in order, in THIS turn:

1. Call get_state, get_telemetry and get_content. Say in one sentence where the ceiling actually is,
   with numbers, not adjectives.
2. Read your idle-game-design skill and choose ONE kind of structural novelty from its taxonomy:
   ${NOVELTY_KINDS.join(', ')}. Design a single mechanic of that kind which raises the ceiling.
   Do not raise playerAnswerRate — the fixed player is the premise.
3. Announce your choice on two lines of their own, exactly in this format, before you simulate:
      NOVELTY: <one of the kinds above>
      MECHANIC: <one sentence naming what you are adding and what decision it forces>
4. Call simulate_patch with your diff. Report the numbers honestly, the bad ones included. If the
   verdict is degenerate or stalled, discard the design and try a different one rather than arguing.
5. Call apply_patch with the evidence token from that simulation and NO patch argument, a rationale
   citing the simulated numbers, and a "changes" array declaring EVERY effect the simulation listed
   under "applied" — incidental ones included. The server refuses the patch if anything is undeclared.`;
}

/**
 * Nudges, escalating in directness rather than in volume.
 *
 * This model reliably narrates a good simulation and then stops, as if
 * reporting the result were the deliverable. Repeating the original ask does
 * nothing; removing the option to explain is what moves it. Bounded, so an
 * agent that simply will not act is recorded as such.
 */
const NUDGES = [
  'You have the simulation. Call apply_patch now: evidence token from that simulate_patch call, no patch argument, and a changes array listing every line the simulation printed under "applied".',
  'Two tool calls, this turn, no prose between them: simulate_patch with your diff, then apply_patch with the evidence token it returns, your rationale, and every "applied" line copied into changes.',
  'Do not explain and do not summarise. Emit the apply_patch tool call. evidence = the token string from simulate_patch, patch = omitted entirely, changes = the "applied" array verbatim.',
];

/** Sent once after the server refuses a patch — the refusal says what to fix. */
function recoveryNudge(reason: string): string {
  return `The server refused that patch and the live game is unchanged. It said: ${reason}\n\nFix exactly that and call apply_patch again in this turn. If the complaint is about undeclared changes, copy every line from the simulation's "applied" array into "changes" verbatim. If the evidence token is stale, call simulate_patch again first and use the new token.`;
}

/* ------------------------------------------------------------ streaming */

interface PendingCall {
  threadId: string;
  toolCallId: string;
  name: string;
  args: string;
}

interface Collected {
  approvals: PendingCall[];
  questions: PendingCall[];
  /** Assistant prose, in order. */
  text: string[];
  /** Every tool call the model emitted this turn, in order. */
  calls: Array<{ name: string; args: string }>;
  /** Tool responses, resolved back to the tool that produced them. */
  responses: Array<{ name: string; text: string }>;
  turnStatus: string;
  streamError?: string;
}

/**
 * Assistant content is either a string or an array of content parts, and which
 * form you get depends on the provider behind the model FQN. Reading only the
 * string case silently loses the agent's entire prose on some of them —
 * including the `NOVELTY:` line this runner asks it to declare, which then
 * reads back as "unstated" for reasons that look like the agent's fault.
 */
function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : (part?.text ?? part?.refusal ?? '')))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Run one turn as a stream and collect everything the notebook will need.
 *
 * The delta merge is load-bearing: tool-call arguments arrive assembled across
 * `*.delta` events, and without merging them into their base event every tool
 * reads back as `unknown` with empty arguments — which means no proposal to
 * show at the approval gate and no way to tell apply_patch from anything else.
 */
async function runStream(sessionId: string, input: any[]): Promise<Collected> {
  const client = createClient();
  const out: Collected = {
    approvals: [],
    questions: [],
    text: [],
    calls: [],
    responses: [],
    turnStatus: 'unknown',
  };

  const events = new Map<string, any>();
  /** tool call id -> what it was, so tool.response can be attributed. */
  const calls = new Map<string, { name: string; args: string }>();
  /** Responses held by call id until the merged arguments are available. */
  const responses: Array<{ id: string; text: string }> = [];

  let stream;
  try {
    stream = await client.sessions.createTurnStream(sessionId, { input });
  } catch (err) {
    out.streamError = explain(err);
    out.turnStatus = 'refused';
    return out;
  }

  try {
    for await (const { data: event } of stream.withMetadata()) {
      if (isEventDelta(event)) {
        const base = events.get((event as any).id);
        if (base) mergeEventDelta(base, event);
      } else {
        events.set((event as any).id, event);
      }

      const e = event as any;
      switch (e.type) {
        case 'model.message': {
          // Names only, and only so a tool.response arriving mid-stream can be
          // attributed. Content and arguments are both still empty at this
          // point — see the post-pass below.
          for (const c of e.toolCalls ?? []) {
            calls.set(c.id, { name: c.toolInfo?.name ?? c.function?.name ?? 'unknown', args: '' });
          }
          break;
        }
        case 'tool.response': {
          // A tool result is usually the server's JSON as a plain string, but
          // it can arrive as MCP content parts. Flatten either into text so
          // the verdict parsers below only ever see one shape.
          const raw = e.content;
          const text = messageText(raw) || JSON.stringify(raw ?? {});
          responses.push({ id: e.toolCallId, text });
          break;
        }
        case 'tool.approval_required':
        case 'tool.response_required': {
          for (const ref of e.toolCalls ?? []) {
            // The name and arguments live on the model.message that requested
            // the call, not on the pause event itself.
            const source = events.get(ref.sourceEventId);
            const call = source?.toolCalls?.find((c: any) => c.id === ref.id);
            const item: PendingCall = {
              threadId: e.threadId,
              toolCallId: ref.id,
              name: call?.toolInfo?.name ?? call?.function?.name ?? calls.get(ref.id)?.name ?? 'unknown',
              args: String(call?.function?.arguments ?? calls.get(ref.id)?.args ?? ''),
            };
            (e.type === 'tool.approval_required' ? out.approvals : out.questions).push(item);
          }
          break;
        }
        case 'turn.done': {
          out.turnStatus = e.state?.status ?? 'unknown';
          if (e.state?.status === 'error') out.streamError = e.state?.message;
          break;
        }
      }
    }
  } catch (err) {
    // A dropped stream mid-turn is a normal failure for this stack, not a
    // reason to abandon the run. Record it and let the round continue.
    out.streamError = explain(err);
    if (out.turnStatus === 'unknown') out.turnStatus = 'stream-broken';
  }

  // Assistant PROSE and tool-call ARGUMENTS are both only complete once the
  // stream has finished merging deltas into their base event, so both are
  // harvested here rather than in the loop above. Reading them as the base
  // event arrives gets you a tool name with empty arguments and a message with
  // empty content — the trap that makes a proposal look like `apply_patch()`
  // with nothing in it, and makes an agent that did declare its reasoning read
  // back as if it never said anything.
  for (const event of events.values()) {
    if (event?.type !== 'model.message') continue;
    const content = messageText(event.content);
    if (content.trim()) out.text.push(content.trim());
    for (const c of event.toolCalls ?? []) {
      const name = c.toolInfo?.name ?? c.function?.name ?? calls.get(c.id)?.name ?? 'unknown';
      const args = String(c.function?.arguments ?? '');
      calls.set(c.id, { name, args });
      out.calls.push({ name, args });
    }
  }
  for (const r of responses) {
    out.responses.push({ name: calls.get(r.id)?.name ?? inferToolName(r.text), text: r.text });
  }
  // Same reason: what the human is shown at the gate has to be the assembled
  // proposal, not whatever had arrived by the time the pause event fired.
  for (const pause of [...out.approvals, ...out.questions]) {
    const merged = calls.get(pause.toolCallId);
    if (!merged) continue;
    if (merged.name !== 'unknown') pause.name = merged.name;
    if (merged.args.length > pause.args.length) pause.args = merged.args;
  }

  return out;
}

/**
 * Which tool a response came from, judged by its payload.
 *
 * Attribution by call id is the first choice, but it is not reliable enough to
 * rest on: with deferred tool loading a call can arrive wrapped as `call_tool`,
 * and a response can outlive the message that requested it. Since both tools
 * that matter here have unmistakable payloads, the payload is the tiebreak —
 * and getting this wrong is silent, showing up only as a round that "never
 * simulated" while somehow holding a valid evidence token.
 */
function inferToolName(text: string): string {
  if (text.includes('"evidence"') || text.includes('"baseline"')) return 'simulate_patch';
  if (
    text.includes('"packVersion"') ||
    text.includes('"declared"') ||
    /patch (refused|rejected)/i.test(text) ||
    /apply_patch/.test(text)
  ) {
    return 'apply_patch';
  }
  if (text.includes('"tenureLadder"')) return 'get_content';
  return 'tool';
}

/** Trust the call-id name only when it is a tool we act on; otherwise sniff. */
function classify(name: string, text: string): string {
  return name === 'simulate_patch' || name === 'apply_patch' ? name : inferToolName(text);
}

/**
 * Pull the tool's JSON payload out of a response body.
 *
 * The body is usually exactly the JSON, but not always — a harness or a shim
 * can prefix it with a line of its own, and a plain `JSON.parse` on that throws
 * and takes the whole verdict with it. Try the body, then the widest brace-
 * delimited span inside it.
 */
function extractJson(text: string): any | null {
  const trimmed = text.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const candidates = [trimmed];
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  const balanced = firstBalancedObject(trimmed);
  if (balanced) candidates.push(balanced);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * The first complete `{...}` in a string, brace-counted with string literals
 * respected.
 *
 * Needed because a body sometimes carries the payload more than once — a retry
 * echoed after the first result, say. First-brace-to-last-brace then spans two
 * objects and parses as nothing, and the most informative text in the whole
 * run (the server explaining exactly why it refused) is lost as a blob.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/* --------------------------------------------------------------- parsing */

/**
 * Pull `KEY: value` out of the agent's prose, last occurrence wins.
 *
 * Markdown emphasis lands in every position a model can put it — `**KEY:**`,
 * `**KEY**:`, `- **KEY:** ` — so the asterisks are treated as optional noise
 * everywhere rather than matched in one specific arrangement.
 */
function declared(text: string, key: string): string | null {
  const re = new RegExp(`^[\\s>*_-]*${key}\\s*\\**\\s*[:：]\\s*\\**\\s*(.+?)\\s*\\**$`, 'gim');
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(text)) !== null) {
    last = match[1].replace(/\*\*/g, '').trim();
  }
  return last;
}

/**
 * Render whatever the harness handed back as an error into a sentence.
 *
 * The MCP server sends `{ error: "...", problem: "..." }`, but what arrives at
 * this end is not always that shape — an error can come back as a nested
 * object, and `String()` on one of those produces `[object Object]`, which
 * turns the most interesting rows in the notebook into nothing at all.
 */
function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const named = o.message ?? o.problem ?? o.error ?? o.reason ?? o.text;
    if (named !== undefined) return asText(named);
    return JSON.stringify(value);
  }
  return String(value);
}

/** The taxonomy kind, from the declaration if given, otherwise from the prose. */
function noveltyKind(text: string): string {
  const stated = declared(text, 'NOVELTY');
  if (stated) {
    const lower = stated.toLowerCase();
    const known = NOVELTY_KINDS.find((k) => lower.includes(k.split(' ')[0]));
    return known ?? stated.slice(0, 48);
  }
  const lower = text.toLowerCase();
  const guessed = NOVELTY_KINDS.find((k) => lower.includes(k));
  return guessed ? `${guessed} (inferred)` : 'unstated';
}

interface SimVerdict {
  degenerate: boolean;
  stalled: boolean;
  timeToWall: number | null;
  peakThroughput: number;
  finalThroughput: number;
  attentionUtilisation: number;
  applied: string[];
  verdict: string;
}

function parseSimulation(text: string): SimVerdict | null {
  const json = extractJson(text);
  if (!json || !json.patched) {
    // Unreadable body, but the verdict sentence is worth keeping even so — a
    // round that simulated and could not be transcribed is a different fact
    // from a round that never simulated, and the notebook should not conflate
    // them.
    const verdict = /"verdict"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1];
    if (!verdict) return null;
    return {
      degenerate: /DEGENERATE/.test(verdict),
      stalled: /STALLED/.test(verdict),
      timeToWall: Number(/Wall at t=([0-9.]+)/.exec(verdict)?.[1] ?? NaN) || null,
      peakThroughput: 0,
      finalThroughput: 0,
      attentionUtilisation: 0,
      applied: [],
      verdict: verdict.replace(/\\"/g, '"'),
    };
  }
  return {
    degenerate: Boolean(json.patched.degenerate),
    stalled: Boolean(json.patched.stalled),
    timeToWall: json.patched.timeToWall ?? null,
    peakThroughput: Number(json.patched.peakThroughput ?? 0),
    finalThroughput: Number(json.patched.finalThroughput ?? 0),
    attentionUtilisation: Number(json.patched.attentionUtilisation ?? 0),
    applied: Array.isArray(json.applied) ? json.applied.map(String) : [],
    verdict: String(json.verdict ?? ''),
  };
}

/** What the server said about an apply_patch call. */
function parseApply(text: string): { ok: boolean; version?: number; applied?: string[]; reason?: string } | null {
  const json = extractJson(text);
  if (!json) {
    if (/patch (refused|rejected)/i.test(text) || /MCP error/i.test(text)) {
      return { ok: false, reason: text.replace(/\s+/g, ' ').trim().slice(0, 400) };
    }
    return null;
  }
  if (json.ok === true && json.packVersion !== undefined) {
    return { ok: true, version: json.packVersion, applied: (json.applied ?? []).map(String) };
  }
  if (json.error) {
    const detail =
      asText(json.problem) ||
      asText(json.problems) ||
      (Array.isArray(json.undeclared) ? `undeclared: ${asText(json.undeclared)}` : '');
    const reason = [asText(json.error), detail].filter(Boolean).join(' ');
    return { ok: false, reason: reason || text.slice(0, 300) };
  }
  return null;
}

/* --------------------------------------------------------------- the gate */

const rl = MANUAL ? createInterface({ input: process.stdin, output: process.stdout }) : null;

async function askHuman(call: PendingCall): Promise<{ allow: boolean; reason?: string }> {
  if (!rl) return { allow: true };
  console.log(bold('\n╔══ APPROVAL REQUIRED ══════════════════════════════'));
  console.log(bold(`║ tool: ${call.name}`));
  let pretty = call.args;
  try {
    pretty = JSON.stringify(JSON.parse(call.args), null, 2);
  } catch {
    /* leave it raw */
  }
  for (const line of pretty.split('\n')) console.log(`║   ${line}`);
  console.log(bold('╚═══════════════════════════════════════════════════'));
  const answer = await new Promise<string>((res) => rl.question('approve? [y/N] ', res));
  return answer.trim().toLowerCase().startsWith('y')
    ? { allow: true }
    : { allow: false, reason: 'the human declined at the gate' };
}

/* ------------------------------------------------------------ the record */

interface Round {
  n: number;
  packBefore: number;
  packAfter: number;
  novelty: string;
  mechanic: string;
  diagnosis: string;
  simulations: SimVerdict[];
  /** How many simulate_patch responses came back, readable or not. */
  simulationsSeen: number;
  /** The declaration the human (or the auto-approver) was shown, last attempt. */
  proposal: { rationale?: string; changes?: string[] } | null;
  /** How many times it reached for apply_patch this round. */
  attempts: number;
  /** What the SERVER recorded the patch doing — computed, not claimed. */
  appliedSummary: string[];
  approved: boolean | null;
  outcome: 'applied' | 'refused' | 'denied' | 'never-asked' | 'error';
  reason: string;
  nudges: number;
  questionsAsked: string[];
  seconds: number;
}

/* ---------------------------------------------------------------- a round */

async function runRound(n: number, tried: string[]): Promise<Round> {
  const started = Date.now();
  const before = await readLive();
  const record: Round = {
    n,
    packBefore: before?.version ?? 0,
    packAfter: before?.version ?? 0,
    novelty: 'unstated',
    mechanic: '',
    diagnosis: before?.diagnosis ?? '',
    simulations: [],
    simulationsSeen: 0,
    proposal: null,
    attempts: 0,
    appliedSummary: [],
    approved: null,
    outcome: 'never-asked',
    reason: 'the agent never reached apply_patch',
    nudges: 0,
    questionsAsked: [],
    seconds: 0,
  };

  let sessionId: string;
  try {
    ({ sessionId } = await createSession());
  } catch (err) {
    record.outcome = 'error';
    record.reason = String(err instanceof Error ? err.message : err);
    record.seconds = (Date.now() - started) / 1000;
    return record;
  }

  const prose: string[] = [];
  let nudgeIndex = 0;
  let recovered = false;
  let collected = await runStream(sessionId, [{ type: 'user.message', content: brief(n, before, tried) }]);

  let ranOutOfTime = false;
  for (let step = 0; step < MAX_STEPS_PER_ROUND; step++) {
    prose.push(...collected.text);

    // What it *asked* for. Read from the merged tool calls rather than from
    // the approval event, so an attempt that never paused (see below) is still
    // recorded — the harness stops asking about a tool once it has been
    // allowed in a session, so later attempts arrive with no gate at all.
    for (const call of collected.calls) {
      if (call.name !== 'apply_patch') continue;
      record.attempts++;
      try {
        const parsed = JSON.parse(call.args);
        record.proposal = { rationale: parsed.rationale, changes: parsed.changes };
      } catch {
        if (!record.proposal) record.proposal = { rationale: call.args.slice(0, 300) };
      }
    }

    // What the server made of it.
    for (const r of collected.responses) {
      const kind = classify(r.name, r.text);
      if (kind === 'simulate_patch') {
        record.simulationsSeen++;
        const sim = parseSimulation(r.text);
        if (sim) record.simulations.push(sim);
      } else if (kind === 'apply_patch') {
        const applied = parseApply(r.text);
        if (applied?.ok) {
          record.outcome = 'applied';
          record.packAfter = applied.version ?? record.packAfter;
          record.appliedSummary = applied.applied ?? [];
          record.reason = '';
        } else if (applied) {
          record.outcome = 'refused';
          record.reason = applied.reason ?? 'the server refused the patch';
        }
      }
    }

    if (collected.streamError && record.outcome === 'never-asked') {
      record.outcome = 'error';
      record.reason = collected.streamError;
      // A transport failure is not something a nudge fixes, and there is one
      // that gets more likely the longer this loop succeeds: every applied
      // patch makes the ContentPack bigger, and `get_content` returns all of
      // it, so a model with a small request limit eventually cannot be shown
      // the game it is designing. Three nudges into a 413 costs ninety seconds
      // and learns nothing — stop the round and write down what the gateway
      // said.
      if (/\b(413|502|429|too large|All providers failed|context length)\b/i.test(record.reason)) {
        break;
      }
    }

    if (record.outcome === 'applied') break;
    if (Date.now() - started > ROUND_BUDGET_MS) {
      ranOutOfTime = true;
      break;
    }

    // A clarifying question holds the session: no further user message is
    // accepted until it is answered, so nudges would bounce. Answer first.
    if (collected.questions.length) {
      const answers = collected.questions.map((q) => {
        record.questionsAsked.push(q.args.slice(0, 400));
        return {
          type: 'user.tool_response',
          threadId: q.threadId,
          toolCallId: q.toolCallId,
          content:
            'Use your own design judgement and pick the option your simulation supports most strongly. ' +
            'Do not raise playerAnswerRate. Then apply the patch with its evidence token.',
        };
      });
      collected = await runStream(sessionId, answers);
      continue;
    }

    if (collected.approvals.length) {
      // Approval items must be posted on their own — never mixed with a user
      // message in the same turn input.
      const items: any[] = [];
      for (const call of collected.approvals) {
        const decision = await askHuman(call);
        record.approved = decision.allow;
        if (!decision.allow) {
          record.outcome = 'denied';
          record.reason = decision.reason ?? 'denied at the gate';
        }
        items.push({
          type: 'user.tool_approval',
          threadId: call.threadId,
          toolCallId: call.toolCallId,
          approval: decision.allow
            ? { status: 'allow' }
            : { status: 'deny', reason: decision.reason ?? 'not now' },
        });
      }
      collected = await runStream(sessionId, items);
      continue;
    }

    // Nothing is pending. Either the server refused and the agent can still fix
    // it, or the agent stopped short of the tool and needs pushing.
    if (record.outcome === 'refused' && !recovered) {
      recovered = true;
      collected = await runStream(sessionId, [
        { type: 'user.message', content: recoveryNudge(record.reason) },
      ]);
      continue;
    }
    if (record.outcome === 'denied') break;
    if (nudgeIndex < NUDGES.length) {
      record.nudges++;
      collected = await runStream(sessionId, [
        { type: 'user.message', content: NUDGES[nudgeIndex++] },
      ]);
      continue;
    }
    break;
  }

  if (ranOutOfTime && record.outcome === 'never-asked') {
    record.reason = `the round hit its ${(ROUND_BUDGET_MS / 1000).toFixed(0)}s budget before the agent reached apply_patch`;
  }

  const text = prose.join('\n\n');
  record.novelty = noveltyKind(text);
  record.mechanic =
    declared(text, 'MECHANIC') ??
    record.proposal?.rationale?.split(/(?<=\.)\s/)[0] ??
    record.simulations[record.simulations.length - 1]?.applied.join('; ') ??
    '(the agent never named one)';

  // Trust the game, not the agent: confirm the pack version actually moved.
  const after = await readLive();
  if (after) {
    record.packAfter = after.version;
    if (record.outcome === 'applied' && after.version === record.packBefore) {
      record.outcome = 'refused';
      record.reason = 'the agent reported success but the live pack version did not move';
    }
  }
  record.seconds = (Date.now() - started) / 1000;
  return record;
}

/* ------------------------------------------------------------- notebook */

function verdictLine(sim: SimVerdict): string {
  const flags = [sim.degenerate ? 'DEGENERATE' : null, sim.stalled ? 'STALLED' : null]
    .filter(Boolean)
    .join(' + ');
  const wall = sim.timeToWall === null ? 'no wall in window' : `wall at ${sim.timeToWall.toFixed(1)}s`;
  return (
    `${flags || 'shape holds'} — ${wall}, peak ${sim.peakThroughput.toFixed(2)}/s, ` +
    `final ${sim.finalThroughput.toFixed(2)}/s, attention ${sim.attentionUtilisation.toFixed(2)}`
  );
}

/**
 * A refusal as a sentence.
 *
 * Belt and braces on top of `parseApply`: whatever shape a reason arrives in —
 * already a sentence, or a JSON blob that got past every parser — the notebook
 * prints prose. The most useful lines in this document are the refusals, and a
 * pretty-printed object dropped into a markdown paragraph reads as noise and
 * gets skipped.
 */
function readableReason(reason: string): string {
  const json = extractJson(reason);
  if (!json) return reason.replace(/\s+/g, ' ').trim();
  const parts = [
    asText(json.error),
    asText(json.problem) || asText(json.problems),
    Array.isArray(json.undeclared) && json.undeclared.length
      ? `Undeclared: ${json.undeclared.map((u: unknown) => `"${asText(u)}"`).join(', ')}.`
      : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : reason.replace(/\s+/g, ' ').trim();
}

const OUTCOME_WORD: Record<Round['outcome'], string> = {
  applied: 'applied',
  refused: 'refused by server',
  denied: 'denied by human',
  'never-asked': 'never asked',
  error: 'error',
};

function notebook(rounds: Round[], startVersion: number, endVersion: number, model: string): string {
  const applied = rounds.filter((r) => r.outcome === 'applied');
  const lines: string[] = [];

  lines.push('# The grown tech tree');
  lines.push('');
  lines.push(
    'Every mechanic below was designed by an agent reading the live game over MCP, proved in',
    'simulation before it was proposed, and approved by a human before it touched anything. This file',
    'is generated by `src/agent/grow.ts` — it is the run, not a description of the run.',
    '',
  );
  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push(`| run | ${new Date().toISOString()} |`);
  lines.push(`| agent | \`${AGENT_NAME}\` |`);
  lines.push(`| model | \`${model}\` |`);
  lines.push(`| rounds | ${rounds.length} |`);
  lines.push(`| pack version | v${startVersion} → v${endVersion} |`);
  lines.push(`| mechanics that survived | ${applied.length} of ${rounds.length} |`);
  lines.push(`| approval mode | ${MANUAL ? 'a human at every gate' : 'auto-approved; the server still refused what it refused'} |`);
  lines.push('');

  lines.push('## The log');
  lines.push('');
  lines.push('| # | novelty attempted | mechanic | simulation | outcome |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rounds) {
    const sim = r.simulations[r.simulations.length - 1];
    const cell = sim
      ? sim.degenerate || sim.stalled
        ? (sim.degenerate ? 'degenerate' : 'stalled')
        : sim.timeToWall === null
          ? 'no wall'
          : sim.peakThroughput > 0
            ? `wall ${sim.timeToWall.toFixed(0)}s, peak ${sim.peakThroughput.toFixed(1)}/s`
            : `wall ${sim.timeToWall.toFixed(0)}s`
      : r.simulationsSeen > 0
        ? `${r.simulationsSeen} run(s), unreadable`
        : 'not simulated';
    lines.push(
      `| ${r.n} | ${escape(r.novelty)} | ${escape(truncate(r.mechanic, 90))} | ${cell} | ${OUTCOME_WORD[r.outcome]} |`,
    );
  }
  lines.push('');

  lines.push('## Round by round');
  lines.push('');
  for (const r of rounds) {
    lines.push(`### Round ${r.n} — ${OUTCOME_WORD[r.outcome]}`);
    lines.push('');
    lines.push(`**Novelty claimed.** ${r.novelty}`);
    lines.push('');
    lines.push(`**Mechanic.** ${r.mechanic}`);
    lines.push('');
    if (r.diagnosis) {
      lines.push(`**Floor as the agent found it.** pack v${r.packBefore} — ${r.diagnosis}`);
      lines.push('');
    }
    if (r.simulations.length) {
      lines.push('**Simulation.**');
      lines.push('');
      r.simulations.forEach((sim, i) => {
        lines.push(`- run ${i + 1}: ${verdictLine(sim)}`);
        if (sim.applied.length) {
          lines.push(`  - diff: ${sim.applied.map((a) => `\`${a}\``).join(', ')}`);
        }
      });
      lines.push('');
    } else if (r.simulationsSeen > 0) {
      lines.push(
        `**Simulation.** ${r.simulationsSeen} run(s) came back, but none in a form this runner ` +
          'could transcribe. The evidence binding still held — the server checks the token, not this file.',
      );
      lines.push('');
    } else {
      lines.push('**Simulation.** None — the agent never produced a scored diff.');
      lines.push('');
    }
    if (r.proposal?.rationale) {
      lines.push(`**What the human was shown.** ${r.proposal.rationale}`);
      lines.push('');
      if (r.proposal.changes?.length) {
        lines.push('Declared changes:');
        lines.push('');
        for (const c of r.proposal.changes) lines.push(`- ${c}`);
        lines.push('');
      }
    }
    if (r.appliedSummary.length) {
      // The declaration above is the agent's account. This is the server's,
      // computed by diffing the packs. Printing both is the point: where they
      // disagree is the failure mode the declared-changes check exists for.
      lines.push('What the server recorded the patch doing:');
      lines.push('');
      for (const c of r.appliedSummary) lines.push(`- \`${c}\``);
      lines.push('');
    }
    if (r.questionsAsked.length) {
      lines.push(`**It stopped to ask.** ${r.questionsAsked.length} clarifying question(s) during the round.`);
      lines.push('');
    }
    lines.push(
      r.outcome === 'applied'
        ? `**Outcome.** Approved and applied. The live pack moved v${r.packBefore} → v${r.packAfter}.`
        : `**Outcome.** ${OUTCOME_WORD[r.outcome]}. ${readableReason(r.reason)}`,
    );
    lines.push('');
    lines.push(
      dimLine(
        `${r.nudges} nudge(s), ${r.simulationsSeen} simulation(s), ` +
          `${r.attempts} apply_patch attempt(s), ${r.seconds.toFixed(0)}s.`,
      ),
    );
    lines.push('');
  }

  lines.push('## What the log shows');
  lines.push('');
  const byKind = new Map<string, { tried: number; kept: number }>();
  for (const r of rounds) {
    const e = byKind.get(r.novelty) ?? { tried: 0, kept: 0 };
    e.tried++;
    if (r.outcome === 'applied') e.kept++;
    byKind.set(r.novelty, e);
  }
  lines.push('| novelty kind | attempted | survived |');
  lines.push('| --- | --- | --- |');
  for (const [kind, e] of byKind) lines.push(`| ${escape(kind)} | ${e.tried} | ${e.kept} |`);
  lines.push('');

  const failures = rounds.filter((r) => r.outcome !== 'applied');
  if (failures.length) {
    lines.push(
      `${failures.length} of ${rounds.length} rounds produced no change to the live game. Why, in the`,
      'run\'s own words:',
      '',
    );
    for (const f of failures) lines.push(`- **Round ${f.n}** (${OUTCOME_WORD[f.outcome]}) — ${escape(readableReason(f.reason))}`);
    lines.push('');
  } else {
    lines.push('Every round in this run ended in an applied change.');
    lines.push('');
  }
  lines.push(
    'A failed round is not a broken run. Refusals here are the controls doing their job: an unevidenced',
    'patch, a diff whose fingerprint does not match the token it cites, an incoherent role, or a change',
    'list that omits something the patch actually does. The approval covers whether a change is wanted.',
    'It never establishes that the change was measured.',
    '',
  );

  return lines.join('\n');
}

const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const escape = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const dimLine = (s: string) => `<sub>${s}</sub>`;

/* ------------------------------------------------------------------ main */

async function main(): Promise<void> {
  const start = await readLive();
  if (!start) {
    console.log(dim(`(could not reach the game at ${GAME_URL}/game — rounds will rely on MCP reads only)`));
  }
  console.log(
    bold(`\nHEADCOUNT — growing the tech tree over ${ROUNDS} round(s)`) +
      dim(`  agent ${AGENT_NAME}, ${MANUAL ? 'manual approval' : 'auto-approve'}, pack v${start?.version ?? '?'}\n`),
  );

  const rounds: Round[] = [];
  const tried: string[] = [];

  for (let n = 1; n <= ROUNDS; n++) {
    process.stdout.write(dim(`round ${String(n).padStart(2)} … `));
    let round: Round;
    try {
      round = await runRound(n, tried);
    } catch (err) {
      // A round must never take the run down with it.
      round = {
        n,
        packBefore: 0,
        packAfter: 0,
        novelty: 'unstated',
        mechanic: '(round threw)',
        diagnosis: '',
        simulations: [],
        simulationsSeen: 0,
        proposal: null,
        attempts: 0,
        appliedSummary: [],
        approved: null,
        outcome: 'error',
        reason: String(err instanceof Error ? err.message : err),
        nudges: 0,
        questionsAsked: [],
        seconds: 0,
      };
    }
    rounds.push(round);
    if (round.novelty !== 'unstated') tried.push(round.novelty);

    const mark =
      round.outcome === 'applied' ? '\x1b[32m✓\x1b[0m' : round.outcome === 'error' ? '\x1b[31m!\x1b[0m' : '\x1b[33m✗\x1b[0m';
    console.log(
      `${mark} ${OUTCOME_WORD[round.outcome].padEnd(17)} ` +
        `${round.novelty.padEnd(24)} v${round.packBefore}→v${round.packAfter}  ` +
        dim(`${round.seconds.toFixed(0)}s ${round.nudges} nudge(s)`) +
        (round.outcome === 'applied' ? `  ${truncate(round.mechanic, 70)}` : `  ${dim(truncate(round.reason, 70))}`),
    );
  }

  const end = await readLive();
  const model = process.env.MODEL_FQN ?? 'freeai/gh-gpt-4.1';
  const md = notebook(rounds, start?.version ?? 0, end?.version ?? start?.version ?? 0, model);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, md, 'utf8');

  const kept = rounds.filter((r) => r.outcome === 'applied').length;
  console.log(
    bold(`\n${kept}/${rounds.length} mechanics survived evidence and approval.`) +
      dim(`  pack v${start?.version ?? '?'} → v${end?.version ?? '?'}`),
  );
  console.log(dim(`notebook written to ${OUT}\n`));
  rl?.close();
}

main().catch((e) => {
  console.error('\n' + String(e));
  rl?.close();
  process.exit(1);
});
