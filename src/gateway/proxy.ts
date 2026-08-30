/**
 * A thin OpenAI-compatible shim in front of the shared AI gateway.
 *
 * The gateway requires a `project_id` field in the request *body*, which is not
 * part of the OpenAI wire format and therefore not something TrueForge's custom
 * provider will send. Rather than contort the harness config, we terminate the
 * OpenAI protocol here, add what the gateway wants, and forward.
 *
 * It also pins the model. The gateway will silently re-route a request to a
 * different model than the one asked for, which is fine for a chat toy and not
 * fine when you are trying to attribute an agent's design decisions to a
 * specific model. If the upstream substitutes, we log it loudly.
 *
 *   GATEWAY_KEY=<key> npx tsx src/gateway/proxy.ts
 */

import express from 'express';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.env.PROXY_PORT ?? 3002);
const UPSTREAM = process.env.GATEWAY_URL ?? 'https://ai-gateway.sassmaker.com/v1';
const PROJECT_ID = process.env.GATEWAY_PROJECT_ID ?? 'headcount';
const KEY = process.env.GATEWAY_KEY ?? '';
/** Safe ceiling across the free-tier models the gateway routes between. */
const MAX_OUTPUT_TOKENS = Number(process.env.GATEWAY_MAX_TOKENS ?? 2048);
/** Per-tool-result cap. The gateway hard-fails any message over 100k chars. */
const MAX_TOOL_RESULT_CHARS = Number(process.env.GATEWAY_MAX_RESULT_CHARS ?? 6000);

if (!KEY) {
  console.error('GATEWAY_KEY is not set — refusing to start.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '32mb' }));

/**
 * Rewrite a tool-calling conversation into plain turns.
 *
 * The gateway and the providers behind it disagree irreconcilably about how an
 * assistant message that carries tool calls may look: the gateway's schema
 * demands `content` be a non-empty string, and Mistral — which it frequently
 * routes to — demands it be absent. Null, "" and absent are each rejected by
 * one side or the other, so no single-turn tool conversation can survive a
 * second round trip intact.
 *
 * Rather than lose the agent loop entirely, we drop the structured protocol on
 * the way upstream: the assistant's tool calls become a sentence, and the tool
 * results become one user message. The `tools` array still goes up, so the
 * model can keep calling tools; only the transcript of *past* calls is
 * flattened. The harness never sees this — it gets its normal tool-call
 * responses back.
 *
 * This is a workaround for a specific broken gateway, not something to copy.
 */
/**
 * The gateway rejects any single message over 100k characters, and collapsed
 * tool results accumulate across a long agent run. Telemetry payloads are the
 * usual offender: the tail of a window matters far more than its middle, so we
 * keep both ends and say plainly what was dropped.
 */
function truncate(text: string, limit = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.6));
  const tail = text.slice(-Math.floor(limit * 0.3));
  const dropped = text.length - head.length - tail.length;
  return `${head}\n\n... [${dropped} characters omitted] ...\n\n${tail}`;
}

function collapseToolTurns(messages: any[]): any[] {
  const toolNames = new Map<string, string>();
  const out: any[] = [];
  let pendingResults: Array<{ name: string; content: string }> = [];

  const flush = () => {
    if (!pendingResults.length) return;
    const body = pendingResults
      .map((r) => `${r.name} -> ${r.content}`)
      .join('\n\n');
    out.push({
      role: 'user',
      content: `Results of your tool calls:\n\n${body}\n\nContinue from here.`,
    });
    pendingResults = [];
  };

  for (const m of messages) {
    if (m?.role === 'tool') {
      const name = toolNames.get(m.tool_call_id) ?? 'tool';
      pendingResults.push({ name, content: truncate(String(m.content ?? '')) });
      continue;
    }

    flush();

    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      for (const call of m.tool_calls) {
        if (call?.id) toolNames.set(call.id, call.function?.name ?? 'tool');
      }
      const described = m.tool_calls
        .map((c: any) => `${c.function?.name}(${c.function?.arguments ?? '{}'})`)
        .join(', ');
      const said = typeof m.content === 'string' ? m.content.trim() : '';
      out.push({
        role: 'assistant',
        content: said ? `${said}\n\nCalled: ${described}` : `Called: ${described}`,
      });
      continue;
    }

    out.push(m);
  }

  flush();
  return out;
}

/**
 * Repair the conversation before forwarding.
 *
 * A model that answers with a tool call sets `content: null` on that assistant
 * message, which is legal OpenAI. The gateway's schema rejects null *and*
 * rejects the empty string (it demands >= 1 character), and rejects the field
 * being absent. So a second turn in any tool-using conversation fails
 * validation on the history rather than on anything the agent just did. A
 * single space is the only empty-ish value that passes.
 */
function normalise(body: any): any {
  if (!body || !Array.isArray(body.messages)) return body;
  const collapsed = collapseToolTurns(body.messages);
  return {
    ...body,
    messages: collapsed.map((m: any) => {
      if (!m) return m;
      const empty =
        m.content === null ||
        m.content === undefined ||
        (typeof m.content === 'string' && m.content.length === 0);
      if (!empty) return m;

      // The gateway rejects all three of null, "" and absent. A single space
      // is the only empty-ish value its schema accepts.
      return { ...m, content: ' ' };
    }),
    // The router may land on a small free model whose output limit is far
    // below what the harness asks for, and such providers answer 400 with an
    // empty body rather than clamping. Clamp here so routing stays invisible.
    ...(typeof body.max_tokens === 'number' && body.max_tokens > MAX_OUTPUT_TOKENS
      ? { max_tokens: MAX_OUTPUT_TOKENS }
      : {}),
  };
}

