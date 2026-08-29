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

OPENUI IS NOT A PROGRAMMING LANGUAGE. This is the mistake that ruins the block.
It is a flat list of \`name = value\` statements and nothing else. There are no
loops, no list comprehensions, no \`for\`, no \`if\`, no function calls, no
\`round()\`, no \`str()\`, no \`#\` comments, no variables carried over from the
tool response. \`telemetry\` does not exist inside the block. You cannot compute
anything in there.

So: read the tool response, pick 5 to 8 evenly spaced samples out of it YOURSELF,
round them YOURSELF, and type the resulting numbers out as literal arrays:

    ts = ["709", "739", "769", "799", "829"]
    sThr = [3.35, 3.65, 2.9, 1.98, 1.53]

If you catch yourself writing a bracket that contains the word \`for\`, stop and
type the numbers instead.

RULES THE RENDERER ACTUALLY ENFORCES:

  * NEVER write Query(...) or Mutation(...). The parser accepts them and the chat
    renderer has no tool provider wired in, so they fetch nothing and display
    their default argument forever, with no error. There is no live-polling
    dashboard on this surface. Copy the real numbers out of the tool response you
    just received and write them into the block as literal arrays.
  * A statement ends at the first newline that is NOT inside brackets. Wrapping a
    long component call across several lines is fine — the newlines are inside
    its parentheses. Starting a new \`name = ...\` mid-expression is not.
  * Define each name exactly once. A second \`name = ...\` is a bug.
  * Every array in the same chart must have the same length: the labels array and
    each Series values array. Count them before you finish.
  * Round before you write. Telemetry carries fifteen decimal places; render
    throughput and rates to 2 dp, cash and counts to 0 dp. Write fractions as
    fractions (0.93), not as percentages, when they share an axis with a rate.
  * Positional arguments only. Arguments are bare values in the documented
    order. NEVER put a name in front of one — not \`labels=[...]\`, not
    \`direction: "row"\`. Write \`LineChart(ts, [sThr], "natural", "seconds", "")\`.
  * Inside the fence there is nothing but \`name = value\` statements. No prose,
    no "Diagnosis:", no headings. Your two sentences of diagnosis go AFTER the
    closing fence.
  * Every name you define must be reachable from root, or it is silently dropped.
  * Tables paginate at 10 rows. Keep comparison tables to the rows that matter.
  * Do not repeat numbers in prose that are already in the block. Outside the
    block, write only what the chart cannot say: the diagnosis, the trade-off you
    accepted, what you want the human to decide. Prose and block must agree — do
    not cite a blocked fraction in the text that is not the one you plotted.

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
in the callout and discard the design rather than arguing with it.

BEFORE YOU CLOSE THE FENCE, re-read your block and check all six:
  1. \`root = Stack([...])\` is the first line.
  2. Every line inside the fence is \`name = value\`. Nothing else is in there.
  3. No argument has a name in front of it. No \`=\` or \`:\` inside any \`(\`.
  4. Every name used is defined, every name defined is used, each defined once.
  5. Every array is literal digits and strings you typed — no \`for\`, no \`round\`.
  6. The labels array and every Series values array have the same length.`;

/* ---------------------------------------------------------------- helpers */

const OPENUI_FENCE = /```openui\s*\n([\s\S]*?)(?:```|$)/g;

/** Pull every ```openui block out of a model message, in order. */
export function extractOpenUiBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  for (const match of markdown.matchAll(OPENUI_FENCE)) blocks.push(match[1]);
  return blocks;
}

export interface OpenUiProblem {
  code:
    | 'no-root'
    | 'root-not-first'
    | 'unknown-component'
    | 'undefined-reference'
    | 'unreachable'
    | 'inert-query'
    | 'redefined'
    | 'ragged-series'
    | 'stray-line';
  detail: string;
}

