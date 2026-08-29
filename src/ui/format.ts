const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Compact number for dense readouts: 1.24K, 9.8M. */
export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  let v = Math.abs(n);
  if (v < 1000) {
    if (v === 0) return '0';
    if (v < 10) return sign + v.toFixed(v < 1 ? digits : 1).replace(/\.0+$/, '');
    return sign + Math.round(v).toString();
  }
  let i = 0;
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000;
    i++;
  }
  return `${sign}${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)}${SUFFIX[i]}`;
}

export function fmtCash(n: number): string {
  return `$${fmtNum(n)}`;
}

export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

/** Rates read to two places until they get big; then compact. */
export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 100) return n.toFixed(2);
  return fmtNum(n);
}

export function fmtPct(frac: number, digits = 0): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

/** In-game seconds as a shift clock. */
export function fmtClock(seconds: number): string {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
