import type { GameState, Telemetry } from '../../engine/types';
import type { Pressure } from '../useGame';
import { fmtCash, fmtInt, fmtRate } from '../format';
import { IconMark, IconPause, IconPlay } from '../icons';
import { Ticker } from './Ticker';

const STATUS: Record<Pressure, string> = {
  nominal: 'RUNNING SMOOTHLY',
  strained: 'BARELY KEEPING UP',
  saturated: 'YOU ARE THE BOTTLENECK',
  critical: 'FLOOR BLOCKED ON YOU',
};

export function TopBar({
  state,
  telemetry,
  pressure,
  running,
  onToggleRunning,
}: {
  state: GameState;
  telemetry: Telemetry;
  pressure: Pressure;
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
          <span className="readout__label">Team</span>
          <Ticker
            className="readout__value"
            value={telemetry.headcountTotal}
            format={fmtInt}
          />
        </div>
        <div className="readout">
          <span className="readout__label">Output</span>
          <span className="readout__value">
            <Ticker value={telemetry.throughput} format={fmtRate} flash="none" />
            <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}> tasks/s</span>
          </span>
        </div>
      </div>

      <button className="hold" data-held={!running} onClick={onToggleRunning}>
        {running ? <IconPause size={12} /> : <IconPlay size={12} />}
        {running ? 'Hold' : 'Held'}
      </button>
    </header>
  );
}
