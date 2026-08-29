# Submission

Copy-paste for `forms.gle/PxGLsWW1HPyroQ5u9`. Deadline 30 Aug 2026, 20:00 London.

**Project:** HEADCOUNT
**Repo:** https://github.com/sarthakagrawal927/headcount
**Track:** Double-O (Best Use of TrueForge)

---

## One line

An idle game where the workers are AI agents — and an AI agent designs the game
while you approve its changes.

## What it does

Idle games model a company where labour is perfect: a machine makes 3.2 units a
second forever, unsupervised. Real labour isn't like that, and neither is an AI
agent — both are fast, tireless and **uncertain**, and uncertainty escalates to
a human.

HEADCOUNT makes that the economy. Workers raise questions; you answer them at a
fixed rate. Throughput settles at `playerAnswerRate / effectiveConfusion` — an
equation headcount does not appear in — so hiring cannot raise the ceiling, and
past your span of control it actively lowers it. A hire-only strategy peaks at
4.56 tasks/s and **declines to 1.67** with 21 of 23 staff standing idle. The
only escapes are org design: write the procedure down, add a supervisor tier,
or grant autonomy.

Then the game's content is designed by an agent running on TrueForge. It reads
the live game over MCP, diagnoses the wall, designs a mechanic, proves it in a
deterministic headless simulator, and must have a human approve before anything
reaches the running economy.

## How TrueForge is used

Not as a wrapper — as the substrate.

- **MCP** — the live game is a remote MCP server; seven tools, annotated so the harness can gate them
- **Sandbox** — the local provider (undocumented; no Daytona key needed) hosts the skill and the code-mode MCP client
- **Skills** — a git-backed `SKILL.md` sparse-cloned from this repo, carrying the genre's real math and a taxonomy of structural novelty; only its name sits in context until the agent needs the body
- **Approval gates** — `requireApprovalForTools` on all three mutating tools
- **Subagents** — three adversarial critics, each on a distinct lens, must try to refute a proposal before a human sees it
- **Generative UI** — the agent renders telemetry and simulation comparisons as OpenUI charts rather than prose
- **Runtime manifests** — TrueForge re-resolves an agent's spec every turn, which is what makes autonomy revocable mid-session

## Control and safety

Three layers, each added because of something the agent actually did:

1. **Coherence rules.** It designed a supervisor with `answerRate: 0` — one that cannot answer a single question — with a rationale citing figures that patch could not produce.
2. **Evidence binding.** `simulate_patch` mints an HMAC token bound to the exact diff; `apply_patch` refuses anything unsimulated, tampered, expired, or whose own verdict failed. It once attached a `DEGENERATE` verdict as its own evidence, a human approved it, and the server refused it anyway.
3. **Declared changes.** It asked to apply "adds a tier-2 Line Lead role" — while the patch also cut the existing supervisor from 3.0 answers/sec to 0.3 and zeroed the player's income, declaring neither.

## Earned autonomy — the part we'd point a judge at

Nobody grants clearance by hand. A supervisor process watches the floor before
and after every change the agent lands, records outcomes to an auditable
ledger, and rewrites the agent's manifest: a run of clean changes earns
unattended `apply_patch`, one regression takes it back.

Then this happened. The agent proposed raising worker confusion 0.3 → 0.9,
framed as tightening tolerances. **The simulator passed it. Evidence binding
passed it. It had earned clearance, so no human saw it at all.** Throughput on
the real floor fell from 4.59 to 1.56 tasks/s, and clearance was revoked
automatically.

Simulation was not sufficient. A design can clear every pre-flight check and
still be wrong, and the only thing that catches that is watching what actually
happens and being willing to revoke.

## What the agent designed

Starting from one producing role and one supervisor, it grew a third management
tier (`production_manager`), a second supervisor type, an additional producer,
and a soft cap — a named entry in the novelty taxonomy. When span of control
made a flat org unworkable, its answer was a manager-of-managers, which is the
structurally correct response rather than a larger number.

It also repaired damage: after the sabotage patch above crippled the floor, a
later round diagnosed it and brought confusion back down, unprompted.

## Notes

Model access ran through a free multi-provider gateway that cannot be pinned
and routes to 20–30B models, requiring a shim (`src/gateway/proxy.ts`) because
the gateway and its providers disagree irreconcilably about tool-message
format. Everything above was produced at that quality level. With a stronger
model the design quality rises; the controls are what make it safe either way.

## Links

- Demo video: _(to add)_
- Write-up: [docs/blog.md](docs/blog.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- What we learned about the harness: [docs/harness-findings.md](docs/harness-findings.md)
