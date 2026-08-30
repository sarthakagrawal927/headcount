# Demo script — three minutes

One take. Two windows: the operations console at `http://localhost:5173` on the
left, a terminal on the right. Nothing else on screen.

## Before recording

```bash
npx @truefoundry/trueforge@latest            # :8790
npx tsx src/mcp/server.ts                    # :3001  (the game)
GATEWAY_KEY=… npx tsx src/gateway/proxy.ts   # :3002  (only for the free gateway)
npm run dev                                  # :5173  (the console)
MODEL_FQN=<provider/model> npx tsx src/agent/provision.ts
npx tsx src/agent/autonomy.ts                # the supervisor — start before recording
```

Let the supervisor accumulate a few clean changes before the take (run
`src/agent/demo.ts --approve` a few times, or land patches directly) so it has
a real ledger to show at 2:20 rather than an empty one.

Restart the MCP server immediately before recording so the company starts at
`t=0` with nobody on the floor. Have `npx tsx src/agent/demo.ts --approve`
typed but not entered.

---

## 0:00 — You are the only one hammering

Console, empty. Hit `WORK THE LINE` a few times.

> "This is an idle game. You are the only worker. Every task you do by hand
> earns a dollar, and nobody asks you anything."

## 0:15 — Hire, and watch the trap open

Hire four or five Riveters. Point at the number top-right that does not move.

> "Workers are fast, and unsure. Every so often one stops and asks. Your
> attention is fixed at one question a second — that number never goes up.
> Everything else does."

Around the fifth hire the arrivals bar crosses `YOUR CEILING` and grows a
hatched overflow. Keep hiring to about twelve.

## 0:45 — The wall

Point at `WORKFORCE BLOCKED`, now around 75%, and at the org chart's
`n blocked` counter.

> "Twelve people hired. Nine of them are standing still waiting for me to
> answer a question. Throughput is capped at my answer rate divided by how
> confused they are — headcount is not in that equation. Hiring cannot raise
> this ceiling. Past your span of control it actively lowers it: this floor
> peaks and then declines."

## 1:10 — Hand it to the agent

Run `npx tsx src/agent/demo.ts --approve` in the terminal.

> "So the game needs new mechanics — and an agent designs them. It reads the
> live floor over MCP, diagnoses the stall, and proposes a change."

Let its diagnosis scroll. Do not read it aloud; let it be visibly its own work.

## 1:35 — It has to prove it

> "It doesn't get to assert the design is good. `simulate_patch` runs it
> headless against play archetypes and returns a verdict — and the verdict can
> disagree with it. A design that deletes the wall improves every metric and
> ruins the game, so that comes back as *degenerate* and is refused."

## 1:45 — Three critics try to tear it down

Before anything reaches you, the panel convenes — three agents on different
lenses, each trying to *refute* the proposal.

> "A human approving everything ends up approving everything. So a proposal has
> to survive being attacked first. Three critics, read-only by construction,
> each looking for a different failure: did the patch do something the
> rationale doesn't admit, did it break something that already worked, is this
> actually new or the same mechanic in a new hat."

If they block it — which they often do, and correctly — that is the beat:

> "Three of three refuted it. It said it was adding a supervisor; it was
> editing the one that exists, with a number that doesn't match its own
> description. I was never asked. That's the point — my attention is the
> resource this whole game is about, and it wasn't spent on this."

The panel is strict, and with a small model it blocks often. Two ways to run
the beat, and it is worth deciding which before you record:

```bash
npx tsx src/agent/grow.ts --rounds 3   # rounds until changes land — use for the "it works" beat
npx tsx src/agent/demo.ts --approve    # one round with the panel — use for the block
```

**Use `grow.ts` for the beat where a change lands.** It runs rounds until they
succeed and recovers between them; the last six-round run applied six of six.
`demo.ts` is a single round, and on the free gateway's small models a single
round is usually refused — correctly, but that is the wrong first impression.
A viewer who has only seen refusals concludes the agent cannot do anything.

So: show `grow.ts` landing a mechanic and the console updating, *then* show
`demo.ts` being stopped. Success first, scrutiny second.

## 1:50 — The gate

The approval card appears.

> "Then it stops. It cannot touch the running game without me. And what I'm
> reading isn't its summary of the simulation — that token is signed and bound
> to this exact diff, carrying the verdict. Plus every change it makes, which
> the server checks is complete before it will apply anything."

## 2:10 — The part that matters

Approve.

> "It said it was adding a supervisor. The patch also downgraded the existing
> supervisor tenfold and zeroed the player's income — and mentioned neither.
> That's the run where a human reading a well-written rationale approves it
> anyway. The server refused it."

If instead you get the fabricated-token run — the evidence field reading
something like `simulate_patch:2025-06-25T15:07:00Z:b8c4d1e` — use it, because
it is the better beat:

> "Look at the evidence field. That token is invented. It never ran the
> simulation; it produced something that looks like proof and attached it to a
> paragraph of good reasoning. I approved it. The server refused it anyway,
> because a token nobody minted has no signature. That's the difference between
> asking an agent for evidence and requiring it to hold some."

If the run applies cleanly instead, use that: switch to the console and show
the new role appear in the hire panel mid-shift.

> "And when the change is honest, it lands — that role did not exist a minute
> ago. An agent designed it, proved it, and asked."

## 2:20 — Autonomy it earns, and loses

Split to the supervisor's terminal (`npx tsx src/agent/autonomy.ts`, running
since before the take).

> "Approval gates are a good default and a terrible steady state — a human who
> has to approve everything ends up approving everything without reading it. So
> nobody grants this agent autonomy. It earns it."

Point at the ledger lines: three changes landed, each judged after it settled.

> "This process watches the floor before and after every change the agent
> ships. Three that didn't make things worse, and the gate opens — the harness
> re-reads its permissions every turn, so that takes effect immediately."

Then the last line.

> "And then it shipped this: riveter confusion from 0.3 to 0.9, described as
> tightening tolerances. The simulator passed it. Evidence binding passed it.
> It had clearance, so no human saw it at all. Throughput on the real floor
> went from 4.59 to 1.56 — and its autonomy was taken back automatically."

Let that sit.

> "Simulation wasn't enough. It cleared every check we built and was still
> wrong, and the only thing that caught it was watching what actually happened
> and being willing to revoke."

## 2:55 — Close

> "Idle games are about automating yourself out of the loop. So are agents.
> This one makes your attention the thing that runs out — and the trust
> something you get back only by earning it again."

## If it stalls mid-take

The free gateway allows **8,000 tokens per minute** and cannot be pinned to a
model. Two failure shapes, both recoverable:

- **The turn errors and the shim logs `413 Request too large`.** The
  conversation has grown past the ceiling. Start a fresh round rather than
  nudging — each nudge adds to the same conversation and makes it worse.
- **The turn errors with `402` or `All providers failed`.** A free upstream is
  momentarily exhausted. The shim already retries with backoff; if it gives up,
  simply run the round again.

With a real provider key neither happens: set `MODEL_FQN` to that provider and
skip the shim entirely. If you have one, use it for the recording — the design
quality is visibly better and the failure modes above disappear.

## Notes

- Never show the terminal that has `GATEWAY_KEY` in it.
- `?cash=400&hire=14` jumps the console straight to the wall if a take runs long.
- The agent's first proposal is often flawed. That is not a failed take — it is
  the demo. Only re-run if it fails to reach the gate at all.
