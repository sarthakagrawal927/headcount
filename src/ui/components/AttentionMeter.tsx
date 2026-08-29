import type { Pressure } from '../useGame';
import type { Telemetry } from '../../engine/types';
import { fmtInt, fmtPct, fmtRate } from '../format';
import { Ticker } from './Ticker';

const CELLS = 26;

const CAPTION: Record<Pressure, string> = {
  nominal:
    'Answered as fast as they arrive. Nobody on the floor is standing still waiting for you.',
  strained:
    'Keeping up, barely. Note that hiring raises the questions, never the answers.',
  saturated:
    'Arrivals now exceed your attention. Every question in the queue is a worker with their hands off the work.',
  critical:
    'The floor is blocked on you. Throughput is collapsing and more headcount will make it worse. Write it down or delegate it.',
};

const STATUS: Record<Pressure, string> = {
  nominal: 'NOMINAL',
  strained: 'STRAINED',
  saturated: 'SATURATED',
  critical: 'CRITICAL',
};

export function AttentionMeter({
  telemetry,
  playerAnswerRate,
  orgCapacity,
  pressure,
}: {
  telemetry: Telemetry;
  playerAnswerRate: number;
  orgCapacity: number;
  pressure: Pressure;
}) {
  const arriving = telemetry.escalationRate;
  const scale = Math.max(playerAnswerRate * 2.2, arriving * 1.12, 0.001);
  const markPct = (playerAnswerRate / scale) * 100;
  const fillPct = (Math.min(arriving, playerAnswerRate) / scale) * 100;
  const overPct = (Math.max(0, arriving - playerAnswerRate) / scale) * 100;

  const queue = telemetry.queue;
  const litCount = Math.min(CELLS, Math.floor(queue));
  const comfort = Math.max(2, Math.ceil(playerAnswerRate * 2));

  return (
    <section className="attention" aria-label="Attention meter">
      <div className="attention__top">
        <div>
          <div className="label">Escalations arriving</div>
          <div className="attention__figure">
            <Ticker
              className="attention__value"
              value={arriving}
              format={fmtRate}
              flash="none"
            />
            <span className="attention__unit">questions&thinsp;/&thinsp;sec</span>
          </div>
          <p className="attention__caption">{CAPTION[pressure]}</p>
        </div>

        <div className="attention__against">
          <div className="label">Your attention · fixed</div>
          <Ticker value={playerAnswerRate} format={fmtRate} flash="none" />
          <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s1)' }}>
            <span
              className={`chip ${orgCapacity > 0 ? 'chip--ok' : ''}`}
              title="Questions per second your supervisory layers absorb"
            >
              ORG ABSORBS {fmtRate(orgCapacity)}/s
            </span>
            <span
              className={`chip ${pressure === 'nominal' ? '' : pressure === 'strained' ? 'chip--attn' : 'chip--alarm'}`}
            >
              {STATUS[pressure]}
            </span>
          </div>
        </div>
      </div>

      <div
        className="ratebar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={arriving}
        aria-label={`Escalations arriving, ${fmtRate(arriving)} per second against a fixed answer rate of ${fmtRate(playerAnswerRate)} per second`}
      >
        <div className="ratebar__grid" />
        <div className="ratebar__fill" style={{ width: `${fillPct}%` }} />
        {overPct > 0 && (
          <div className="ratebar__over" style={{ left: `${markPct}%`, width: `${overPct}%` }} />
        )}
        <div className="ratebar__mark" style={{ left: `${markPct}%` }} data-label="YOUR CEILING" />
      </div>

      <div className="queuestrip">
        <span className="label" style={{ flex: 'none' }}>
          Queue
        </span>
        <div className="queuestrip__cells" aria-hidden="true">
          {Array.from({ length: CELLS }, (_, i) => (
            <span
              key={i}
              className="cell"
              data-lit={i < litCount ? (i >= comfort ? 2 : 1) : 0}
            />
          ))}
        </div>
        <div className="queuestrip__count">
          <Ticker value={queue} format={fmtInt} flash="down" />
          <span className="label" style={{ color: 'var(--ink-faint)' }}>
            waiting
          </span>
        </div>
      </div>

      <div className="blocked">
        <span className="label" style={{ flex: 'none' }}>
          Workforce blocked
        </span>
        <div className="blocked__track">
          <div className="blocked__fill" style={{ width: `${telemetry.blockedFraction * 100}%` }} />
        </div>
        <span className="num" style={{ fontSize: 'var(--fs-sm)', color: 'var(--pressure)' }}>
          {fmtPct(telemetry.blockedFraction)}
        </span>
      </div>
    </section>
  );
}
