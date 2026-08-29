# Generative UI: the agent draws the wall

The HEADCOUNT designer argues from telemetry. Telemetry is a *shape* — throughput
climbing, then bending over as blocked fraction crosses a half — and a paragraph
describing a shape is a worse copy of the shape. So the agent streams charts and
tables into the TrueForge chat instead of describing them.

TrueForge calls this OpenUI. The model emits a fenced ` ```openui ` block; the
chat renders it as real components. The block **re-parses on every streamed
chunk**, so the dashboard assembles itself top-down while the model is still
writing — which is why `root = Stack([...])` must be the first line.

Everything below was read out of the shipped frontend bundle
(`@truefoundry/trueforge/dist/_frontend/assets/index-*.js`), not out of the
prompt. Where the two disagree, the bundle wins, because the bundle is what
renders.

---

## What is wired, and what only looks wired

| | Documented in prompt | Registered in chat library | Renders |
| --- | --- | --- | --- |
| `LineChart`, `Table`, `Card`, `Stack`, … | yes | yes | yes |
| `Form`, `Select`, `Button`, `Slider`, … | examples only | yes | yes |
| `SectionBlock`, `ListBlock`, `FollowUpBlock` | no | **no** | no |
| `Query(...)`, `Mutation(...)` | mentioned in passing | grammar only | **no** |

The bundle defines **two** OpenUI libraries. The chat mounts the one built as
`{ root: "Stack", components: [...54 defs] }`. A second library — rooted at a
different `Card`, carrying `SectionBlock`/`ListBlock`/`FollowUpBlock` — is
compiled in but never mounted in this build. Emitting a name from it renders
nothing at all, with no error. `src/agent/openui.ts` exports
`CHAT_LIBRARY_COMPONENTS`, the 54 that are actually safe.

The prompt the harness ships (`core/capabilities/builtins/OpenUI.ts`) documents
roughly 37 signatures. The gap is almost entirely form controls, which this agent
has no use for.

---

## The `Query` verdict: it does not work here

`Query` is the interesting one, and the answer is no.

It is a genuine statement type in the openui-lang grammar
(`{Query: "Query", Mutation: "Mutation"}`), the parser recognises it, and there
is a complete fetch/cache/dedupe/refresh engine behind it — including a
`refreshInterval` fourth argument that installs a real `setInterval`. Its
documented shape, recovered verbatim from a prompt-builder function inside the
bundle:

```
metrics = Query("tool_name", {arg1: value, arg2: $binding}, {defaultField: 0, defaultData: []}, refreshInterval?)
```

It is nevertheless **inert in the TrueForge chat**. The renderer takes an
optional `toolProvider` prop. The query engine is constructed as
`queryEngine(toolProvider ?? null)`, and its fetch routine opens with
`if (!provider) return;`. The chat's one and only mount site is:

```js
jsx(OpenUiRenderer, { response, library, isStreaming })
```

No `toolProvider`. No `queryLoader`. `toolProvider` appears four times in the
whole bundle and all four are inside the OpenUI library itself — nothing in the
application ever supplies one.

So a `Query(...)` statement parses fine, registers fine, starts its refresh timer
fine, and **never calls anything**. It renders its third argument — the defaults
— forever, silently, with no error surfaced to the user.

That failure mode is worse than not having the feature: a dashboard that appears
to be live while showing hardcoded placeholders is actively misleading, and this
project's whole thesis is that the human should see the measurement rather than
the agent's account of it. The corroborating detail is that the bundle's
"Data Workflow" prompt section — the one that *mandates* `Query()` and forbids
inlining tool results — is gated behind a `toolCalls` capability flag that
requires a tool provider. It belongs to a different product surface (an
"openui-lang" dashboard builder with `openui-lang` fences, edit mode and inline
mode) that is compiled into this bundle but not mounted.

**Conclusion:** no live-polling dashboard on this surface. The agent reads the
tool response and bakes literal values into the block. `OPENUI_LIVE_QUERY_SUPPORTED`
is exported as `false` so this decision is greppable, and `lintOpenUiBlock`
reports any `Query`/`Mutation` as an `inert-query` problem.

Should a future TrueForge build pass a `toolProvider`, the grammar above is
already correct and the change is a prompt edit, not a redesign.

---

## Verified grammar for the four things this agent needs

Argument order is positional and comes from the registry's zod schemas, not from
prose.

```
Stack(children[], direction?, gap?, align?, justify?, wrap?)
    direction "row"|"column"   gap "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl"
    align "start"|"center"|"end"|"stretch"|"baseline"
    justify "start"|"center"|"end"|"between"|"around"|"evenly"

