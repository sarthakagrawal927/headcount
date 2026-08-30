import type { ContentPack, GameState, Role } from '../../engine/types';
import { TENURE_NAMES } from '../content';
import { fmtInt, fmtPct, fmtRate } from '../format';
import { IconOrg } from '../icons';

/**
 * Questions per second raised by the floor, after written procedures.
 *
 * Display arithmetic only — the engine owns the truth, and this deliberately
 * ignores tenure and coordination so the number reads as "what the floor asks",
 * not "what reaches you". The gap between this figure and the one at the top
 * of the chart is the org doing its job, which is the entire point of the
 * diagram.
 */
function raisedPerSecond(content: ContentPack, state: GameState): number {
  return content.roles
    .filter((r) => r.tier === 1)
    .reduce((sum, role) => {
      const owned = state.headcount[role.id] ?? 0;
      if (!owned) return sum;
      const sopMult = content.sops
        .filter((s) => s.roleId === role.id && state.sops.includes(s.id))
        .reduce((acc, s) => acc * s.confusionMultiplier, 1);
      return sum + owned * role.throughput * role.confusion * sopMult;
    }, 0);
}

/** Questions per second the tiers above the floor can absorb. */
function absorbedPerSecond(content: ContentPack, state: GameState): number {
  return content.roles
    .filter((r) => r.tier >= 2)
    .reduce((sum, r) => sum + (state.headcount[r.id] ?? 0) * r.answerRate, 0);
}

/** The connector between tiers: where questions go, and how many. */
function Flow({ label, rate, alarm }: { label: string; rate: number; alarm?: boolean }) {
  return (
    <div className={`orgflow${alarm ? ' orgflow--alarm' : ''}`} aria-hidden="true">
      <span className="orgflow__arrow" />
      <span className="orgflow__text">
        {label} <b>{fmtRate(rate)} q/s</b>
      </span>
    </div>
  );
}

const MAX_GLYPHS = 44;

function Units({ n, blocked, tier }: { n: number; blocked: number; tier: number }) {
  const shown = Math.min(n, MAX_GLYPHS);
  return (
    <div className="orgnode__units" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className={`unit ${tier > 1 ? 'unit--sup' : i < blocked ? 'unit--blocked' : ''}`}
        />
      ))}
      {n > shown && <span className="orgnode__more">+{fmtInt(n - shown)}</span>}
    </div>
  );
}

function RoleNode({
  role,
  count,
  tenure,
  blockedFraction,
  sopCount,
}: {
  role: Role;
  count: number;
  tenure: number;
  blockedFraction: number;
  sopCount: number;
}) {
  const blocked = role.tier === 1 ? Math.round(blockedFraction * count) : 0;
  return (
    <article className="orgnode">
      <div className="orgnode__head">
        <span className="orgnode__name">{role.name}</span>
        <span className="orgnode__count">×{fmtInt(count)}</span>
      </div>
      <Units n={count} blocked={blocked} tier={role.tier} />
      <div className="orgnode__stats">
        {role.tier === 1 ? (
          <>
            <span className="chip chip--ok" title="Tasks per second at full attention">
              {fmtRate(count * role.throughput)} t/s
            </span>
            <span className="chip chip--attn" title="Questions raised per second">
              {fmtRate(count * role.throughput * role.confusion)} q/s
            </span>
          </>
        ) : (
          <>
            <span className="chip chip--ok" title="Questions absorbed per second">
              absorbs {fmtRate(count * role.answerRate)}/s
            </span>
            <span className="chip chip--attn" title="Share of absorbed questions kicked upward">
              passes {fmtPct(role.escalateFraction)} up
            </span>
          </>
        )}
        {sopCount > 0 && <span className="chip">{sopCount} SOP</span>}
        {tenure > 0 && <span className="chip">{TENURE_NAMES[tenure] ?? `T${tenure}`}</span>}
        {blocked > 0 && <span className="chip chip--alarm">{fmtInt(blocked)} blocked</span>}
      </div>
    </article>
  );
}

export function OrgChart({
  content,
  state,
  blockedFraction,
  answered,
}: {
  content: ContentPack;
  state: GameState;
  blockedFraction: number;
  answered: number;
}) {
  const hiredAt = (tier: number) =>
    content.roles.some((r) => r.tier === tier && (state.headcount[r.id] ?? 0) > 0);
  // The chart shows the org as it actually exists, plus the floor, which is
  // always drawn even when empty — that emptiness is the opening beat.
  const tiers = [...new Set(content.roles.map((r) => r.tier))]
    .sort((a, b) => b - a)
    .filter((tier) => tier === 1 || hiredAt(tier) || (tier === 2 && hiredAt(1)));
  const sopsFor = (roleId: string) =>
    state.sops.filter((id) => content.sops.find((s) => s.id === id)?.roleId === roleId).length;

  const raised = raisedPerSecond(content, state);
  const reaching = Math.max(0, raised - Math.min(absorbedPerSecond(content, state), raised));

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">
          <IconOrg size={13} />
          Org chart
        </span>
        <span className="panel__meta">
          {fmtInt(content.roles.reduce((s, r) => s + (state.headcount[r.id] ?? 0), 0))} on the books
        </span>
      </div>

      <div className="org scroll">
        <div className="orgtier">
          <span className="orgtier__spine" />
          <span className="orgtier__label">YOU</span>
          <div className="orgtier__groups">
            <article className="orgnode orgnode--you">
              <div className="orgnode__head">
                <span className="orgnode__name">Owner / Operator</span>
                <span className="orgnode__count">×1</span>
              </div>
              <div className="orgnode__stats">
                <span className="chip chip--ok">{fmtRate(content.playerAnswerRate)} answers/s</span>
                <span className="chip">{fmtInt(answered)} answered</span>
                {state.incidents > 0 && (
                  <span className="chip chip--alarm">{state.incidents} incidents</span>
                )}
              </div>
            </article>
          </div>
        </div>

        <Flow
          label="questions reaching you ·"
          rate={reaching}
          alarm={reaching > content.playerAnswerRate}
        />

        {tiers.map((tier, idx) => {
          const roles = content.roles.filter((r) => r.tier === tier);
          const hired = roles.filter((r) => (state.headcount[r.id] ?? 0) > 0);
          return (
            <div className="orgtier-block" key={tier}>
            {tier === 1 && idx > 0 && (
              <Flow label="asked by the floor ·" rate={raised} />
            )}
            <div className="orgtier">
              <span className="orgtier__spine" />
              <span className="orgtier__label">
                {tier > 1 ? `TIER ${tier}` : 'FLOOR'}
              </span>
              <div className="orgtier__groups">
                {hired.length === 0 ? (
                  <article className="orgnode orgnode--empty">
                    <div className="orgnode__head">
                      <span className="orgnode__name">
                        {tier > 1 ? 'No supervision at this tier' : 'Nobody on the floor'}
                      </span>
                    </div>
                    <p className="offer__blurb" style={{ marginTop: 'var(--s2)' }}>
                      {tier > 1
                        ? 'Every question from below reaches you unfiltered.'
                        : 'You are the only one hammering.'}
                    </p>
                  </article>
                ) : (
                  hired.map((role) => (
                    <RoleNode
                      key={role.id}
                      role={role}
                      count={state.headcount[role.id] ?? 0}
                      tenure={state.tenure[role.id] ?? 0}
                      blockedFraction={blockedFraction}
                      sopCount={sopsFor(role.id)}
                    />
                  ))
                )}
              </div>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
