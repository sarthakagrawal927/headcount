/**
 * HEADCOUNT — core domain types.
 *
 * The game models a company whose production units are *ambiguous labour*:
 * fast and tireless like an idle-game machine, but uncertain like a junior
 * hire. Uncertain workers raise questions. Questions consume the one resource
 * that never scales: the player's attention.
 *
 * Everything an agent is allowed to design is expressed as data in a
 * `ContentPack`, so generated content is validated against a schema rather
 * than executed as arbitrary code.
 */

/** A kind of worker that can be hired. Tier 1 produces; tier 2+ supervises. */
export interface Role {
  id: string;
  name: string;
  /** Flavour shown in the org chart. */
  blurb: string;
  /** 1 = individual contributor, 2 = supervisor, 3 = manager-of-managers. */
  tier: number;
  /** Tasks completed per second by one unblocked worker. */
  throughput: number;
  /** Probability that a completed task raises a question. */
  confusion: number;
  /** Cash earned per non-defective task. Supervisors earn nothing directly. */
  revenuePerTask: number;
  /** Questions per second this role can answer on behalf of the player. */
  answerRate: number;
  /** Fraction of answered questions a supervisor still escalates upward. */
  escalateFraction: number;
  /** First-unit price. */
  baseCost: number;
  /** Geometric price growth per unit owned: cost = baseCost * growth^owned. */
  costGrowth: number;
  /**
   * Diminishing returns past a threshold.
   *
   * Added because the agent kept *describing* soft caps it could not build —
   * "throughput caps at 2.5/sec once the queue exceeds 10" — and writing them
   * into a role's blurb, where they read convincingly and did nothing. A pack
   * that cannot express the mechanic an agent reaches for does not prevent the
   * mechanic; it just moves it into prose nobody validates.
   */
  softCap?: SoftCap;
}

/**
 * A soft cap retires a dominant strategy without removing it: past the
 * threshold each unit still contributes, just less. That is the shape the
 * genre uses to keep an option good rather than mandatory.
 */
export interface SoftCap {
  /** What is being counted. */
  when: 'headcountAbove' | 'queueAbove';
  /** The count past which returns diminish. */
  threshold: number;
  /** Multiplier applied to this role's output beyond the threshold. 0..1 */
  throughputMultiplier: number;
}

/** A written procedure that reduces how often a role gets confused. */
export interface Sop {
  id: string;
  name: string;
  blurb: string;
  /** Role this procedure documents. */
  roleId: string;
  /** Multiplier applied to that role's confusion. 0.5 = halves questions. */
  confusionMultiplier: number;
  cost: number;
}

/**
 * A tenure track: proven workers stop asking, but start making unreviewed
 * mistakes. This is the trust/autonomy curve expressed as an economy.
 */
export interface TenureLevel {
  /** Multiplier on the role's confusion — how much less it asks. */
  escalationMultiplier: number;
  /** Probability a task is silently defective (earns nothing). */
  errorRate: number;
  cost: number;
}

/**
 * A reset layer: trade everything for a permanent multiplier.
 *
 * The design skill teaches this in detail — square root means you need 4x to
 * double your prestige currency, cube root 8x, and Egg Inc.'s 0.14 exponent
 * means 128x — and until now the pack could not express one at all, so an
 * agent reaching for a reset layer could only describe it.
 *
 * The exponent is the whole design. It sets how long a run lasts and how much
 * a second one is worth, and choosing it is exactly the kind of judgement that
 * has to be made under simulation rather than argued for.
 */
export interface PrestigeLayer {
  /** What the player earns by resetting. Flavour only; the maths is below. */
  currencyName: string;
  /**
   * Applied to lifetime earnings to yield prestige points:
   * `points = floor((lifetimeCash / scale) ** exponent)`.
   *
   * 0.5 is forgiving, 0.33 is the common default, 0.14 is punishing.
   */
  exponent: number;
  /** Divisor applied before the exponent, setting when a first reset pays. */
  scale: number;
  /**
   * Permanent throughput multiplier per point, compounding across resets:
   * `1 + points * bonusPerPoint`.
   */
  bonusPerPoint: number;
}

export interface ContentPack {
  version: number;
  roles: Role[];
  sops: Sop[];
  /** Tenure ladder, shared by all roles. Index 0 is untenured. */
  tenureLadder: TenureLevel[];
  /** Questions per second the player can personally answer. */
  playerAnswerRate: number;
  /** Cash earned when the player completes a task by hand. */
  clickRevenue: number;
  /** Defects tolerated before an incident claws tenure back. */
  incidentThreshold: number;
  /**
   * Reports one manager can hold before coordination overhead sets in. The
   * real org-design term, and the stat the whole game is fighting.
   */
  spanOfControl?: number;
  /** Optional reset layer. Absent means the game has no prestige. */
  prestige?: PrestigeLayer;
  /**
   * Brooks's Law coefficient. How sharply confusion rises once span of control
   * is exceeded — past the limit, each extra hire makes everyone else more
   * uncertain, not less. Set to 0 to disable coordination overhead.
   */
  coordinationPenalty?: number;
}

export interface GameState {
  /** Seconds of in-game time elapsed. */
  t: number;
  cash: number;
  /** Lifetime cash earned — the basis for any future prestige layer. */
  lifetimeCash: number;
  tasksCompleted: number;
  defects: number;
  /** roleId -> units hired. */
  headcount: Record<string, number>;
  /** Installed SOP ids. */
  sops: string[];
  /** roleId -> tenure ladder index. */
  tenure: Record<string, number>;
  /** Questions waiting on the player. Each one blocks a worker. */
  queue: number;
  /** Questions the player has answered by hand. */
  answered: number;
  /** Incidents triggered by defect accumulation (tenure clawbacks). */
  incidents: number;
  /** Prestige points banked across all resets. */
  prestigePoints: number;
  /** How many times the player has reset. */
  prestigeCount: number;
  /** Deterministic RNG cursor. */
  seed: number;
}

/** Per-tick telemetry the UI charts and the agent's simulator scores. */
export interface Telemetry {
  t: number;
  throughput: number;
  /** Questions per second arriving at the player. */
  escalationRate: number;
  queue: number;
  /** Fraction of the workforce blocked waiting for an answer. 0..1 */
  blockedFraction: number;
  cash: number;
  headcountTotal: number;
}
