import type { ContentPack, GameState, Telemetry } from '../../engine/types';
import type { Pressure } from '../useGame';
import { fmtCash, fmtInt, fmtRate } from '../format';
import { IconMark, IconPause, IconPlay } from '../icons';
import { Ticker } from './Ticker';

const STATUS: Record<Pressure, string> = {
  nominal: 'FLOOR NOMINAL',
  strained: 'ATTENTION STRAINED',
  saturated: 'ATTENTION SATURATED',
  critical: 'FLOOR BLOCKED',
};

export function TopBar({
  state,
  telemetry,
  content,
  pressure,
  span,
  running,
  onToggleRunning,
}: {
  state: GameState;
  telemetry: Telemetry;
  content: ContentPack;
  pressure: Pressure;
  span: { reports: number; capacity: number; load: number } | null;
  running: boolean;
  onToggleRunning: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <IconMark className="brand__mark" size={20} />
        <div>
          <div className="brand__word">HEADCOUNT</div>
          <div className="brand__sub">Operations console</div>
        </div>
      </div>

      <div className="status" role="status">
        <span className="status__lamp" />
        <span className="status__text">{STATUS[pressure]}</span>
      </div>

      <div className="readouts">
        <div className="readout readout--cash">
          <span className="readout__label">Cash</span>
          <Ticker className="readout__value" value={state.cash} format={fmtCash} flash="down" />
        </div>
        <div className="readout">
          <span className="readout__label">Throughput</span>
          <span className="readout__value">
            <Ticker value={telemetry.throughput} format={fmtRate} flash="none" />
            <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}> t/s</span>
          </span>
        </div>
        <div className="readout">
          <span className="readout__label">Headcount</span>
          <Ticker
            className="readout__value"
            value={telemetry.headcountTotal}
            format={fmtInt}
          />
        </div>
        <div className="readout">
          <span className="readout__label">Tasks done</span>
          <Ticker
            className="readout__value"
            value={state.tasksCompleted}
            format={fmtInt}
            flash="none"
          />
        </div>
        <div className="readout readout--defect">
          <span className="readout__label">Defects</span>
          <span className="readout__value">
            <Ticker value={state.defects} format={fmtInt} flash="none" />
            <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              {' '}
              / {fmtInt(content.incidentThreshold)}
            </span>
          </span>
        </div>
        {span && (
          <div className="readout" title="Direct reports against what your supervisory layer can hold">
            <span className="readout__label">Span of control</span>
            <span className="readout__value">
              <span
                className="num"
                style={{ color: span.load > 1 ? 'var(--alarm-hot)' : 'var(--ink)' }}
              >
                {fmtInt(span.reports)}
              </span>
              <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
                {' '}
                / {fmtInt(span.capacity)}
              </span>
            </span>
          </div>
        )}
      </div>

      <button className="hold" data-held={!running} onClick={onToggleRunning}>
        {running ? <IconPause size={12} /> : <IconPlay size={12} />}
        {running ? 'Hold' : 'Held'}
      </button>
    </header>
  );
}
