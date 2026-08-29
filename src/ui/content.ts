/**
 * Default content pack for the UI.
 *
 * This is a *fallback*. The real engine (and later, the provisioning agent)
 * supplies its own `ContentPack`; the UI simply renders whatever it is given.
 * Nothing here is load-bearing beyond "the console has something to draw".
 */
import type { ContentPack } from '../engine/types';

export const DEFAULT_PACK: ContentPack = {
  version: 1,
  playerAnswerRate: 1.2,
  clickRevenue: 2,
  incidentThreshold: 45,
  spanOfControl: 7,
  coordinationPenalty: 0.35,

  roles: [
    {
      id: 'assembler',
      name: 'Assembler',
      blurb: 'Hands on the line. Fast, willing, and entirely unsure what "flush" means.',
      tier: 1,
      throughput: 1.0,
      confusion: 0.32,
      revenuePerTask: 1.0,
      answerRate: 0,
      escalateFraction: 0,
      baseCost: 12,
      costGrowth: 1.13,
    },
    {
      id: 'machinist',
      name: 'Machinist',
      blurb: 'Holds tolerance to a thousandth. Asks about the other nine hundred and ninety-nine.',
      tier: 1,
      throughput: 3.1,
      confusion: 0.44,
      revenuePerTask: 3.4,
      answerRate: 0,
      escalateFraction: 0,
      baseCost: 260,
      costGrowth: 1.15,
    },
    {
      id: 'fabricator',
      name: 'Fabricator',
      blurb: 'Builds the things that build the things. Escalates in paragraphs.',
      tier: 1,
      throughput: 9.5,
      confusion: 0.58,
      revenuePerTask: 11,
      answerRate: 0,
      escalateFraction: 0,
      baseCost: 4200,
      costGrowth: 1.16,
    },
    {
      id: 'lead',
      name: 'Line Lead',
      blurb: 'Answers most of it at the bench. Forwards the rest with "thoughts?"',
      tier: 2,
      throughput: 0,
      confusion: 0,
      revenuePerTask: 0,
      answerRate: 0.9,
      escalateFraction: 0.28,
      baseCost: 280,
      costGrowth: 1.24,
    },
    {
      id: 'supervisor',
      name: 'Floor Supervisor',
      blurb: 'Owns a shift, a clipboard, and the phrase "use your judgement".',
      tier: 2,
      throughput: 0,
      confusion: 0,
      revenuePerTask: 0,
      answerRate: 3.4,
      escalateFraction: 0.16,
      baseCost: 7600,
      costGrowth: 1.26,
    },
    {
      id: 'director',
      name: 'Ops Director',
      blurb: 'Absorbs the supervisors. Escalates only what could end up in a deposition.',
      tier: 3,
      throughput: 0,
      confusion: 0,
      revenuePerTask: 0,
      answerRate: 12,
      escalateFraction: 0.05,
      baseCost: 120000,
      costGrowth: 1.3,
    },
  ],

  sops: [
    {
      id: 'sop-fit',
      name: 'SOP-114: Fit & Finish',
      blurb: 'Defines "flush" in millimetres. Ends a decade of argument.',
      roleId: 'assembler',
      confusionMultiplier: 0.62,
      cost: 900,
    },
    {
      id: 'sop-scrap',
      name: 'SOP-207: Scrap Authority',
      blurb: 'Assemblers may bin a part under $4 without asking anyone.',
      roleId: 'assembler',
      confusionMultiplier: 0.55,
      cost: 9500,
    },
    {
      id: 'sop-tol',
      name: 'SOP-311: Tolerance Stack',
      blurb: 'One table. Every fit. Laminated, because it will be argued with.',
      roleId: 'machinist',
      confusionMultiplier: 0.58,
      cost: 24000,
    },
    {
      id: 'sop-tool',
      name: 'SOP-402: Tool Change',
      blurb: 'When to swap the insert, without a meeting about the insert.',
      roleId: 'machinist',
      confusionMultiplier: 0.6,
      cost: 145000,
    },
    {
      id: 'sop-weld',
      name: 'SOP-518: Weld Acceptance',
      blurb: 'Photographs of good beads and bad beads. Surprisingly effective.',
      roleId: 'fabricator',
      confusionMultiplier: 0.55,
      cost: 620000,
    },
    {
      id: 'sop-esc',
      name: 'SOP-600: Escalation Ladder',
      blurb: 'Ask your lead. Then your supervisor. Then, and only then, me.',
      roleId: 'fabricator',
      confusionMultiplier: 0.6,
      cost: 3400000,
    },
  ],

  tenureLadder: [
    { escalationMultiplier: 1, errorRate: 0, cost: 0 },
    { escalationMultiplier: 0.62, errorRate: 0.02, cost: 1200 },
    { escalationMultiplier: 0.36, errorRate: 0.055, cost: 18000 },
    { escalationMultiplier: 0.18, errorRate: 0.105, cost: 260000 },
    { escalationMultiplier: 0.08, errorRate: 0.17, cost: 4200000 },
  ],
};

