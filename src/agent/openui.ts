/**
 * Generative UI for the HEADCOUNT designer.
 *
 * TrueForge ships a generative-UI DSL called OpenUI: the model emits a fenced
 * ```openui block, and the chat renders it as real components. The block is
 * RE-PARSED ON EVERY STREAMED CHUNK, so a dashboard assembles itself top-down
 * while the model is still writing it.
 *
 * The harness already puts a generic OpenUI spec in the system prompt whenever
 * `config.generativeUi.enabled` is true (see `core/capabilities/builtins/
 * OpenUI.ts`, `buildOpenUIInstruction`). That spec teaches syntax. It does not
 * teach *this* agent when a chart is the honest answer and when it is
 * decoration, and it documents a component surface that does not match what the
 * shipped renderer actually accepts. This file supplies both.
 *
 * Everything asserted below was read out of the shipped frontend bundle
 * (`dist/_frontend/assets/index-*.js`) — the component registry, the chat
 * library's roster, and the query engine — not out of the prompt. Where the two
 * disagree, the bundle wins, because the bundle is what renders.
 *
 * See docs/generative-ui.md for the evidence and the reasoning.
 */

/* ------------------------------------------------------------------ facts */

/**
 * The components the CHAT library actually registers.
 *
 * The bundle defines two OpenUI libraries. The one wired into the chat message
 * renderer is built as `{ root: "Stack", components: [...54 defs] }`; a second
 * library (rooted at a different `Card`, and carrying `SectionBlock`,
 * `ListBlock`, `FollowUpBlock`) is defined but never mounted in this build.
 * Emitting a name from that second library renders nothing, so it is not listed
 * here. This roster is the whole of what is safe to emit.
 */
export const CHAT_LIBRARY_COMPONENTS = [
  // Layout
  'Stack', 'Card', 'CardHeader', 'Tabs', 'TabItem', 'Accordion', 'AccordionItem',
  'Steps', 'StepsItem', 'Carousel', 'Separator', 'Modal',
  // Content
  'TextContent', 'MarkDownRenderer', 'Callout', 'TextCallout', 'CodeBlock',
  'Image', 'ImageBlock', 'ImageGallery',
  // Tables
  'Table', 'Col',
  // Charts
  'LineChart', 'AreaChart', 'BarChart', 'HorizontalBarChart', 'RadarChart', 'Series',
  'PieChart', 'RadialChart', 'SingleStackedBarChart', 'Slice',
  'ScatterChart', 'ScatterSeries', 'Point',
  // Data display
  'Tag', 'TagBlock',
  // Forms
  'Form', 'FormControl', 'Label', 'Input', 'TextArea', 'Select', 'SelectItem',
  'DatePicker', 'Slider', 'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup',
  'RadioItem', 'SwitchGroup', 'SwitchItem', 'Button', 'Buttons',
] as const;

export type ChatLibraryComponent = (typeof CHAT_LIBRARY_COMPONENTS)[number];

/**
 * `Query` and `Mutation` are real statement types in the openui-lang grammar —
 * the parser recognises them and the runtime has a full fetch/cache/refresh
 * engine behind them, including a `refreshInterval` timer.
 *
 * They are nevertheless INERT in the TrueForge chat, and this is the single
 * most expensive thing to get wrong. The renderer takes an optional
 * `toolProvider` prop; the query engine is constructed as `l3e(toolProvider ??
 * null)` and its fetch routine opens with `if (!provider) return;`. The chat's
 * one and only mount site is
 *
 *     jsx(OpenUiRenderer, { response, library, isStreaming })
 *
 * — no `toolProvider`, no `queryLoader`. So a `Query(...)` statement parses
 * fine, registers fine, starts its refresh timer fine, and never calls
 * anything. It renders its third argument (the defaults) forever, silently, with
 * no error surfaced to the user.
 *
 * A dashboard that appears to be live but is showing hardcoded placeholders is
 * strictly worse than one that is honestly a snapshot, so the agent is told to
 * bake real values in and to never emit these two names.
 */
export const OPENUI_LIVE_QUERY_SUPPORTED = false;

/* ------------------------------------------------------- prompt fragment */

/**
 * Splice this into the agent's system instructions.
 *
 * In `src/agent/manifest.ts`, append it to the end of `INSTRUCTIONS` — after the
 * "Design taste for this game" list and the subagents paragraph, so the
 * rendering rules read as a presentation layer over a job that is already
 * defined rather than as part of the job:
 *
 *     import { OPENUI_DASHBOARD_INSTRUCTIONS } from './openui.js';
 *
 *     export const INSTRUCTIONS = `...existing text...
 *
 *     ${OPENUI_DASHBOARD_INSTRUCTIONS}`;
 *
 * It requires `config.generativeUi.enabled` (already set in
 * `buildAgentManifest`), because that is what puts the base OpenUI syntax spec
 * in the prompt. This fragment layers policy and corrections on top of it; it is
 * not a replacement for it.
 */