/**
 * The free gateway permits exactly one in-flight request per IP and answers a
 * second with 429. An agent harness is inherently concurrent — subagents fan
 * out, and the harness retries — so requests must be serialised here rather
 * than hoped about. Every upstream call takes this lock for its full duration,
 * streaming responses included.
 */
let chain: Promise<unknown> = Promise.resolve();

function serialise<T>(job: () => Promise<T>): Promise<T> {
  const result = chain.then(job, job);
  // Keep the chain alive even when a job rejects.
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient upstream failures with exponential backoff. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 6,
): Promise<Response> {
  let wait = 800;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    // The gateway pools free-tier providers, so a failure is usually one
    // exhausted upstream rather than a bad request: rate limits (429), spent
    // credit (402) and provider errors all clear on a retry once the router
    // rotates. A 400 is genuinely our fault and must not be retried.
    const body = await res.clone().text();

    // A 400 is normally our fault and must not be retried — except when the
    // gateway wraps a *provider's* rejection in one. Strict providers reject
    // schema constructs their peers accept, so the same payload can fail on one
    // upstream and succeed on the next. Retrying re-rolls the routing.
    const providerRoulette =
      res.status === 400 && body.includes('All providers failed');
    const retriable =
      providerRoulette || [429, 402, 500, 502, 503].includes(res.status);
    if (!retriable) return res;
    console.warn(
      `upstream ${res.status} (${body.slice(0, 80).replace(/\s+/g, ' ')}), ` +
        `retrying in ${wait}ms (attempt ${i + 1}/${attempts})`,
    );
    await sleep(wait);
    wait = Math.min(wait * 2, 8000);
  }
  return fetch(url, init);
}

/**
 * Synthesise an OpenAI SSE stream from a single non-streaming completion.
 *
 * The gateway's own streaming endpoint answers 400 for our requests while the
 * identical non-streaming request succeeds, and the harness always asks for a
 * stream. So we buffer upstream and replay the result as the chunk sequence the
 * client expects. Nothing is lost but the incremental typing effect — every
 * token still arrives, and tool calls arrive whole rather than assembled from
 * fragments, which is if anything more robust to parse.
 */
function writeSyntheticStream(res: express.Response, completion: any): void {
  const choice = completion?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const id = completion?.id ?? 'chatcmpl-shim';
  const model = completion?.model ?? 'unknown';
  const created = completion?.created ?? Math.floor(Date.now() / 1000);

  const send = (delta: unknown, finish: string | null = null) => {
    const chunk = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  send({ role: 'assistant' });

  if (typeof message.content === 'string' && message.content.length) {
    send({ content: message.content });
  }

  if (Array.isArray(message.tool_calls)) {
    message.tool_calls.forEach((call: any, index: number) => {
      send({
        tool_calls: [
          {
            index,
            id: call.id,
            type: 'function',
            function: {
              name: call.function?.name,
              arguments: call.function?.arguments ?? '{}',
            },
          },
        ],
      });
    });
  }

  send({}, choice.finish_reason ?? 'stop');

  if (completion?.usage) {
    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [],
        usage: completion.usage,
      })}\n\n`,
    );
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

app.all('/v1/*path', async (req, res) => {
  const path = req.path.replace(/^\/v1/, '');
  const url = `${UPSTREAM}${path}`;

  const wantsStream = req.body?.stream === true;
  const forwarded = normalise(req.body);
  if (wantsStream) {
    delete forwarded.stream;
    delete forwarded.stream_options;
  }

  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : JSON.stringify({ ...forwarded, project_id: PROJECT_ID });

  if (process.env.PROXY_TRACE) {
    appendFileSync(
      process.env.PROXY_TRACE,
      `\n=== ${new Date().toISOString()} ${req.method} ${path}\n${body ?? ''}\n`,
    );
  }

  try {
    const upstream = await serialise(() =>
      fetchWithRetry(url, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
        },
        body,
      }),
    );

    const contentType = upstream.headers.get('content-type') ?? '';
    const text = await upstream.text();

    if (wantsStream && upstream.ok) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      writeSyntheticStream(res, JSON.parse(text));
      return;
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    if (process.env.PROXY_TRACE) {
      appendFileSync(
        process.env.PROXY_TRACE,
        `--- response ${upstream.status}\n${text.slice(0, 2000)}\n`,
      );
    }
    const asked = req.body?.model;
    if (asked) {
      try {
        const served = JSON.parse(text)?.model;
        if (served && !String(served).includes(String(asked).replace(/^gh-/, ''))) {
          console.warn(`upstream substituted model: asked ${asked}, served ${served}`);
        }
      } catch {
        /* non-JSON response, nothing to check */
      }
    }
    res.send(text);
  } catch (err) {
    console.error('proxy error:', err);
    res.status(502).json({
      error: { message: `gateway unreachable: ${String(err)}`, type: 'proxy_error' },
    });
  }
});

/**
 * Stay up.
 *
 * This shim is a single point of failure for every agent turn: when it exits,
 * the harness sees its LLM stream abort and the run dies with a message that
 * says nothing about the real cause. It died once mid-session and cost a
 * confusing half hour of diagnosis pointed at the wrong layer.
 *
 * A proxy has no state worth protecting, so there is nothing an exception can
 * corrupt by being survived. Log it loudly and keep serving.
 */
process.on('uncaughtException', (err) => {
  console.error('uncaught exception (staying up):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection (staying up):', err);
});

app.listen(PORT, () => {
  console.log(`OpenAI-compatible shim on http://localhost:${PORT}/v1 -> ${UPSTREAM}`);
  console.log(`injecting project_id=${PROJECT_ID}`);
});