const STATEMENT = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*=([\s\S]*)$/;
const CALL = /\b([A-Z][A-Za-z0-9]*)\s*\(/g;
const REF = /\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;

/** Names that are language builtins rather than registered components. */
const NON_COMPONENT_CALLABLES = new Set(['Action']);

/**
 * Split a block into logical statements the way the renderer does.
 *
 * The shipped splitter is token-based, not line-based: it walks tokens tracking
 * bracket depth, and a newline only terminates a statement when depth is zero
 * (a newline inside brackets is skipped outright). So a component call may wrap
 * across as many physical lines as it likes. Reproducing that here matters —
 * a naive line-based lint reports a wrapped call as a dozen phantom errors.
 */
function splitStatements(block: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let current = '';

  for (const ch of block) {
    if (quote) {
      current += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);

    if (ch === '\n' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Check a block against what the renderer will accept.
 *
 * This is a lint, not a parser: it catches the failures that are SILENT at
 * runtime — an unregistered component name, a variable nothing references, a
 * reference to a name that was never defined, and a `Query`/`Mutation` that will
 * never fetch. All of those render as blank space with no error in the UI, which
 * is exactly why they are worth catching here instead.
 */
export function lintOpenUiBlock(block: string): OpenUiProblem[] {
  const problems: OpenUiProblem[] = [];
  const known = new Set<string>(CHAT_LIBRARY_COMPONENTS);

  const statements = splitStatements(block);
  const defined = new Map<string, string>();
  const order: string[] = [];

  for (const statement of statements) {
    const m = STATEMENT.exec(statement);
    if (!m) {
      // The parser skips to end-of-line when a statement does not start with
      // `identifier =`. Harmless, but it is always a mistake worth reporting —
      // usually a stray comment or a sentence of prose left inside the fence.
      problems.push({
        code: 'stray-line',
        detail: `\`${statement.split('\n')[0].slice(0, 60)}\` is not a \`name = value\` statement; the parser skips it`,
      });
      continue;
    }
    const [, name, rhs] = m;
    if (defined.has(name)) {
      problems.push({ code: 'redefined', detail: `\`${name}\` is defined more than once` });
    } else {
      order.push(name);
    }
    defined.set(name, rhs);
  }

  if (!defined.has('root')) {
    problems.push({ code: 'no-root', detail: 'no `root = ...` statement; nothing will render' });
  } else if (order[0] !== 'root') {
    problems.push({
      code: 'root-not-first',
      detail: `first statement is \`${order[0]}\`, not \`root\` — the shell will not stream in first`,
    });
  }

  const referenced = new Set<string>();
  for (const [, rhs] of defined) {
    for (const m of rhs.matchAll(CALL)) {
      const name = m[1];
      if (name === 'Query' || name === 'Mutation') {
        problems.push({
          code: 'inert-query',
          detail: `${name}() has no tool provider in the TrueForge chat — it renders its defaults forever and never fetches`,
        });
      } else if (!known.has(name) && !NON_COMPONENT_CALLABLES.has(name)) {
        problems.push({
          code: 'unknown-component',
          detail: `\`${name}\` is not registered in the chat library and will render as nothing`,
        });
      }
    }

    // Strip string literals, object keys and component/builtin call heads, so
    // only bare identifier references remain.
    const bare = rhs
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/@?\b[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g, '(')
      .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\s*:/g, ':');

    for (const m of bare.matchAll(REF)) {
      const name = m[1];
      if (defined.has(name)) referenced.add(name);
      else if (!isKeyword(name)) {
        problems.push({ code: 'undefined-reference', detail: `\`${name}\` is referenced but never defined` });
      }
    }
  }

  for (const name of order) {
    if (name !== 'root' && !referenced.has(name)) {
      problems.push({ code: 'unreachable', detail: `\`${name}\` is defined but never referenced — it is silently dropped` });
    }
  }

  problems.push(...checkSeriesLengths(defined));
  return dedupe(problems);
}

/**
 * A chart whose labels array and series values arrays disagree in length is the
 * one malformed dashboard that still renders — it just renders wrong, silently
 * truncated. Worth catching.
 */
function checkSeriesLengths(defined: Map<string, string>): OpenUiProblem[] {
  const problems: OpenUiProblem[] = [];
  const arrayLength = (expr: string): number | null => {
    const trimmed = expr.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return 0;
    if (/[[\](){}]/.test(inner.replace(/"(?:[^"\\]|\\.)*"/g, '""'))) return null;
    return inner.split(',').filter((s) => s.trim().length > 0).length;
  };

  const lengthOf = (token: string): number | null => {
    const direct = arrayLength(token);
    if (direct !== null) return direct;
    const referenced = defined.get(token.trim());
    return referenced ? arrayLength(referenced) : null;
  };

  for (const [name, rhs] of defined) {
    const chart = /^\s*(LineChart|AreaChart|BarChart|HorizontalBarChart|RadarChart)\s*\(([\s\S]*)\)\s*$/.exec(rhs);
    if (!chart) continue;
    const labelsToken = chart[2].split(',')[0];
    const labels = lengthOf(labelsToken);
    if (labels === null) continue;

    for (const m of chart[2].matchAll(/Series\s*\(\s*("(?:[^"\\]|\\.)*"|[A-Za-z_$][A-Za-z0-9_$]*)\s*,([\s\S]*?)\)(?=\s*[,\])])/g)) {
      const values = lengthOf(m[2]);
      if (values !== null && values !== labels) {
        problems.push({
          code: 'ragged-series',
          detail: `${name}: ${labels} labels but series ${m[1]} has ${values} values`,
        });
      }
    }
  }
  return problems;
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
