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
