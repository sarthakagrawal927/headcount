import { useEffect, useRef, useState } from 'react';

type Flash = 'both' | 'down' | 'none';

interface TickerProps {
  value: number;
  format: (n: number) => string;
  /** Which direction of change gets a colour pulse. */
  flash?: Flash;
  className?: string;
  title?: string;
}

/**
 * A tabular-figure readout that pulses when its rendered text changes.
 * Continuous values (cash, rates) opt out of the up-pulse so the console
 * doesn't strobe; a *decrease* still flashes, because that means you spent.
 */
export function Ticker({ value, format, flash = 'both', className = '', title }: TickerProps) {
  const text = format(value);
  const prevValue = useRef(value);
  const prevText = useRef(text);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (text === prevText.current) return;
    const direction = value > prevValue.current ? 'up' : 'down';
    prevText.current = text;
    prevValue.current = value;
    if (flash === 'none' || (flash === 'down' && direction === 'up')) return;
    setDir(direction);
    const id = window.setTimeout(() => setDir(null), 520);
    return () => window.clearTimeout(id);
  }, [text, value, flash]);

  return (
    <span className={`num ${dir ? `tick--${dir}` : ''} ${className}`} title={title}>
      {text}
    </span>
  );
}
