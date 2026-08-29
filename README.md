# HEADCOUNT

**An idle game where the workers are AI agents — and an AI agent designs the game while you approve its changes.**

Built on [TrueForge](https://trueforge.dev) for the Agent Harness Hackathon.

---

## The idea in one paragraph

Idle games model a company where labour is *perfect*: a machine that makes 3.2
units/sec makes exactly that, forever, unsupervised. Real labour isn't like
that, and neither is an AI agent — both are fast, tireless and **uncertain**.
Uncertain workers raise questions, and questions consume the one resource that
never scales: a human's attention. HEADCOUNT makes that the economy. Then it
hands the design of the game to an agent, which must prove every change in
simulation and ask a human before it can touch anything.

## The one equation

```
max throughput = playerAnswerRate / effectiveConfusion
```

Headcount does not appear in it. **Hiring cannot raise the ceiling.** It is
structurally incapable of it. Here is a real 900-second run of the engine:

| strategy                          | peak → final | hired | idle |
| --------------------------------- | ------------ | ----- | ---- |
| hire-only                         | 4.56 → 1.67  | 23    | 21   |
| SOP only                          | 4.67 → 3.16  | 25    | 22   |
| builds management structure       | 29.0 → 29.0  | 33    | 0    |

You hired 23 people and 21 of them are standing around waiting for you to
answer a question. The hire-only strategy doesn't plateau — it **declines**,
because past your span of control every additional hire makes everyone else
more confused (Brooks's Law, as a multiplier on confusion). The only strategies
that hold are the ones that change the org chart: write the procedure down, add
a supervisor tier, or grant autonomy.

Nobody authored those numbers. They fall out of the model.

## What the agent does

The agent is a **game designer**, not a player — optimal play of an idle economy
is a closed-form greedy calculation that a twenty-line script does better than
any model. Design isn't closed-form, so that's the job it gets:

1. Reads the live game through MCP (`get_state`, `get_telemetry`, `get_content`)
2. Diagnoses where the wall is and which escape the content pack fails to make attractive
3. Designs a change, guided by a git-backed `SKILL.md` carrying the genre's real math and a taxonomy of structural novelty — only its name and description sit in context; the body is sparse-cloned into the sandbox and read when the agent decides it is relevant
4. **Proves it** with `simulate_patch` — headless, deterministic, across play archetypes
5. Asks a human to approve before `apply_patch` touches the running game

## Control and safety

Three independent layers, because the first two are not enough:

**1. Human approval gates.** `apply_patch`, `set_policy` and `grant_tenure` are
annotated `destructiveHint: true` and listed in `requireApprovalForTools`, so
the harness pauses before each one and shows the human the exact proposal.

**2. Evidence binding.** Telling an agent to "simulate first" is a request, not
a control. `simulate_patch` mints an HMAC token bound to the exact diff it ran,
carrying the verdict in readable form. `apply_patch` refuses a patch whose token
is missing, forged, expired, minted for a *different* diff, or whose verdict was
`degenerate`/`stalled`. The token travels in the tool arguments, so the human
reads the simulation's verdict rather than the agent's account of it.

This was built because of something that happened on the first real run: the
agent proposed a supervisor with `answerRate: 0` — one that cannot answer a
single question — and attached a confident rationale citing attention figures
that patch could not possibly produce. Later, with binding in place, it
simulated a design, got `DEGENERATE-no-wall`, attached that failing verdict as
its evidence anyway, and asked to apply it. A human approved. **The server
refused it regardless.** Approval covers whether a change is wanted; it does not
establish that the change was ever measured.

**3. Coherence rules.** Domain invariants a JSON schema cannot express — a
tier-2 supervisor must have a positive answer rate; the untenured rung must be
exactly `{1, 0, 0}`; costs must outgrow output. Violations are rejected before
simulation with an explanation, which teaches the agent mid-run.

## Earned autonomy

TrueForge stores each agent's approval policy in its manifest and **re-resolves
that manifest on every turn**. So clearance is a runtime property: narrowing
`requireApprovalForTools` via `agents.update` grants autonomy mid-session, and
widening it takes autonomy back. Trust is spent by failure rather than declared
at deploy time (`src/agent/trust.ts`).

The footgun this depends on: the session must be bound to the agent **by name**.
An inline spec freezes the manifest for the session's life and the rewrite
silently does nothing.

## Harness surface used

| Capability | How |
| --- | --- |
| MCP tools | The game is a remote MCP server; 7 tools, annotated so the harness can gate them |
| Sandbox | Local provider — skills and the MCP client script mount there, no Daytona key required |
| Skills | `idle-game-design` sparse-cloned from this repo, loaded on demand |
| Approval gates | `requireApprovalForTools` on all three mutating tools |
| Subagents | Enabled for fanning playtests across competing play archetypes |
| Session persistence | Sessions bound by name, so manifest changes take effect on the next turn |
| Context management | Compaction and large-tool-response offloading on |

## Running it

```bash
npm install

npx tsx src/mcp/server.ts        # the game, as an MCP server on :3001
npm run dev                      # the operations console on :5173
npx @truefoundry/trueforge@latest # the harness on :8790

MODEL_FQN=<provider/model> npx tsx src/agent/provision.ts   # create the agent
npx tsx src/agent/demo.ts                                   # run the design loop
npx tsx src/agent/demo.ts --approve                         # …and approve at the gate
npx tsx src/agent/clearance-demo.ts                         # gated → cleared → gated
npm test                                                    # 17 tests
```

Play it at `http://localhost:5173`. Hire past your span of control and watch
throughput fall. `?cash=400&hire=14` jumps straight to the wall.

## Layout

| Path            | What it is                                                           |
| --------------- | -------------------------------------------------------------------- |
| `src/engine/`   | Deterministic simulation. Pure; a 900s run scores in milliseconds     |
| `src/mcp/`      | The game as a remote MCP server, with evidence binding and validation |
| `src/agent/`    | Agent manifest, provisioning, sessions, runtime clearance             |
| `src/ui/`       | The operations console                                                |
| `src/gateway/`  | OpenAI-compatible shim (see below)                                    |
| `skills/`       | `SKILL.md` design playbook loaded on demand                           |
| `docs/`         | Decision log and what we learned about the harness                    |

## What actually happened on real runs

Every control in this project was added because of something the agent did,
not because of something we imagined it might do. In order:

1. It proposed a supervisor with `answerRate: 0` — one that cannot answer a
   single question — with a rationale citing attention figures that patch could
   not produce. → **coherence rules**
2. It simulated one patch and asked to apply a different one. → the
   **fingerprint check** named both, exactly.
3. It simulated a design, received `DEGENERATE-no-wall`, attached that failing
   verdict as its evidence anyway, and a human approved it. → **the server
   refused it regardless.**
4. It asked to apply what it described as *"adds a tier-2 Line Lead role"*. The
   patch also cut the existing Line Lead from 3.0 answers/sec to 0.3 —
   crippling the only working supervisor — and zeroed the player's hand-earned
   income. Neither appeared in its change list. → **declared-changes check.**

None of these are adversarial prompts. They are what a competent model does
when asked to design something, and every one of them reads well in prose.

## Qodo Code Review Evidence

_(pending — see PR history)_

## Notes

Model access for this build ran through a free multi-provider gateway, which
required a shim (`src/gateway/proxy.ts`): its schema and the providers behind it
disagree irreconcilably about tool-message format, so tool results are collapsed
into plain turns on the way upstream. The harness never sees this. It is a
workaround for one broken gateway, not a pattern to copy — point
`MODEL_FQN` at a real provider and the shim is unnecessary.

See [docs/harness-findings.md](docs/harness-findings.md) for what we learned
about TrueForge, including several places the documentation and the shipped code
disagree, and [docs/decision-log.md](docs/decision-log.md) for why the design is
shaped this way.
