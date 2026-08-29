import { useEffect, useRef, useState } from 'react';
import type { Sample } from '../useGame';
import { fmtRate } from '../format';
import { IconPulse } from '../icons';

const H = 108;
const PAD_T = 8;
const PAD_B = 10;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function path(values: number[], width: number, max: number, close: boolean) {
  if (values.length < 2 || width <= 0) return '';
  const span = H - PAD_T - PAD_B;
  const step = width / (values.length - 1);
  const y = (v: number) => PAD_T + span - (Math.min(v, max) / max) * span;
  let d = `M0 ${y(values[0]).toFixed(2)}`;
  for (let i = 1; i < values.length; i++) {
    d += ` L${(i * step).toFixed(2)} ${y(values[i]).toFixed(2)}`;
  }
  if (close) d += ` L${width.toFixed(2)} ${H - PAD_B} L0 ${H - PAD_B} Z`;
  return d;
}

export function ThroughputChart({
  history,
  answerRate,
}: {
  history: Sample[];
  answerRate: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();

  const throughput = history.map((s) => s.throughput);
  const escalation = history.map((s) => s.escalationRate);
  const tMax = Math.max(0.001, ...throughput) * 1.15;
  const eMax = Math.max(0.001, answerRate, ...escalation) * 1.15;
  const span = H - PAD_T - PAD_B;
  const ceilingY = PAD_T + span - (answerRate / eMax) * span;
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const hasSignal = history.length >= 2 && history.some((s) => s.throughput > 0 || s.escalationRate > 0);

  return (
    <div className="chart">
      <div className="chart__head">
        <span className="panel__title">
          <IconPulse size={13} />
          Floor telemetry · last 40s
        </span>
        <div className="legend">
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: 'var(--ok)' }} />
            Tasks {latest ? fmtRate(latest.throughput) : '0.00'}/s
          </span>
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: 'var(--attn)' }} />
            Escalations {latest ? fmtRate(latest.escalationRate) : '0.00'}/s
          </span>
          <span className="legend__item">
            <span
              className="legend__swatch"
              style={{ background: 'var(--ink-faint)', height: 0, borderTop: '2px dashed var(--ink-faint)' }}
            />
            Your ceiling {fmtRate(answerRate)}/s
          </span>
        </div>
      </div>

      <div ref={ref}>
        {!hasSignal ? (
          <div className="chart__empty">No production on the floor. Nothing to plot yet.</div>
        ) : (
          <svg className="chart__svg" viewBox={`0 0 ${Math.max(1, width)} ${H}`} role="img" aria-label="Throughput and escalation rate over the last forty seconds">
            <defs>
              <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={width}
                y1={PAD_T + span * f}
                y2={PAD_T + span * f}
                stroke="var(--rule-soft)"
                strokeDasharray="2 4"
              />
            ))}
            <line x1={0} x2={width} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--rule)" />

            <path d={path(throughput, width, tMax, true)} fill="url(#tp-fill)" />
            <path
              d={path(throughput, width, tMax, false)}
              fill="none"
              stroke="var(--ok)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />

            <line
              x1={0}
              x2={width}
              y1={ceilingY}
              y2={ceilingY}
              stroke="var(--ink-faint)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <path
              d={path(escalation, width, eMax, false)}
              fill="none"
              stroke="var(--attn)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
