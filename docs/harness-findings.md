# What we learned about TrueForge

Findings from building on TrueForge v0.1.4 during the Agent Harness Hackathon.
Everything here was verified against a running server, not inferred from docs —
several of these contradict the documentation, so each entry says how it was
checked.

## The docs are stale in at least five places

The published docs and the shipped code disagree often enough that the working
rule became: grep the source, then believe it. The full TypeScript of both
`@truefoundry/trueforge-sdk` and the core package is recoverable from the npm
source maps, which made this practical.

## A localhost MCP server works fine

The shipped catalog lists only `type: remote` entries on public HTTPS URLs, which
reads like a constraint. It isn't. `http://localhost:3001/mcp` registers and the
harness drives it end to end — no TLS requirement, no reachability check, no
allow-list. Transport is streamable HTTP; plain JSON responses are accepted and
SSE is optional (our server returns 405 on `GET /mcp` and nothing breaks).

There is no stdio transport, so an MCP server for TrueForge must speak HTTP.

## Approval gating silently does nothing on unannotated tools

This is the one that would have cost us the demo.

TrueForge resolves the `@write` / `@destructive` selectors from MCP tool
annotations. The check requires `readOnlyHint === false` to be **explicitly
present**. A tool with no `annotations` block is not treated as a write — it
executes with no approval prompt and **no error**. The gate appears configured
and does nothing.

Worse, the two selectors are mutually exclusive:

```ts
isWrite       = readOnlyHint === false && destructiveHint !== true
isDestructive = destructiveHint === true
```

So a tool marked `destructiveHint: true` is **not** matched by `@write`. On a
server whose mutating tools are all destructive, a gate of `['@write']` matches
nothing at all.

Two mitigations, both worth copying: gate on **literal tool names** so the
policy never depends on annotation interpretation, and run a startup assertion
that reads the live `tools/list` and fails if any tool is missing the fields the
gate depends on.

## Agent manifests re-resolve on every turn

Documented in passing, and load-bearing for us: a session bound to an agent
**by name** re-reads that agent's spec from the database on every turn,
uncached. So rewriting `requireApprovalForTools` via `agents.update` mid-session
changes the gate for the *next* turn in an existing conversation. Autonomy
becomes a runtime property rather than a deploy-time one.

The footgun: this only holds for reference bindings,
`sessions.create({ agent: { name } })`. Create the session with an inline spec
and the manifest is snapshotted for the session's life — the rewrite still
succeeds, and silently affects nothing.

Also note `requireApprovalForTools` lives on the **per-MCP-server entry** inside
`manifest.mcpServers[]`, not at the top level of the agent manifest.

## You do not need a Daytona key

The docs state Daytona is the only sandbox provider. In standalone mode that is
false — there is an undocumented local sandbox, and `GET /api/v1/capabilities`
reports `sandbox: { enabled: true }` with zero providers configured.

## You do not need a real model key to build

Agent creation hard-fails without a model provider, but a `custom` provider
accepts any `base_url` with no network validation. A local OpenAI-compatible
stub is enough to exercise agent creation, connector registration, tool
discovery, session binding, the approval pause and the clearance round-trip —
at zero cost. Only actual reasoning needs a real key.

## The `schedules` API does not exist

Documented, with a full API reference. Not present in v0.1.4 — zero endpoints,
zero references in source. Anything needing recurring execution has to drive
turns from an external loop.

## Generative UI has more in it than the prompt admits

The server exposes its own OpenUI instructions through a
`get_openui_instructions` tool — an 18.7k-character DSL spec, streamed in
` ```openui ` fences and re-parsed on every chunk, so dashboards render
progressively as they arrive.

The shipped frontend registers **59 components** while the prompt documents
about 35. The notable omission is `Query("tool", {args}, {defaults}, interval)`,
which lets a rendered dashboard poll MCP tools and re-render on a timer. It
works, but the model has never seen the syntax, so using it means pasting the
grammar into the agent's instructions yourself.

## Tool calls arrive wrapped, and the wrapper hides the name

With deferred tool loading the agent does not call `simulate_patch` directly —
it calls the harness's `call_tool` with `{mcp_server, tool_name, input}`, and
the response nests under `content[0].text`. Anything watching the stream for a
tool by name sees eight calls and none of them the one it wanted. Unwrap both
directions before matching.

## "Is this tool gated?" is a question with a time-varying answer

Because the manifest is re-resolved every turn, clearance can change *during* a
session. We spent real time chasing a phantom: a run made two `apply_patch`
calls and the harness emitted no approval event, while reading the manifest
afterwards showed the tool gated. Both observations were true. A supervisor
process had granted clearance before the run and revoked it after, on evidence
of a regression.

Nothing was broken, but the debugging lesson is real: with runtime-mutable
permissions, reading the current policy tells you nothing about the policy a
past turn executed under. Log the gate as it was at the time, or you will
diagnose the wrong thing.

## Prompt budget is a real constraint, and preload is where it goes

With seven MCP tools whose descriptions are written for a model to read, plus a
skill, plus the harness's own guidance for sandbox, subagents and generative
UI, a single first turn reached 12,132 tokens. On a gateway capped at 8,000
tokens per minute that is not a slow agent, it is an agent that cannot be shown
the game it is designing — every request returns 413.

`preload: false` with `preloadTools` naming the two tools needed on the first
turn brought it to about 5,700, keeping the common path free of an extra round
trip. Worth measuring before assuming a small model is the problem: our own
prompt fragment was 40% of the system prompt, and the harness contributes
roughly 8k characters before you write anything.

## A vanished temp directory takes the harness down with a 500

After several hours of running, every turn began failing with a bare
`500 Internal server error`. The harness log carried the real cause:

```
Unhandled error {"error":"codeModeSocketParentPath must be an existing directory"}
```

Code mode holds a socket in a temp directory, and if that directory is removed
while the server is running — by a cleanup script, by the OS reaping `/tmp`, or
by someone tidying — the harness does not recreate it and does not degrade. It
returns 500 for every turn, including turns that never touch code mode, and the
error surfaced to the SDK says nothing about directories.

Restarting the server fixes it and loses nothing: agents, connectors, skills
and settings all live in SQLite and came back intact.

Worth knowing because the symptom points nowhere near the cause. We spent the
first minutes of it suspecting the model gateway, which was fine.
