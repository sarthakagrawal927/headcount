/**
 * Adapter: presents the pure simulation core through the mutable, imperative
 * surface the UI wants (`EngineApi` in src/ui/useGame.ts).
 *
 * The core is deliberately pure — `step` takes state and returns state — so
 * that the headless simulator the agent uses for evidence and the live game the
 * player watches are running byte-identical physics. This file is the only
 * place that holds mutable state, and it holds it in exactly one variable.
 */

import type { ContentPack, GameState, Telemetry } from './types.js';
import { createInitialState, manualWork, step, unitCost } from './engine.js';
import { buySop, grantTenure as grantTenureAction, hire as hireAction } from './actions.js';
import { SEED_PACK } from './content.js';

export interface EngineApi {
  readonly content: ContentPack;
  getState(): GameState;
  tick(dt: number): Telemetry;
  work(): void;
  answer(count?: number): number;
  hire(roleId: string): boolean;
  installSop(sopId: string): boolean;
  grantTenure(roleId: string): boolean;
  hireCost(roleId: string): number;
  tenureCost(roleId: string): number | null;
}

export function createEngine(pack: ContentPack = SEED_PACK): EngineApi {
  let state = createInitialState(pack);

  return {
    content: pack,

    getState: () => state,

    tick(dt) {
      const result = step(state, pack, dt);
      state = result.state;
      return result.telemetry;
    },

    work() {
      state = manualWork(state, pack);
    },

    /**
     * A burst of focused attention on top of the steady rate `step` already
     * applies. Clicking is never required — it just lets a player buy back a
     * little headroom by hand, the way the opening beat of the genre works.
     */
    answer(count = 1) {
      const cleared = Math.min(count, state.queue);
      state = {
        ...state,
        queue: state.queue - cleared,
        answered: state.answered + cleared,
      };
      return cleared;
    },

    hire(roleId) {
      const result = hireAction(state, pack, roleId);
      if (!result.ok) return false;
      state = result.state;
      return true;
    },

    installSop(sopId) {
      const result = buySop(state, pack, sopId);
      if (!result.ok) return false;
      state = result.state;
      return true;
    },

    grantTenure(roleId) {
      const result = grantTenureAction(state, pack, roleId);
      if (!result.ok) return false;
      state = result.state;
      return true;
    },

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
