/**
 * Sanity harness: does the attention economy actually produce a ceiling that
 * headcount cannot raise? This is the load-bearing claim of the whole design.
 */
import { SEED_PACK } from './content.js';
import { simulate, type PlayPolicy } from './sim.js';

const archetypes: PlayPolicy[] = [
  {
    mode: 'scripted',
    label: 'headcount-rush   (just hire people)',
    script: [{ type: 'hire', roleId: 'riveter', upTo: 60 }],
  },
  { mode: 'greedy', label: 'greedy-ratio     (classic idle optimum)' },
  {
    mode: 'scripted',
    label: 'process-first    (write the SOP early)',
    script: [
      { type: 'hire', roleId: 'riveter', upTo: 3 },
      { type: 'sop', sopId: 'rivet_spec' },
      { type: 'hire', roleId: 'riveter', upTo: 60 },
    ],
  },
  {
    mode: 'scripted',
    label: 'attention-aware  (SOP, then supervisors, then tenure)',
    script: [
      { type: 'hire', roleId: 'riveter', upTo: 3 },
      { type: 'sop', sopId: 'rivet_spec' },
      { type: 'hire', roleId: 'riveter', upTo: 6 },
      { type: 'hire', roleId: 'line_lead', upTo: 3 },
      { type: 'tenure', roleId: 'riveter' },
      { type: 'hire', roleId: 'riveter', upTo: 60 },
    ],
  },
];

const DURATION = 900;

console.log(
  `\nHEADCOUNT — ${DURATION}s runs. Player answers ${SEED_PACK.playerAnswerRate} question/s, and that never changes.\n`,
);
console.log(
  'strategy                                      peak    final   hired   idle    wall     cash',
);
console.log('─'.repeat(92));

for (const policy of archetypes) {
  const { score, final } = simulate(SEED_PACK, policy, DURATION);
  const heads = Object.values(final.headcount).reduce((a, b) => a + b, 0);
  // Riveters produce 1 task/s each, so final throughput *is* the count of
  // riveters actually working. Everyone else is stood waiting on the player.
  const producers = final.headcount['riveter'] ?? 0;
  const idle = Math.max(0, producers - score.finalThroughput);
  console.log(
    `${(policy.label ?? '').padEnd(44)}` +
      `${score.peakThroughput.toFixed(2).padStart(6)}` +
      `${score.finalThroughput.toFixed(2).padStart(9)}` +
      `${String(heads).padStart(7)}` +
      `${idle.toFixed(0).padStart(7)}` +
      `${(score.timeToWall === null ? 'never' : score.timeToWall.toFixed(0) + 's').padStart(9)}` +
      `${score.lifetimeCash.toFixed(0).padStart(8)}`,
  );
}
console.log('');
