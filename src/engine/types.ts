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
