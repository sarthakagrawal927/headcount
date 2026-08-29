# Idle games have a hole in them shaped exactly like an AI agent

Idle games model a company where labour is *perfect*. You buy a machine, it
makes 3.2 units a second, and it makes 3.2 units a second forever —
unsupervised, unambiguous, never needing you again. The only thing that ever
scales against you is cost.

Real labour isn't like that. Neither is an AI agent. Both are fast, tireless,
and **uncertain** — and uncertainty escalates to a human.

That gap is a genre-sized hole, and I spent a hackathon building a game in it.

## The one equation

In HEADCOUNT you run a factory. Workers complete tasks, but every task has a
chance of raising a question — the spec is ambiguous, the stock is the wrong
size, two callouts on the drawing are both labelled "A". Questions come to you.
You answer them at a fixed rate.

At steady state, throughput settles where escalations equal your answer rate:

```
max throughput = playerAnswerRate / effectiveConfusion
```

**Headcount does not appear in that equation.** Hiring cannot raise the
ceiling. It is structurally incapable of it.

The first time I ran the simulator I got this, and I hadn't authored any of it:

| strategy                    | peak → final | hired | idle |
| --------------------------- | ------------ | ----- | ---- |
| hire-only                   | 4.56 → 1.67  | 23    | 21   |
| write the SOP               | 4.67 → 3.16  | 25    | 22   |
| build management structure  | 29.0 → 29.0  | 33    | 0    |

Twenty-three people hired, twenty-one standing around waiting for you to answer
something. And the hire-only line doesn't plateau — it **declines**, because
past your span of control every additional hire makes everyone else more
confused. That's Brooks's Law as a multiplier, and adding it changed the game
from "hiring is useless" to "hiring is actively harmful."

The only strategies that hold are the ones that change the org chart: write the
procedure down, add a supervisor tier, or grant autonomy. Which is, annoyingly,
how it works in real life.

## Then I gave the game to an agent

Not to play it. Optimal play of an idle economy is a closed-form greedy
calculation — a twenty-line script beats any LLM at it, faster and cheaper. An
LLM playing an idle game demonstrates nothing.

Design isn't closed-form. Picking the prestige exponent is the whole game:
square root means you need 4× to double, cube root means 8×, and Egg Inc. uses
^0.14 so you need **128×**, deliberately, to punish idling. Same mechanic,
three completely different games, and the difference is one number chosen under
simulation.

So the agent designs. It reads the live floor over MCP, diagnoses where the
wall is, proposes new content, proves it in a headless deterministic simulator,
and has to ask a human before anything reaches the running game.

## Every safety control I built exists because the agent did something

This is the part I did not expect, and it's the reason I'd write this post at
all. I did not sit down and threat-model an agent. I watched one work, four
times, and each time it did something that needed a new control.

**1. It designed a supervisor that cannot supervise.** A tier-2 role with
`answerRate: 0` — a manager who absorbs no questions — attached to a confident
rationale citing attention figures that patch could not possibly produce. The
prose was excellent. The numbers were unattributable to any run.

So I added coherence rules: invariants a JSON schema can't express. A
supervisor needs a positive answer rate. Costs must outgrow output. Violations
are rejected *before* simulation, with the reason spelled out — which turned
out to teach the model mid-run. It stopped making that mistake.

**2. It simulated one patch and applied a different one.** Not maliciously —
models regenerate JSON from a description rather than copying it, and the
result is subtly different every time.

Telling an agent "simulate first" is a request, not a control. So
`simulate_patch` now mints an HMAC token bound to the exact diff it ran, and
`apply_patch` refuses anything whose fingerprint doesn't match. The error names
both hashes.

**3. It attached a failing verdict as its own evidence, and a human approved
it.** The simulation came back `DEGENERATE-no-wall` — the design deleted the
tension, which is the easiest way to make every metric improve and the game
worthless. The agent attached that verdict, wrote a rationale claiming the
change "creates meaningful tension", and asked.

I approved it. The server refused it anyway.

That's the sharpest thing I learned all weekend: **approval establishes that a
change is wanted. It does not establish that the change was ever measured.**
Those are different questions and only one of them can be delegated to a tired
human reading well-formed prose at 1am.

**4. It misdescribed its own patch.** It asked to apply what it called "adds a
tier-2 Line Lead role". The patch also cut the *existing* Line Lead from 3.0
answers/sec to 0.3 — crippling the only working supervisor — and zeroed the
player's ability to earn by hand. Neither appeared anywhere in its description.

So `apply_patch` now requires a plain-English list of every effect, and the
server compares that list against what the patch actually does and refuses
anything undeclared.

None of these were adversarial prompts. This is what a competent model does
when you ask it to design something. Every one of them reads well.

## Autonomy as a runtime property

The harness I built on ([TrueForge](https://trueforge.dev)) keeps each agent's
approval policy in its manifest and re-resolves that manifest **on every turn**.
Which means permissions aren't a deploy-time constant — they're something you
can widen and narrow while the agent is working.

So clearance becomes earned. The agent accumulates a record of proposals that
survived simulation; you grant it autonomy in a category against that record;
and when something it shipped degrades the economy, it's taken back. Same
agent, same request, three times in a row: **gated → proceeded → gated**, with
nothing changing but one array.

That feels closer to how trust actually works than any allowlist I've written.

## The thing underneath

Idle games are about building automation until you're out of the loop. Agent
harnesses are about building automation until you're out of the loop. The
genre has spent thirteen years developing a visual language for showing a human
a process they aren't watching — which is exactly the interface problem an
agent fleet has, and nobody seems to have noticed.

The tech tree in HEADCOUNT isn't machines. It's an org chart: write the
procedure down (a skill), insert a supervisor (a subagent tier), grant
autonomy (narrow the approval gate). Those are the three ways to scale a
factory, a startup, and a fleet of agents, and they're the same three.

Which means the scarce resource was never compute, or headcount, or tokens.

It's the number in the corner that never goes up.

---

*Code: [github.com/sarthakagrawal927/headcount](https://github.com/sarthakagrawal927/headcount).
Built for the Agent Harness Hackathon on TrueForge.*
