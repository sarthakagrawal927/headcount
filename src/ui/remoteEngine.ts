/**
 * An EngineApi backed by the live game running inside the MCP server.
 *
 * With this in place the operations console and the agent are looking at the
 * same company. The player hires and answers questions here; the agent
 * redesigns the rules underneath them through MCP, and an approved patch
 * changes the console mid-shift. Neither side is viewing a private copy, which
 * is the only version of this worth demonstrating.
 *
 * Authority lives on the server. The client keeps a mirror and advances it
 * locally between polls purely so the numbers move smoothly at frame rate;
 * every poll snaps the mirror back to the truth. Actions are sent to the
 * server and the response is authoritative — there is no optimistic local
 * bookkeeping to drift out of sync.
 */

import type { ContentPack, GameState } from '../engine/types';
import { createInitialState, step, unitCost } from '../engine/engine';
import type { EngineApi, PatchLogEntry } from '../engine/createEngine';

const BASE = import.meta.env.VITE_GAME_URL ?? 'http://localhost:3001';
const POLL_MS = 500;

/**
 * The approval log, held at module scope.
 *
 * It rides along on the poll that already runs twice a second — a second
 * fetcher for the same endpoint would be one more thing to keep in step. The
 * engine exposes it through `getPatchLog()` for anything holding an engine;
 * the activity feed subscribes here instead, because it renders beside the
 * game rather than inside it and never needs the rest of the surface.
 */
let patchLog: PatchLogEntry[] = [];
const listeners = new Set<(log: PatchLogEntry[]) => void>();

export function getPatchLog(): PatchLogEntry[] {
  return patchLog;
}

/** Subscribe to approved design changes. Fires immediately with what we have. */
export function subscribeToPatchLog(fn: (log: PatchLogEntry[]) => void): () => void {
  listeners.add(fn);
  fn(patchLog);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Publish only when the log actually grew or a version changed. The poll runs
 * at 2Hz and the log changes perhaps once a minute; re-rendering the feed on
 * every poll would restart the arrival highlight over and over.
 */
function setPatchLog(next: PatchLogEntry[] | undefined): void {
  if (!Array.isArray(next)) return;
  const unchanged =
    next.length === patchLog.length &&
    next.every((entry, i) => entry.version === patchLog[i]?.version && entry.at === patchLog[i]?.at);
  if (unchanged) return;
  patchLog = next;
  for (const fn of listeners) fn(patchLog);
}

export function createRemoteEngine(seed: ContentPack): EngineApi {
  let pack = seed;
  let state = createInitialState(seed);
  let connected = false;

  const refresh = async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}/game`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        state: GameState;
        pack: ContentPack;
        patchLog?: PatchLogEntry[];
      };
      if (data.pack) pack = data.pack;
      if (data.state) state = data.state;
      setPatchLog(data.patchLog);
      connected = true;
    } catch {
      // The server may not be up yet, or may be restarting after a patch.
      // Keep rendering the last known company rather than blanking the console.
      connected = false;
    }
  };

  void refresh();
  setInterval(() => void refresh(), POLL_MS);

  const send = (body: Record<string, unknown>): boolean => {
    if (!connected) return false;
    void fetch(`${BASE}/game/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { state?: GameState };
        if (data.state) state = data.state;
      })
      .catch(() => undefined);
    return true;
  };

  return {
    // A getter, not a snapshot: when the agent's patch is approved the pack
    // changes underneath the console and the UI must follow it.
    get content(): ContentPack {
      return pack;
    },

    getState: () => state,

    getPatchLog: () => patchLog,

    tick(dt) {
      // Local interpolation only. The next poll overwrites this.
      const result = step(state, pack, dt);
      state = result.state;
      return result.telemetry;
    },

    work() {
      send({ type: 'work' });
    },

    answer(count = 1) {
      const cleared = Math.min(count, state.queue);
      send({ type: 'answer', count });
      return cleared;
    },

    hire: (roleId) => send({ type: 'hire', id: roleId }),
    installSop: (sopId) => send({ type: 'sop', id: sopId }),
    grantTenure: (roleId) => send({ type: 'tenure', id: roleId }),

    hireCost(roleId) {
      const role = pack.roles.find((r) => r.id === roleId);
      if (!role) return Infinity;
      return unitCost(role, state.headcount[roleId] ?? 0);
    },

    tenureCost(roleId) {
      const level = state.tenure[roleId] ?? 0;
      const next = level + 1;
      if (next >= pack.tenureLadder.length) return null;
      return pack.tenureLadder[next].cost;
    },
  };
}
