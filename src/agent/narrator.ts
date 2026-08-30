/**
 * The demo's caption copy, written by an agent inside the harness.
 *
 * The video says an agent wrote it, so an agent writes it — the claim is
 * cheap and the artefact is not. This provisions a narrator on the same
 * TrueForge instance the designer runs on, hands it the real evidence
 * (measured runs, verbatim refusals, the ledger), and asks for the cards.
 *
 * It is given the facts and no licence to invent any. Its output is checked
 * against the numbers before it can be used: a caption citing a figure that
 * appears nowhere in the evidence is rejected, which is the same rule the rest
 * of this project runs on, pointed at the copywriter.
 *
 *   npx tsx src/agent/narrator.ts            # write docs/narration.json
 *   npx tsx src/agent/narrator.ts --print    # …and show it
 */

import { writeFileSync } from 'node:fs';
import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';

import { createClient, explain } from './client.js';
import { DEFAULT_MODEL_FQN } from './manifest.js';

const NARRATOR = 'headcount-narrator';

/**
 * Everything the narrator is allowed to know, and the only source of numbers
 * it may use. Each line is copied from a run recorded in this repository.
 */
const EVIDENCE = `
THE GAME
- Workers complete tasks but raise questions. The player answers at a FIXED
  rate of 1.00 questions/second. That number never changes.
- Throughput settles at: answer rate / confusion. Headcount is not in that
  equation, so hiring cannot raise the ceiling.
- Measured 900s runs: hire-only peaks 4.56 tasks/s and DECLINES to 1.67, with
  23 hired and 21 standing idle. Building management structure holds 29.0 with
  32 hired and 0 idle.

WHAT THE AGENT DOES
- Reads the live game over MCP, diagnoses the wall, designs a mechanic, proves
  it in a deterministic simulator, and must have a human approve it.
- It has designed: a tier-2 Quality Inspector, a tier-3 Production Manager, a
  queue-based soft cap, a Tool Crib requiring supervision, and a prestige reset
  layer with exponent 0.33.

WHAT WENT WRONG, VERBATIM
- It once invented an evidence token: "simulate_patch:2025-06-25T15:07:00Z:b8c4d1e".
  It never ran the simulation. A human approved it. The server refused it,
  because a token nobody minted has no signature.
- It declared "reduces escalateFraction to 0.1" while the patch set 0.5, plus
  three further undeclared edits. Refused.
- It proposed a supervisor with answerRate 0 — one that cannot answer a single
  question — with a confident rationale. Refused.

EARNED AUTONOMY
- A supervisor process watches the floor before and after every change.
- Three clean changes granted unattended apply_patch.
- Then a change passed simulation, passed evidence binding, and applied with NO
  human involved. Throughput fell 4.59 -> 1.56 tasks/s. Clearance was revoked
  automatically. Simulation was not sufficient.
`;

const BRIEF = `You are writing the caption cards for a three-minute demo video about
HEADCOUNT. The audience is hackathon judges who have thirty seconds of patience
before they decide whether to keep watching.

Write EXACTLY 6 cards. Each card is 2 or 3 short lines. A line is at most 9
words. No card is a sentence spread over three lines — each line should land on
its own.

Cover, in this order:
1. the premise (the player's attention is fixed, everything else grows)
2. the wall (hiring cannot raise the ceiling; it lowers it)
3. the agent designs mechanics and must prove them
4. evidence is bound, not requested — the fabricated token
5. autonomy is earned and revoked automatically
6. a closing line worth remembering

Rules that matter more than style:
- Use ONLY numbers that appear in the evidence below. Do not round them, do not
  invent any, do not add units the evidence does not use.
- No marketing language. No "revolutionary", "seamless", "powerful", "unlock".
- Short words. A judge is reading this while deciding.

Reply with ONLY a JSON array of 6 objects, nothing else:
[{"lines":["...","..."]}, ...]

EVIDENCE (your only source of fact):
${EVIDENCE}`;

/** Numbers the narrator is permitted to use, harvested from the evidence. */
function allowedNumbers(): Set<string> {
  return new Set(EVIDENCE.match(/\d+(?:\.\d+)?/g) ?? []);
}

/**
 * Reject any caption citing a figure the evidence does not contain.
 *
 * The narrator is a small model writing marketing-adjacent copy about
 * measurements, which is exactly the situation where a plausible number gets
 * invented. Checking is cheaper than trusting.
 */
export function unsupportedNumbers(cards: { lines: string[] }[]): string[] {
  const allowed = allowedNumbers();
  const bad: string[] = [];
  for (const card of cards) {
    for (const line of card.lines) {
      for (const n of line.match(/\d+(?:\.\d+)?/g) ?? []) {
        if (!allowed.has(n)) bad.push(`${n}  (in "${line}")`);
      }
    }
  }
  return bad;
}

/**
 * The first balanced JSON array in a reply, ignoring anything around it.
 *
 * Small models append a helpful paragraph after the JSON they were asked for,
 * and a greedy regex happily swallows it up to the last bracket in the
 * message. Counting depth is the difference between parsing the answer and
 * parsing the answer plus its apology.
 */
function firstJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

async function main(): Promise<void> {
  const client = createClient();

  const existing = await client.agents.list();
  const found = (existing.data ?? []).find((a) => a.name === NARRATOR);
  const modelName = process.env.MODEL_FQN ?? DEFAULT_MODEL_FQN;
  const manifest = {
    model: { name: modelName },
    instructions:
      'You write short, plain caption cards for a technical demo. You never ' +
      'invent a number. You prefer a short word to a long one. You do not sell.',
    config: { iterationLimit: 6, generativeUi: { enabled: false } },
  } as never;

  if (found) await client.agents.update(found.id, { manifest });
  else await client.agents.create({ name: NARRATOR, manifest });
  console.log(`[narrator] agent "${NARRATOR}" ready on the harness`);

  const { data: session } = await client.sessions.create({ agent: { name: NARRATOR } });
  const events = new Map<string, unknown>();
  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: 'user.message', content: BRIEF }],
  });
  for await (const { data: event } of stream.withMetadata()) {
    if (isEventDelta(event)) {
      const base = events.get((event as { id: string }).id);
      if (base) mergeEventDelta(base as never, event);
    } else {
      events.set((event as { id: string }).id, event);
    }
  }

  let text = '';
  for (const e of events.values()) {
    const ev = e as { type?: string; content?: unknown };
    if (ev.type === 'model.message' && typeof ev.content === 'string') text += ev.content;
  }

  const json = firstJsonArray(text);
  if (!json) {
    console.error('[narrator] no JSON array in the reply. Raw:\n' + text.slice(0, 600));
    process.exit(1);
  }
  const cards = JSON.parse(json) as { lines: string[] }[];

  const bad = unsupportedNumbers(cards);
  if (bad.length) {
    console.error('[narrator] rejected — these figures appear nowhere in the evidence:');
    for (const b of bad) console.error('  ' + b);
    process.exit(1);
  }

  writeFileSync(
    'docs/narration.json',
    JSON.stringify({ agent: NARRATOR, model: modelName, session: session.id, cards }, null, 2) + '\n',
  );
  console.log(`[narrator] ${cards.length} cards written to docs/narration.json`);
  if (process.argv.includes('--print')) {
    cards.forEach((c, i) => console.log(`\n  ${i + 1}. ` + c.lines.join('\n     ')));
  }
}

main().catch((e) => {
  console.error('\n' + explain(e));
  process.exit(1);
});
