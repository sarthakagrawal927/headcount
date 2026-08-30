import type { Pressure } from '../useGame';
import type { Telemetry } from '../../engine/types';
import { fmtPct, fmtRate } from '../format';
import { Ticker } from './Ticker';

const CAPTION: Record<Pressure, string> = {
  nominal: 'You are keeping up. Nobody is waiting on you.',
  strained: 'Barely keeping up. Hiring adds questions, never answers.',
  saturated:
    'More questions arrive than you can answer. Each one waiting is a worker standing still.',
  critical:
    'The floor is blocked on you. Hiring more people makes this worse — delegate or write it down.',
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

  return (
    <section className="attention" aria-label="Attention meter">
      <div className="attention__top">
        <div>
          <div className="label">Questions coming at you</div>
          <div className="attention__figure">
            <Ticker
              className="attention__value"
              value={arriving}
              format={fmtRate}
              flash="none"
            />
            <span className="attention__unit">per second</span>
          </div>
          <p className="attention__caption">{CAPTION[pressure]}</p>
        </div>

        <div className="attention__against">
          <div className="label">You can answer</div>
          <Ticker value={playerAnswerRate} format={fmtRate} flash="none" />
          <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s1)' }}>
            <span className="chip">per second, forever</span>
            {orgCapacity > 0 && (
              <span
                className="chip chip--ok"
                title="Questions per second your managers answer before they reach you"
              >
                managers take {fmtRate(orgCapacity)}/s
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="ratebar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={arriving}
        aria-label={`Questions arriving, ${fmtRate(arriving)} per second against a fixed answer rate of ${fmtRate(playerAnswerRate)} per second`}
      >
        <div className="ratebar__grid" />
        <div className="ratebar__fill" style={{ width: `${fillPct}%` }} />
        {overPct > 0 && (
          <div className="ratebar__over" style={{ left: `${markPct}%`, width: `${overPct}%` }} />
        )}
        <div className="ratebar__mark" style={{ left: `${markPct}%` }} data-label="YOUR LIMIT" />
      </div>

      <div className="blocked">
        <span className="label" style={{ flex: 'none' }}>
          Workers stuck waiting on you
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
