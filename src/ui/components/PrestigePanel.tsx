import type { ContentPack, GameState } from '../../engine/types';
import type { GameActions } from '../useGame';

/**
 * The reset layer, shown only when one exists.
 *
 * In this game a reset layer is not a feature that ships with the product —
 * it appears when an agent designs one and a human approves it. So the panel
 * is absent by default, and its arrival mid-shift is itself the demonstration.
 */
export function PrestigePanel({
  content,
  state,
  ready,
  actions,
}: {
  content: ContentPack;
  state: GameState;
  ready: number;
  actions: GameActions;
}) {
  const layer = content.prestige;
  if (!layer) return null;

  const multiplier = 1 + state.prestigePoints * layer.bonusPerPoint;
  const canReset = ready > 0;

  return (
    <section className="panel prestige" aria-labelledby="prestige-head">
      <header className="panel__head">
        <h2 id="prestige-head" className="panel__title">
          {layer.currencyName}
        </h2>
        <span className="panel__meta">
          designed by the agent · exponent {layer.exponent}
        </span>
      </header>

      <div className="prestige__body">
        <dl className="prestige__stats">
          <div>
            <dt>Banked</dt>
            <dd className="num">{state.prestigePoints}</dd>
          </div>
          <div>
            <dt>Multiplier</dt>
            <dd className="num">×{multiplier.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Resets</dt>
            <dd className="num">{state.prestigeCount}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="prestige__button"
          disabled={!canReset}
          onClick={() => actions.prestige()}
        >
          {canReset ? `START OVER · +${ready}` : 'NOTHING TO BANK YET'}
        </button>

        <p className="prestige__note">
          {canReset
            ? `Clears the floor, the procedures and the cash. You keep ${state.prestigePoints + ready} ${layer.currencyName.toLowerCase()} and everything they multiply.`
            : 'Earn more before starting over — resetting twice at the same point pays once.'}
        </p>
      </div>
    </section>
  );
}
