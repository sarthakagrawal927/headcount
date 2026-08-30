import { useState } from 'react';
import type { ContentPack, GameState } from '../../engine/types';
import type { GameActions } from '../useGame';
import { TENURE_NAMES } from '../content';
import { fmtCash, fmtInt, fmtPct, fmtRate } from '../format';
import { IconBadge, IconDoc, IconPeople } from '../icons';

type Tab = 'roles' | 'sops' | 'tenure';

function Price({ cost, cash, onBuy, label = 'Hire' }: { cost: number; cash: number; onBuy: () => void; label?: string }) {
  const afford = cash >= cost;
  return (
    <div className="offer__buy">
      <span className="offer__price" data-afford={afford}>
        {fmtCash(cost)}
      </span>
      <button className="btn btn--buy" data-afford={afford} disabled={!afford} onClick={onBuy}>
        {label}
      </button>
    </div>
  );
}

function Progress({ cash, cost }: { cash: number; cost: number }) {
  if (cash >= cost) return null;
  return <span className="offer__progress" style={{ width: `${Math.min(100, (cash / cost) * 100)}%` }} />;
}

export function StorePanel({
  content,
  state,
  actions,
}: {
  content: ContentPack;
  state: GameState;
  actions: GameActions;
}) {
  const [tab, setTab] = useState<Tab>('roles');
  const cash = state.cash;

  const ownedRoles = content.roles.filter((r) => (state.headcount[r.id] ?? 0) > 0);
  const availableSops = content.sops.filter((s) => (state.headcount[s.roleId] ?? 0) > 0);
  const pendingSops = availableSops.filter((s) => !state.sops.includes(s.id)).length;
  const promotable = ownedRoles.filter((r) => actions.tenureCost(r.id) !== null).length;

  return (
    <div className="panel">
      <div className="tabs" role="tablist" aria-label="Spend">
        <button role="tab" aria-selected={tab === 'roles'} className="tab" onClick={() => setTab('roles')}>
          Roles
        </button>
        <button role="tab" aria-selected={tab === 'sops'} className="tab" onClick={() => setTab('sops')}>
          SOPs
          {pendingSops > 0 && <span className="tab__badge">{pendingSops}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'tenure'} className="tab" onClick={() => setTab('tenure')}>
          Tenure
          {promotable > 0 && <span className="tab__badge">{promotable}</span>}
        </button>
      </div>

      {tab === 'roles' && (
        <div className="store scroll">
          {[...content.roles]
            .sort((a, b) => a.baseCost - b.baseCost)
            .map((role, index) => {
            const owned = state.headcount[role.id] ?? 0;
            const cost = actions.hireCost(role.id);
            // The entry-level role is always on the board; you need to be able
            // to see what you're saving for on the very first screen.
            const locked = index > 0 && owned === 0 && state.lifetimeCash < role.baseCost * 0.4;
            const afford = !locked && cash >= cost;
            if (locked) {
              return (
                <article className="offer offer--locked" key={role.id}>
                  <div className="offer__head">
                    <span className="offer__name">{role.name}</span>
                    <span className="offer__owned">
                      opens at {fmtCash(role.baseCost * 0.4)}
                    </span>
                  </div>
                  <Progress cash={state.lifetimeCash} cost={role.baseCost * 0.4} />
                </article>
              );
            }
            return (
              <article className="offer" key={role.id} data-afford={afford}>
                <div className="offer__head">
                  <span className="offer__name">{role.name}</span>
                  <span className="offer__owned">×{fmtInt(owned)}</span>
                </div>
                <p className="offer__blurb">{role.blurb}</p>
                <div className="offer__stats">
                  {role.tier === 1 ? (
                    <>
                      <span className="chip chip--ok">
                        earns {fmtCash(role.revenuePerTask * role.throughput)}/s
                      </span>
                      <span className="chip chip--attn">
                        asks on {fmtPct(role.confusion)} of tasks
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="chip chip--ok">
                        answers {fmtRate(role.answerRate)} q/s for you
                      </span>
                      <span className="chip chip--attn">
                        passes {fmtPct(role.escalateFraction)} up
                      </span>
                    </>
                  )}
                </div>
                <Price cost={cost} cash={cash} onBuy={() => actions.hire(role.id)} />
                <Progress cash={cash} cost={cost} />
              </article>
            );
          })}

          {state.tasksCompleted < 20 && (
            <aside className="briefing">
              <p className="briefing__line">
                <span>1</span> Work the line yourself. Slow, but nobody asks you anything.
              </p>
              <p className="briefing__line">
                <span>2</span> Hire. They produce fast — and every so often they stop and ask.
              </p>
              <p className="briefing__line">
                <span>3</span> You answer {fmtRate(content.playerAnswerRate)} questions a second.
                That number never goes up. Everything else does.
              </p>
            </aside>
          )}
        </div>
      )}

      {tab === 'sops' && (
        <div className="store scroll">
          {availableSops.length === 0 && (
            <div className="queue__empty" style={{ padding: 'var(--s6) var(--s5)' }}>
              <div>
                <IconDoc size={26} />
                <h3>Nothing to document yet</h3>
                <p>
                  A procedure has to be about someone. Hire a role and its SOPs become writable.
                </p>
              </div>
            </div>
          )}
          {availableSops.map((sop) => {
            const installed = state.sops.includes(sop.id);
            const role = content.roles.find((r) => r.id === sop.roleId);
            const afford = !installed && cash >= sop.cost;
            return (
              <article className="offer" key={sop.id} data-afford={afford} data-owned={installed}>
                <div className="offer__head">
                  <span className="offer__name">{sop.name}</span>
                  <span className="offer__owned">{installed ? 'PUBLISHED' : role?.name}</span>
                </div>
                <p className="offer__blurb">{sop.blurb}</p>
                <div className="offer__stats">
                  <span className="chip chip--ok">
                    {fmtPct(1 - sop.confusionMultiplier)} fewer questions
                  </span>
                </div>
                {!installed && (
                  <>
                    <Price cost={sop.cost} cash={cash} onBuy={() => actions.installSop(sop.id)} label="Write" />
                    <Progress cash={cash} cost={sop.cost} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'tenure' && (
        <div className="store scroll">
          <article className="offer" data-owned="true">
            <div className="offer__head">
              <span className="offer__name">Defect debt</span>
              <span className="offer__owned">
                {fmtInt(state.defects)} / {fmtInt(content.incidentThreshold)}
              </span>
            </div>
            <p className="offer__blurb">
              Tenured workers stop asking and start guessing. Guesses that miss are silent until
              they aren&rsquo;t. At threshold, an incident review takes a rung back from everyone.
            </p>
            <div className="ladder" aria-hidden="true">
              {Array.from({ length: 20 }, (_, i) => (
                <span
                  key={i}
                  className="rung"
                  data-on={i < Math.round((state.defects / content.incidentThreshold) * 20)}
                  style={
                    i < Math.round((state.defects / content.incidentThreshold) * 20)
                      ? { background: 'var(--alarm)' }
                      : undefined
                  }
                />
              ))}
            </div>
            {state.incidents > 0 && (
              <div className="offer__stats">
                <span className="chip chip--alarm">{state.incidents} incidents to date</span>
              </div>
            )}
          </article>

          {ownedRoles.length === 0 && (
            <div className="queue__empty" style={{ padding: 'var(--s6) var(--s5)' }}>
              <div>
                <IconBadge size={26} />
                <h3>No one has any tenure</h3>
                <p>Nobody has been here long enough to be trusted. Hire first.</p>
              </div>
            </div>
          )}

          {ownedRoles.map((role) => {
            const rung = state.tenure[role.id] ?? 0;
            const cost = actions.tenureCost(role.id);
            const next = content.tenureLadder[rung + 1];
            const afford = cost !== null && cash >= cost;
            return (
              <article className="offer" key={role.id} data-afford={afford}>
                <div className="offer__head">
                  <span className="offer__name">{role.name}</span>
                  <span className="offer__owned">{TENURE_NAMES[rung] ?? `Rung ${rung}`}</span>
                </div>
                <div className="ladder" aria-hidden="true">
                  {content.tenureLadder.map((_, i) => (
                    <span key={i} className="rung" data-on={i <= rung} />
                  ))}
                </div>
                {next ? (
                  <>
                    <div className="offer__stats">
                      <span className="chip chip--ok">
                        escalation ×{next.escalationMultiplier.toFixed(2)}
                      </span>
                      <span className="chip chip--alarm">
                        {fmtPct(next.errorRate, 1)} silent defects
                      </span>
                    </div>
                    <Price cost={cost as number} cash={cash} onBuy={() => actions.grantTenure(role.id)} label="Promote" />
                    <Progress cash={cash} cost={cost as number} />
                  </>
                ) : (
                  <p className="offer__locked">Top of the ladder. They do not ask anymore.</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="panel__head" style={{ borderTop: '1px solid var(--rule-soft)', borderBottom: 'none' }}>
        <span className="panel__title">
          <IconPeople size={13} />
          {tab === 'roles' ? 'Costs grow geometrically' : tab === 'sops' ? 'Written once, applies forever' : 'Trust has a defect rate'}
        </span>
      </div>
    </div>
  );
}
