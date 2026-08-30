# Decision log

Why HEADCOUNT is shaped the way it is. Written during the build, not after.

## Why not a task agent

The obvious submission for an agent-harness hackathon is *an agent that does
job X and pauses for approval*. We started there and abandoned it, because the
approval in those demos is a dialog reading `create_refund({amount: 4200})`
with Allow and Deny — which is the exact thing humans are provably bad at
evaluating. It transfers liability rather than creating safety, and every team
would ship one.

## Why an idle game

Idle games are the only genre whose subject *is* delegation. You click; then
you buy a thing that clicks for you; then a thing that buys the things that
click. The player's role migrates from doing → managing → approving → absent.
That is the same arc as adopting agents, and the genre has thirteen years of
design work on how to show a human a process they are not watching — which is
exactly the interface problem an agent fleet has.

## Why the agent designs rather than plays

The optimal play of an idle economy is closed-form. Costs scale
`baseCost × growth^owned`, output is linear, and the best purchase is a greedy
ratio a twenty-line script computes better and faster than any model. An LLM
playing an idle game is not a demonstration of anything.

Design is not closed-form. Choosing a prestige exponent — ½ means you need 4×
to double, ⅓ means 8×, 0.14 means 128× — is a taste judgment made under
simulation, and the same mechanic with three different exponents is three
different games. That is worth handing to an agent, and worth a human signing
off on.

## Why attention is the currency

The genre models a company where labour is *perfect*: a machine producing 3.2
units/sec does so forever, unsupervised, unambiguously. Real labour — and an
AI agent — is not like that. It is fast and tireless but *uncertain*, and
uncertainty escalates to a human.

So we made questions the constraint. Workers raise them; the player answers
them at a fixed rate that never scales. This produces one equation:

```
max throughput = playerAnswerRate / effectiveConfusion
```

Headcount does not appear in it. Hiring cannot raise the ceiling. The first
simulation run confirmed the shape immediately: 27 riveters hired, 24 of them
standing idle, throughput pinned at exactly `1.0 / 0.3`. Nobody wrote that
number — it fell out.

## Why we added Brooks's Law

The first model made over-hiring *wasteful but harmless* — blocked workers
produce nothing, so they also ask nothing, and the system self-limited
politely. Real organisations get actively worse as they grow.

Adding a span-of-control penalty (`1 + k·(span − limit)/limit`, applied to
confusion) changed the strategy table qualitatively: the hire-only strategy now
peaks at 4.56 tasks/s and **declines to 1.67**. It hires itself backwards.
Process alone no longer rescues it either, because a good SOP does not fix span
of control. Only strategies that build management structure hold.

This is what makes the supervisor tier survival rather than garnish.

## Why simulation gates every proposal

The agent does not get to assert that a design is good. It calls
`simulate_patch`, which runs the candidate headless across several play
archetypes and returns a shape, not a score: `degenerate` (tension removed),
`stalled` (dead end), time-to-wall, attention utilisation.

The important property is that the scoring can **disagree with the agent's
intention**. An early test proposal raised the player's answer rate; every
number improved and the wall vanished — and the verdict flagged that as
*suspicious*, because deleting the tension is the easiest way to make a game
worthless while improving every metric. An agent that can mark its own homework
is not evidence of anything.

## Why the engine is deterministic

Error and defect rates are applied as expected values rather than sampled. Noise
would force the agent to average many runs to see through variance, which costs
time and buys nothing, because the quantity it needs is the mean. Same content
pack plus same policy plus same duration produces identical telemetry, so a
proposal's evidence is reproducible by a human checking the agent's work.

## Why content is data and mechanics are code

Two tiers, with deliberately different risk. Roles, procedures, tenure rungs
and cost curves are JSON validated against a schema — the agent can pour out
hundreds and none of them can do anything the schema does not permit. A
genuinely new *mechanic* needs real code, and that runs sandboxed and is
simulated hard before it goes near the live game.

Most proposals should be data. The interesting ones are not.

## Why autonomy is the agent's own manifest

The signature mechanic. TrueForge stores each agent's approval policy in its
manifest and re-resolves that manifest on every turn, so rewriting
`requireApprovalForTools` at runtime widens or narrows what the agent may do
without asking — mid-conversation.

That makes clearance a real, revocable, earned property rather than a score in
our UI. The agent accumulates a track record of proposals that survived
simulation; clearance is granted against that record and clawed back when
something it shipped degrades the economy. Trust is spent by failure.

See [harness-findings](harness-findings.md) for the two footguns this depends
on — reference-bound sessions, and explicit tool annotations.

## What we dropped

- **A self-waking cron agent.** The `schedules` API is documented but does not
  exist in v0.1.4. An external ticker posting turns is twenty lines and shows
  the same thing.
- **Daytona.** Standalone mode has an undocumented local sandbox, so the
  dependency was avoidable.

## Evidence files are regenerated last

Found during the final claims audit. This project generates its own proof —
`docs/grown-tree.md` and `docs/ledger-sample.jsonl` are written by the runs
they document — and every re-run overwrites them. Twice a README figure
described an earlier run whose artifact a later test run had silently
replaced: the claim outlived its proof.

The rule now: any artifact a document cites is regenerated *after* the last
code change, and the document is edited to match what that run actually
produced — not the other way around. The current numbers (a 3.33 → 1.11
confusion drop; five of six mechanics landing over six rounds) are exactly
what the committed files show.