export const OPENUI_DASHBOARD_INSTRUCTIONS = `Showing your work: generative UI

You can render real charts and tables into this conversation by emitting a fenced
\`\`\`openui block. The block re-parses on every streamed chunk, so write
\`root = Stack([...])\` as the very first line and the dashboard assembles itself
while you are still typing. Use it — a telemetry curve is the argument, and a
paragraph describing a telemetry curve is a worse copy of it.

WHEN TO RENDER A BLOCK. Exactly three moments in this job earn one:

  1. DIAGNOSIS. After get_state + get_telemetry, before you propose anything.
     Stat tiles for the floor right now, and a line chart of throughput and
     blockedFraction over the telemetry window. The wall is a shape; draw it.
  2. EVIDENCE. After every simulate_patch. A baseline-vs-patched table with a
     delta column, and a grouped bar chart of the scores side by side. This is
     the block that matters most — it is the human's view of the measurement
     rather than of your account of the measurement.
  3. PLAYTEST FAN-OUT. When subagents return scores for competing policies, one
     table with a row per archetype.

WHEN NOT TO. Anything else. A one-number answer, a yes/no, a clarifying
question, the rationale attached to apply_patch — those are markdown. Over-charting
is worse than not charting: it buries the two blocks that carry the argument.
One block per message. Never two.

RULES THE RENDERER ACTUALLY ENFORCES:

  * NEVER write Query(...) or Mutation(...). The parser accepts them and the chat
    renderer has no tool provider wired in, so they fetch nothing and display
    their default argument forever, with no error. There is no live-polling
    dashboard on this surface. Copy the real numbers out of the tool response you
    just received and write them into the block as literal arrays.
  * Round before you write. Telemetry carries fifteen decimal places; render
    throughput and rates to 2 dp, cash and counts to 0 dp.
  * Positional arguments only. Stack([kids], "row", "l") — never direction: "row".
  * Every name you define must be reachable from root, or it is silently dropped.
  * Tables paginate at 10 rows. Keep comparison tables to the rows that matter.
  * Do not repeat numbers in prose that are already in the block. Outside the
    block, write only what the chart cannot say: the diagnosis, the trade-off you
    accepted, what you want the human to decide.

THE COMPONENTS THAT EXIST. Use these and nothing else — an unregistered name
renders as empty space:

  Stack(children[], direction?, gap?, align?, justify?, wrap?)
  Card(children[], variant?, direction?, gap?, align?, justify?, wrap?)   variant: "card" | "sunk" | "clear"
  CardHeader(title?, subtitle?)
  TextContent(text, size?)                 size: "small" | "default" | "large" | "small-heavy" | "large-heavy"
  LineChart(labels[], [Series(...)], variant?, xLabel?, yLabel?)          variant: "linear" | "natural" | "step"
  AreaChart(labels[], [Series(...)], variant?, xLabel?, yLabel?)
  BarChart(labels[], [Series(...)], variant?, xLabel?, yLabel?)           variant: "grouped" | "stacked"
  Series(category, values[])
  Table([Col(...)])                        column-oriented, one data array per column
  Col(label, data[], type?)                type: "string" | "number" | "action"
  Tag(text, icon?, size?, variant?)         variant: "neutral" | "info" | "success" | "warning" | "danger"
  Callout(variant, title, description)      variant: "info" | "warning" | "error" | "success" | "neutral"
  Separator()
  Tabs([TabItem(value, trigger, content[])])

  Watch the two callouts: Callout takes "error", TextCallout takes "danger". They
  are not the same enum.

TEMPLATE — DIAGNOSIS (fill from get_state.derived and get_telemetry.telemetry):

\`\`\`openui
root = Stack([tiles, curve])
tiles = Stack([tThr, tBlocked, tAtt, tHead], "row", "m", "stretch", "start", true)
tThr = Card([TextContent("Throughput", "small"), TextContent("1.53 /s", "large-heavy")])
tBlocked = Card([TextContent("Blocked", "small"), TextContent("93%", "large-heavy")])
tAtt = Card([TextContent("Attention used", "small"), TextContent("100%", "large-heavy")])
tHead = Card([TextContent("Headcount", "small"), TextContent("23", "large-heavy")])
curve = Card([curveHead, curveChart])
curveHead = CardHeader("The wall", "Throughput against the fraction of the floor waiting on you")
curveChart = LineChart(ts, [sThr, sBlocked], "natural", "in-game seconds", "")
ts = ["709", "739", "769", "799", "829"]
sThr = Series("Throughput /s", [3.35, 3.65, 2.9, 1.98, 1.53])
sBlocked = Series("Blocked fraction", [0.85, 0.84, 0.88, 0.92, 0.93])
\`\`\`

TEMPLATE — EVIDENCE (fill from the simulate_patch response: baseline, patched,
delta, verdict):

\`\`\`openui
root = Stack([verdict, cmp, bars])
verdict = Callout("success", "Shape holds", "The run grows, meets the wall, and stays playable past it.")
cmp = Card([cmpHead, cmpTable])
cmpHead = CardHeader("Baseline vs patched", "greedy policy, 300s")
cmpTable = Table([cMetric, cBase, cPatch, cDelta])
cMetric = Col("Metric", ["Peak throughput", "Final throughput", "Time to wall", "Attention utilisation", "Lifetime cash"])
cBase = Col("Baseline", [4.56, 1.67, 92.0, 1.41, 2163], "number")
cPatch = Col("Patched", [4.67, 3.16, 118.0, 1.08, 3402], "number")
cDelta = Col("Delta", ["+0.11", "+1.49", "+26.0s", "-0.33", "+1239"])
bars = Card([barsHead, barsChart])
barsHead = CardHeader("Where the change lands", "")
barsChart = BarChart(bLabels, [bBase, bPatch], "grouped", "", "tasks/sec")
bLabels = ["Peak", "Final"]
bBase = Series("Baseline", [4.56, 1.67])
bPatch = Series("Patched", [4.67, 3.16])
\`\`\`

Use "success" for a verdict that holds, "warning" when something got worse, and
"error" for degenerate or stalled — and when it is degenerate or stalled, say so
in the callout and discard the design rather than arguing with it.`;

