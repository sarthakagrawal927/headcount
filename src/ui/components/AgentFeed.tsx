/**
 * Agent activity — the approval log, live, next to the game it changed.
 *
 * Everything above the seed pack in this game was designed by an agent, proved
 * in simulation, and approved by a human before it landed. This panel is that
 * record while it is still happening: pack version, what the server measured
 * the patch actually doing, and the rationale the approving human read. During
 * a demo you can watch a mechanic appear here and then appear on the floor.
 *
 * It reads the log from the remote engine's existing poll rather than fetching
 * on its own — see `subscribeToPatchLog` in ../remoteEngine.
 */

import { useEffect, useRef, useState } from 'react';
import type { PatchLogEntry } from '../../engine/createEngine';
import { getPatchLog, subscribeToPatchLog } from '../remoteEngine';
import { fmtClock } from '../format';
import '../AgentFeed.css';

/** The agent whose name goes on the changes. Matches src/agent/manifest.ts. */
const DESIGNER = 'headcount-designer';

/** How long an arriving entry stays visibly new. */
const HIGHLIGHT_MS = 5200;

const IconTree = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable={false}
  >
    <circle cx="3.2" cy="12.8" r="1.6" />
    <circle cx="8" cy="8" r="1.6" />
    <circle cx="12.8" cy="3.2" r="1.6" />
    <circle cx="12.8" cy="10.4" r="1.6" />
    <path d="M4.35 11.65 6.85 9.15M9.15 6.85l2.5-2.5M9.2 8.85l2.5 1.1" />
  </svg>
);

const IconBlueprint = ({ size = 28 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable={false}
  >
    <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="0.6" />
    <path d="M1.8 5.8h12.4M5.4 5.8v7.6" />
    <path d="M8 8.4h3.6M8 10.8h2.2" />
  </svg>
);

/** The live approval log, straight off the poll that already runs. */
function usePatchLog(): PatchLogEntry[] {
  const [log, setLog] = useState<PatchLogEntry[]>(getPatchLog);
  useEffect(() => subscribeToPatchLog(setLog), []);
  return log;
}

/**
 * Which entries arrived since the last render.
 *
 * The first delivery is never "new" — otherwise every entry flashes on page
 * load, which trains the eye to ignore the one flash that means something.
 */
function useArrivals(log: PatchLogEntry[]): Set<number> {
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const versions = new Set(log.map((e) => e.version));
    if (seen.current === null) {
      seen.current = versions;
      return;
    }
    const added = [...versions].filter((v) => !seen.current?.has(v));
    seen.current = versions;
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = window.setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [log]);

  return fresh;
}

/**
 * Split a server-computed summary line into subject and change, so a column of
 * them reads as a diff rather than as sentences. Lines look like
 * `clickRevenue: 1 -> 0` or `added role quality_inspector (tier 2)`.
 */
function splitSummary(line: string): { subject: string; rest: string } {
  const scalar = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
  if (scalar) return { subject: scalar[1], rest: scalar[2] };
  const verb = /^(added|removed|role|SOP|tenure)\b\s*(.*)$/i.exec(line);
  if (verb) return { subject: verb[1], rest: verb[2] };
  return { subject: '', rest: line };
}

export function AgentFeed() {
  const log = usePatchLog();
  const fresh = useArrivals(log);
  const entries = [...log].reverse(); // newest first
  const version = log.length ? log[log.length - 1].version : null;

  return (
    <section className="panel agentfeed">
      <div className="panel__head">
        <span className="panel__title">
          <IconTree size={13} />
          Agent activity
        </span>
        <span className="agentfeed__head-right">
          <span className="agentfeed__who num">{DESIGNER}</span>
          {version !== null && <span className="chip chip--ok">PACK v{version}</span>}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="agentfeed__empty">
          <div>
            <IconBlueprint size={30} />
            <h3>No design changes yet</h3>
            <p>
              The designer reads this game over MCP, proves a change in simulation, and asks a human
              before it lands. Approved changes appear here, with what the server measured them
              doing.
            </p>
          </div>
        </div>
      ) : (
        <ol className="agentfeed__list scroll">
          {entries.map((entry, i) => {
            const isNew = fresh.has(entry.version);
            return (
              <li
                className={`patchcard${isNew ? ' patchcard--new' : ''}${i === 0 ? ' patchcard--latest' : ''}`}
                key={`${entry.version}-${entry.at}`}
              >
                <div className="patchcard__meta">
                  <span className="patchcard__version num">v{entry.version}</span>
                  <span className="patchcard__dot" />
                  <span className="patchcard__clock num">{fmtClock(entry.at)}</span>
                  {isNew && <span className="patchcard__new">NEW</span>}
                </div>

                <ul className="patchcard__diff">
                  {entry.summary.map((line, j) => {
                    const { subject, rest } = splitSummary(line);
                    return (
                      <li className="patchcard__change num" key={j}>
                        {subject && <b>{subject}</b>}
                        {rest}
                      </li>
                    );
                  })}
                </ul>

                {entry.note && <p className="patchcard__note">{entry.note}</p>}
              </li>
            );
          })}
        </ol>
      )}

      <div className="agentfeed__foot">
        <span>
          {entries.length === 0
            ? 'Nothing approved this shift'
            : `${entries.length} approved change${entries.length === 1 ? '' : 's'} this shift`}
        </span>
        <span className="agentfeed__foot-note">simulated, then approved, then applied</span>
      </div>
    </section>
  );
}
