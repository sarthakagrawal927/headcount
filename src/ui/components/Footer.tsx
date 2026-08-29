import type { LogEntry } from '../useGame';
import { fmtCash, fmtClock, fmtInt } from '../format';

const KIND: Record<LogEntry['kind'], string> = {
  hire: 'HIRE',
  sop: 'DOC',
  tenure: 'PROMO',
  incident: 'INCID',
  note: 'LOG',
};

export function Footer({
  log,
  t,
  lifetimeCash,
  answered,
}: {
  log: LogEntry[];
  t: number;
  lifetimeCash: number;
  answered: number;
}) {
  const latest = log[0];
  return (
    <footer className="footer">
      <div className="footer__log">
        {latest && (
          <>
            <span className="footer__time">{fmtClock(latest.t)}</span>
            <span className="footer__kind" data-kind={latest.kind}>
              {KIND[latest.kind]}
            </span>
            <span className="footer__text" key={latest.id}>
              {latest.text}
            </span>
          </>
        )}
      </div>
      <div className="footer__right">
        <span>
          SHIFT <b>{fmtClock(t)}</b>
        </span>
        <span>
          ANSWERED <b>{fmtInt(answered)}</b>
        </span>
        <span>
          LIFETIME <b>{fmtCash(lifetimeCash)}</b>
        </span>
      </div>
    </footer>
  );
}
