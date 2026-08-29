/**
 * Purchases. Every mutation of the workforce goes through here so that the
 * live game and the headless simulator can never drift apart in their rules.
 */

import type { ContentPack, GameState } from './types.js';
import { unitCost } from './engine.js';

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

export function hire(
  state: GameState,
  pack: ContentPack,
  roleId: string,
): ActionResult {
  const role = pack.roles.find((r) => r.id === roleId);
  if (!role) return { ok: false, reason: `no such role: ${roleId}` };

  const owned = state.headcount[roleId] ?? 0;
  const cost = unitCost(role, owned);
  if (state.cash < cost) return { ok: false, reason: 'insufficient cash' };

  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - cost,
      headcount: { ...state.headcount, [roleId]: owned + 1 },
    },
  };
}

/** Install a written procedure — the cheapest lasting cut to escalations. */
export function buySop(
  state: GameState,
  pack: ContentPack,
  sopId: string,
): ActionResult {
  const sop = pack.sops.find((s) => s.id === sopId);
  if (!sop) return { ok: false, reason: `no such SOP: ${sopId}` };
  if (state.sops.includes(sopId)) return { ok: false, reason: 'already installed' };
  if (state.cash < sop.cost) return { ok: false, reason: 'insufficient cash' };

  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - sop.cost,
      sops: [...state.sops, sopId],
    },
  };
}

/**
 * Promote a role up the tenure ladder: it stops asking, and starts making
 * mistakes nobody catches. Autonomy is not free, it is financed by risk.
 */
export function grantTenure(
  state: GameState,
  pack: ContentPack,
  roleId: string,
): ActionResult {
  const role = pack.roles.find((r) => r.id === roleId);
  if (!role) return { ok: false, reason: `no such role: ${roleId}` };

  const level = state.tenure[roleId] ?? 0;
  const nextLevel = level + 1;
  if (nextLevel >= pack.tenureLadder.length) {
    return { ok: false, reason: 'already fully tenured' };
  }

  const cost = pack.tenureLadder[nextLevel].cost;
  if (state.cash < cost) return { ok: false, reason: 'insufficient cash' };

  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - cost,
      tenure: { ...state.tenure, [roleId]: nextLevel },
    },
  };
}
