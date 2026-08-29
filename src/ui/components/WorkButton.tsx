import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtCash } from '../format';
import { IconHammer } from '../icons';

/**
 * The opening beat. Before there is anyone to ask you anything, there is
 * only this. Space bar is bound to it so the first minute feels physical.
 */
export function WorkButton({
  clickRevenue,
  showHint,
  onWork,
}: {
  clickRevenue: number;
  showHint: boolean;
  onWork: () => void;
}) {
  const [hit, setHit] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const strike = useCallback(() => {
    onWork();
    setHit(false);
    // force the flash keyframe to restart
    requestAnimationFrame(() => setHit(true));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHit(false), 320);
  }, [onWork]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      e.preventDefault();
      strike();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, [strike]);

  return (
    <button className="work" data-hit={hit} onClick={strike}>
      <span className="work__flash" />
      {showHint && <span className="work__hint" />}
      <span className="work__label">
        <IconHammer size={15} />
        WORK THE LINE
      </span>
      <span className="work__sub">
        one task, by your own hand · {fmtCash(clickRevenue)} · no questions
      </span>
      <span className="work__key">SPACE</span>
    </button>
  );
}