/** Human-readable names for each rung of the tenure ladder. */
export const TENURE_NAMES = ['Probationary', 'Confirmed', 'Trusted', 'Autonomous', 'Unsupervised'];

/**
 * The escalation queue is *flavour* the UI owns: the engine only tracks a
 * queue depth (`GameState.queue`). We mint a question object for every unit
 * of depth so the player has something specific to answer.
 */
export interface QuestionTemplate {
  /** Which role tends to ask this. Falls back to any tier-1 role. */
  roleId: string;
  /** Where on the floor it came from. */
  where: string;
  text: string;
}

export const QUESTION_BANK: QuestionTemplate[] = [
  {
    roleId: 'assembler',
    where: 'Rivet line 3',
    text: 'Spec says 4mm, stock is 4.2mm. Proceed, or stop the line?',
  },
  {
    roleId: 'assembler',
    where: 'Cell B',
    text: 'The drawing has two callouts labelled "A". Which one is A?',
  },
  {
    roleId: 'assembler',
    where: 'Kitting',
    text: 'Box says 500 units. I counted 498 twice and 501 once. What do I write down?',
  },
  {
    roleId: 'assembler',
    where: 'Sub-assembly',
    text: 'Torque spec is in ft-lb but the wrench is Nm. Am I allowed to convert it myself?',
  },
  {
    roleId: 'assembler',
    where: 'Rivet line 1',
    text: 'A part fell on the floor. Is it still a part?',
  },
  {
    roleId: 'assembler',
    where: 'Paint prep',
    text: 'Customer wants "matte black". We stock four matte blacks. Do you have a preference?',
  },
  {
    roleId: 'assembler',
    where: 'Cell D',
    text: 'The fixture is 2mm off. I can shim it or I can file it. Both feel wrong.',
  },
  {
    roleId: 'machinist',
    where: 'Mill 2',
    text: 'Feeds and speeds sheet is for 6061. This is 7075. Should I just go slower?',
  },
  {
    roleId: 'machinist',
    where: 'Lathe 4',
    text: 'Finish pass leaves 0.02mm chatter. Within tolerance, outside my conscience.',
  },
  {
    roleId: 'machinist',
    where: 'Grinder bay',
    text: 'Coolant smells different today. Different-bad, or different-new-barrel?',
  },
  {
    roleId: 'machinist',
    where: 'Mill 5',
    text: 'The CAM file and the drawing disagree by one hole. Whose hole wins?',
  },
  {
    roleId: 'machinist',
    where: 'Inspection',
    text: 'Gauge reads in spec. Second gauge reads out of spec. Third gauge is missing.',
  },
  {
    roleId: 'machinist',
    where: 'Setup',
    text: 'Job is due Thursday. It is Thursday. Is it due at start or end of shift?',
  },
  {
    roleId: 'fabricator',
    where: 'Weld booth 2',
    text: 'Print calls for a full penetration weld on a part that is 1mm thick. Confirm?',
  },
  {
    roleId: 'fabricator',
    where: 'Brake press',
    text: 'Bend order in the drawing makes the last bend physically impossible. Reorder?',
  },
  {
    roleId: 'fabricator',
    where: 'Laser',
    text: 'Nest saves 11% material but rotates the grain. Does the grain matter here?',
  },
  {
    roleId: 'fabricator',
    where: 'Weld booth 1',
    text: 'Customer drawing is stamped "DO NOT SCALE" and has no dimensions.',
  },
  {
    roleId: 'fabricator',
    where: 'Fit-up',
    text: 'Two subassemblies are both marked "left". One of them must be lying.',
  },
  {
    roleId: 'fabricator',
    where: 'Shipping dock',
    text: 'Crate is 40kg over the pallet rating. Split it, or trust the pallet?',
  },
  {
    roleId: 'assembler',
    where: 'Receiving',
    text: 'Supplier sent the right part in the wrong colour. Do we run it or return it?',
  },
  {
    roleId: 'assembler',
    where: 'Line 3',
    text: 'Someone wrote "GOOD" on a bin in marker. It is not clear who, or when.',
  },
  {
    roleId: 'machinist',
    where: 'Tool crib',
    text: 'Last carbide insert is chipped. Run it soft, or stop until Tuesday?',
  },
  {
    roleId: 'fabricator',
    where: 'Weld booth 3',
    text: 'Spec references a standard that was withdrawn in 2019. Follow the old one?',
  },
  {
    roleId: 'assembler',
    where: 'Cell A',
    text: 'I finished early. Should I look busy, or tell you I finished early?',
  },
  {
    roleId: 'machinist',
    where: 'Mill 1',
    text: 'The old hand says the drawing is wrong and he has "always done it his way".',
  },
  {
    roleId: 'fabricator',
    where: 'Layout',
    text: 'Revision C is on the server, revision B is on the floor, and B is taped down.',
  },
];