Card(children[], variant?, direction?, gap?, align?, justify?, wrap?)
    variant "card"|"sunk"|"clear"   — accepts every Stack flex param after it

CardHeader(title?, subtitle?)
TextContent(text, size?)
    size "small"|"default"|"large"|"small-heavy"|"large-heavy"

LineChart(labels[], series[], variant?, xLabel?, yLabel?)   variant "linear"|"natural"|"step"
AreaChart(labels[], series[], variant?, xLabel?, yLabel?)   variant "linear"|"natural"|"step"
BarChart (labels[], series[], variant?, xLabel?, yLabel?)   variant "grouped"|"stacked"
Series(category, values[])

Table(columns[])                  — column-oriented, one data array per column
Col(label, data[], type?)         type "string"|"number"|"action"

Tag(text, icon?, size?, variant?) variant "neutral"|"info"|"success"|"warning"|"danger"
Callout(variant, title, description, visible?)
                                  variant "info"|"warning"|"error"|"success"|"neutral"
TextCallout(variant?, title?, description?)
                                  variant "neutral"|"info"|"warning"|"success"|"danger"
Separator(orientation?, decorative?)
Tabs(items[])  /  TabItem(value, trigger, content[])
```

Gotchas that cost real time:

- **`Callout` takes `"error"`; `TextCallout` takes `"danger"`.** Different enums,
  similar names, silent failure.
- **`Table` is column-oriented and paginates at 10 rows per page.** Keep
  comparison tables to the rows that carry the argument.
- **A statement ends at the first newline that is *not* inside brackets.** The
  splitter is token-based with depth tracking, so wrapping a long component call
  across several physical lines is legal. The prompt's "one statement per line"
  is a streaming preference, not a parser rule.
- **Any line that is not `name = value` is skipped silently** — the parser scans
  to end-of-line and moves on. Stray prose or a `#` comment inside the fence
  does not error, it just vanishes, taking any statement you meant to write on
  that line with it.
- **Unreferenced statements are garbage-collected.** Define it, reference it from
  root, or it does not exist.

---

## The prompt fragment

`src/agent/openui.ts` exports **`OPENUI_DASHBOARD_INSTRUCTIONS`**. Splice it onto
the end of `INSTRUCTIONS` in `src/agent/manifest.ts`, after the "Design taste"
list and the subagents paragraph, so rendering reads as a presentation layer over
a job that is already defined:

```ts
import { OPENUI_DASHBOARD_INSTRUCTIONS } from './openui.js';

export const INSTRUCTIONS = `…existing text…

${OPENUI_DASHBOARD_INSTRUCTIONS}`;
```

It requires `config.generativeUi.enabled`, which `buildAgentManifest` already
sets. That flag is what puts the base OpenUI syntax spec into the system prompt;
this fragment layers policy and corrections on top of it and does not replace it.

The policy it encodes is deliberately narrow — **three** moments earn a block:

1. **Diagnosis**, after `get_state` + `get_telemetry`: stat tiles plus a line
   chart of throughput against blocked fraction. The wall is a shape.
2. **Evidence**, after every `simulate_patch`: a baseline-vs-patched table with a
   delta column, plus a grouped bar chart. This is the human's view of the
   measurement rather than of the agent's account of it — the same principle the
   evidence-binding HMAC enforces server-side.
