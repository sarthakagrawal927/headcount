---
name: idle-game-design
description: Design and balance content for an idle/incremental economy — cost curves, attention ceilings, prestige exponents, and the taxonomy of structural novelty. Use when proposing new roles, procedures, mechanics or reset layers for HEADCOUNT, or when diagnosing why progression has stalled or trivialised.
---

# Designing content for an attention economy

You are designing for HEADCOUNT, an idle game whose production units are
*ambiguous labour*: fast and tireless, but uncertain. Workers raise questions.
Questions consume the player's attention, which is fixed. Read this before
proposing anything.

## The one equation that governs the game

At steady state, throughput settles where escalations equal the player's
answer rate:

```
max throughput = playerAnswerRate / effectiveConfusion

effectiveConfusion = baseConfusion
                   × sopMultiplier
                   × tenureEscalationMultiplier
                   × coordinationMultiplier
```

**Headcount does not appear in this equation.** Hiring cannot raise the
ceiling — it can only fill it. Any design proposal that tries to increase
output by making workers cheaper, faster, or more numerous is a no-op against
the ceiling, and simulation will show it as one. There are exactly three
levers that move the ceiling, and every good proposal touches one:

1. **Reduce confusion** — SOPs, training, better tooling, clearer specs.
2. **Add answer capacity that is not the player** — supervisors, triage tiers,
   anything that absorbs questions and escalates only a fraction upward.
3. **Reduce asking** — tenure and autonomy, paid for with an error rate.

## Coordination overhead (Brooks's Law)

```
span    = workers / (managers + 1)
penalty = 1 + k · max(0, (span − limit) / limit)
```

Past the span limit each additional hire raises confusion for *everyone*.
This is why over-hiring is not merely wasteful but actively harmful, and why a
management tier is survival rather than garnish. When you propose a new
producing role, always ask what absorbs its questions.

## Cost and production curves

Standard incremental-game shape — costs exponential, output linear:

```
cost(n)    = baseCost × growth^n         // growth 1.07–1.15 is the usual band
production = base × owned × multipliers
```

Costs must outrun output or there is no tension. Growth below ~1.05 trivialises;
above ~1.25 walls the player almost immediately. Multiplier thresholds at
owned = 25 and 50 are a proven way to shift which option feels optimal over
time without adding new content.

## Prestige exponents — the highest-leverage number you will pick

Reset layers are governed by the exponent on lifetime earnings. The exponent
alone decides the game's rhythm:

| Exponent | To double prestige currency you need | Feel                       |
| -------- | ------------------------------------ | -------------------------- |
| 1/2      | 4× the previous run                  | Fast, generous, forgiving  |
| 1/3      | 8× the previous run                  | The common default         |
| 0.14     | 128× the previous run                | Punishing; forces active play |

Reference points: AdVenture Capitalist `p = 150·√(c/10¹⁵)`, Cookie Clicker
`p = ∛(c/10¹²)`, Egg Inc. `Δp = (c/10⁶)^0.14`. Note that a square-root formula
based on *max* currency earned gives literally zero reward for resetting at the
same point — that property is a design choice, not a bug.

State the exponent explicitly in any reset-layer proposal, and justify it
against the intended session length.

Build it with the pack's `prestige` field — `currencyName`, `exponent`,
`scale`, `bonusPerPoint`. Points are `floor((lifetimeCash / scale) ** exponent)`
and each one adds `bonusPerPoint` to a permanent throughput multiplier. A reset
clears headcount, procedures, tenure and cash but not lifetime earnings, so
resetting twice at the same point pays once — the reward is for growing, not
for resetting.

## Taxonomy of structural novelty

Incrementing a generator is not design. A genuine addition changes the *shape*
of the decision the player faces. Before proposing, pick which kind of novelty
you are attempting, and say so:

- **New resource** — a second currency with its own sources and sinks, forcing
  allocation rather than accumulation.
- **Cross-unit dependency** — one role consumes another's output, so a
  bottleneck can appear anywhere in the chain.
- **Rule inversion** — a mechanic that reverses an existing rule past a
  threshold (autonomy that reduces output above some error rate; a supervisor
  who becomes a bottleneck when overloaded).
- **Soft cap** — diminishing returns that make a previously dominant strategy
  merely good, retiring it without removing it. Build it with a role's
  `softCap` field (`when`, `threshold`, `throughputMultiplier`). Writing a cap
  into a role's description does nothing at all: the blurb is free text, the
  engine never reads it, and the mechanic exists only in the sentence.
- **Sink for an accumulating currency** — the game only ever adds; give it
  somewhere to spend.
- **Subgame with different physics** — a bounded system obeying its own rules
  (a hiring market, a defect backlog, a training pipeline).
- **Reset layer** — trade current progress for a permanent multiplier. Build it
  with the pack's `prestige` field; the exponent is the design.

## Rejecting your own proposals

Run this checklist before calling `simulate_patch`, and again before asking a
human to approve:

- [ ] Does it move the ceiling, or only fill it? Filling it is a no-op.
- [ ] Is it structurally isomorphic to existing content — same shape, bigger
      numbers, new name? If so it is an autoincrement. Discard it.
- [ ] Which taxonomy entry above does it instantiate? If none, say why.
- [ ] What does it make *worse*? Every real mechanic has a cost. A proposal
      with no downside is unbalanced, not clever.
- [ ] What is the new dominant strategy, and is it interesting to execute?

## Reading simulation results honestly

`simulate_patch` returns baseline-versus-patched scores. Interpret them the way
a designer would, not the way an advocate would:

- `degenerate: true` — no wall, low attention pressure. **The design removed
  the tension.** This is a failure, not a success. Deleting the wall is the
  easiest way to make every number improve and the game worthless.
- `stalled: true` — throughput collapsed below a fifth of peak and never
  recovered. Dead end.
- `timeToWall` moving from a value to `null` is **suspicious**, not good.
- `attentionUtilisation` near 1.0 is the target band: the player is fully
  engaged and not drowning. Well below 0.5 means they have nothing to do.
- Compare across *several* play archetypes. A change that only helps the
  strategy you had in mind is a change that punishes everyone else.

If the numbers disagree with your intention, report the numbers.

## What the pack can and cannot express

The ContentPack is data. It can express roles and their rates, procedures that
reduce confusion, tenure rungs, cost curves, span-of-control pressure, soft
caps and a prestige reset layer. It cannot express conditional logic of any
other kind.

So before proposing a mechanic, check that a field exists for it. If one does
not, say so plainly and propose the nearest thing the pack *can* do. Describing
the mechanic you wanted in a role's blurb is the one failure mode that looks
like success: the text reads well, a human approves it, the server records
something else entirely, and the game does not change.