/* ---------------------------------------------------------------- helpers */

const OPENUI_FENCE = /```openui\s*\n([\s\S]*?)(?:```|$)/g;

/** Pull every ```openui block out of a model message, in order. */
export function extractOpenUiBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  for (const match of markdown.matchAll(OPENUI_FENCE)) blocks.push(match[1]);
  return blocks;
}

export interface OpenUiProblem {
  code: 'no-root' | 'root-not-first' | 'unknown-component' | 'undefined-reference' | 'unreachable' | 'inert-query';
  detail: string;
}

const IDENT = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*=/;
const CALL = /\b([A-Z][A-Za-z0-9]*)\s*\(/g;
const REF = /\b([a-z_$][A-Za-z0-9_$]*)\b/g;

/**
 * Check a block against what the renderer will accept.
 *
 * This is a lint, not a parser: it catches the failures that are SILENT at
 * runtime — an unregistered component name, a variable nothing references, a
 * reference to a name that was never defined, and a `Query`/`Mutation` that will
 * never fetch. All four render as blank space with no error in the UI, which is
 * exactly why they are worth catching here instead.
 */
export function lintOpenUiBlock(block: string): OpenUiProblem[] {
  const problems: OpenUiProblem[] = [];
  const known = new Set<string>(CHAT_LIBRARY_COMPONENTS);

  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));

  const defined: string[] = [];
  for (const line of lines) {
    const m = IDENT.exec(line);
    if (m) defined.push(m[1]);
  }

  if (!defined.includes('root')) {
    problems.push({ code: 'no-root', detail: 'no `root = ...` statement; nothing will render' });
  } else if (defined[0] !== 'root') {
    problems.push({ code: 'root-not-first', detail: `first statement is \`${defined[0]}\`, not \`root\` — the shell will not stream in first` });
  }

  for (const line of lines) {
    for (const m of line.matchAll(CALL)) {
      const name = m[1];
      if (name === 'Query' || name === 'Mutation') {
        problems.push({
          code: 'inert-query',
          detail: `${name}() has no tool provider in the TrueForge chat — it renders its defaults forever and never fetches`,
        });
      } else if (!known.has(name) && !['Action', 'Series', 'Slice', 'Point'].includes(name)) {
        problems.push({ code: 'unknown-component', detail: `\`${name}\` is not registered in the chat library and will render as nothing` });
      }
    }
  }

  const definedSet = new Set(defined);
  const referenced = new Set<string>();
  for (const line of lines) {
    const eq = line.indexOf('=');
    const rhs = eq >= 0 ? line.slice(eq + 1) : line;
    // Strip string literals so words inside labels are not mistaken for refs.
    const bare = rhs.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const m of bare.matchAll(REF)) {
      const name = m[1];
      if (definedSet.has(name)) referenced.add(name);
      else if (/^[a-z]/.test(name) && !isKeyword(name)) {
        problems.push({ code: 'undefined-reference', detail: `\`${name}\` is referenced but never defined` });
      }
    }
  }

  for (const name of defined) {
    if (name !== 'root' && !referenced.has(name)) {
      problems.push({ code: 'unreachable', detail: `\`${name}\` is defined but never referenced — it is silently dropped` });
    }
  }

  return dedupe(problems);
}

function isKeyword(name: string): boolean {
  return ['true', 'false', 'null'].includes(name);
}

function dedupe(problems: OpenUiProblem[]): OpenUiProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = `${p.code}::${p.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