3. **Playtest fan-out**, when subagents return competing policy scores: one table,
   one row per archetype.

Everything else is markdown. One block per message, never two. Over-charting is
worse than not charting, because it buries the two blocks that carry the argument.

---

## Guarding the output

The failures that matter here are all *silent* — they render as blank space with
no error in the UI, so nothing tells you the dashboard is wrong. `openui.ts`
therefore also exports a checker:

```ts
extractOpenUiBlocks(markdown) → string[]
lintOpenUiBlock(block)        → OpenUiProblem[]
```

`lintOpenUiBlock` reproduces the renderer's bracket-depth statement splitter
rather than splitting on newlines (a naive line-based lint reports one wrapped
component call as a dozen phantom errors) and reports: `no-root`,
`root-not-first`, `unknown-component`, `undefined-reference`, `unreachable`,
`redefined`, `stray-line`, `ragged-series` (labels and series lengths disagree —
the one malformed chart that still renders, just wrong), and `inert-query`.

---

## What the model actually did

Proved end to end against the running harness: session created **by name**
(`{ agent: { name: 'headcount-designer' } }` — an inline spec would freeze the
manifest, see `src/agent/session.ts`), model `freeai/gh-gpt-4.1`, game MCP on
`:3001`, streamed events merged with `isEventDelta`/`mergeEventDelta`.

It took four runs, and the three failures are the reason the fragment reads the
way it does. This is a small model on a free gateway, and it reaches for its
training priors the moment an instruction is not explicit:

1. **It wrote Python.** Structure was perfect — `root` first, valid component
   names, correct positional args and enum values — and then the data arrived as
   list comprehensions: `[round(x[1], 2) for x in [...] if t >= 882.5]`, plus
   `str()`, `round()` and `#` comments. → the fragment now says OpenUI is not a
   programming language, there are no loops or function calls, `telemetry` does
   not exist inside the block, pick the samples yourself and type the digits.
2. **It used named arguments.** `LineChart(labels=[...], [...])`. → the fragment
   now forbids a name in front of any argument explicitly, `=` as well as `:`.
3. **It put the prose inside the fence.** A `Diagnosis:` paragraph as a bare line
   in the block, which the parser silently discards. → the fragment now says the
   fence contains `name = value` statements and nothing else.

With all three named, plus a six-point pre-close checklist, the fourth run came
back **clean — zero lint problems**:

```openui
root = Stack([tiles, curve])
tiles = Stack([tThr, tBlocked, tAtt, tHead], "row", "m", "stretch", "start", true)
tThr = Card([TextContent("Throughput", "small"), TextContent("31 /s", "large-heavy")])
tBlocked = Card([TextContent("Blocked", "small"), TextContent("0%", "large-heavy")])
tAtt = Card([TextContent("Attention used", "small"), TextContent("0.44 /s", "large-heavy")])
tHead = Card([TextContent("Headcount", "small"), TextContent("45", "large-heavy")])

curve = Card([curveHead, curveChart])
curveHead = CardHeader("Current state", "Throughput and escalation rate over the last 120 seconds")
curveChart = LineChart(
  ts,
  [sEscalation],
  "natural",
  "in-game seconds",
  ""
)
ts = ["1096.75", "1120.75", "1150.75", "1180.75", "1216.75"]
sEscalation = Series("Escalation rate (/s)", [0.50, 0.48, 0.42, 0.43, 0.43])
```

Real numbers, read from the live game seconds earlier. Note the wrapped
`LineChart` call — legal, because those newlines are inside its parentheses.

The honest caveat: run-to-run variance on this model is high, and it does not
always fill four stat tiles with four *distinct* metrics (it labelled attention
utilisation with a rate here). The fragment gets the syntax right reliably; the
editorial judgement is only as good as the model. On a stronger model the same
fragment is the ceiling, not the floor.
