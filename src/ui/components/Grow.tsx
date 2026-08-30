import { Badge, Button, Card, Group, Paper, Progress, Stack, Tabs, Text } from '@mantine/core';
import type { ContentPack, GameState } from '../../engine/types';
import type { GameActions } from '../useGame';
import { TENURE_NAMES } from '../content';
import { fmtCash, fmtInt, fmtPct, fmtRate } from '../format';

/** A purchasable row: name + facts on the left, the price as the button. */
function Offer({
  name,
  meta,
  blurb,
  facts,
  cost,
  cash,
  cta,
  onBuy,
}: {
  name: string;
  meta?: string;
  blurb?: string;
  facts: { text: string; color?: string }[];
  cost: number;
  cash: number;
  cta?: string;
  onBuy: () => void;
}) {
  const afford = cash >= cost;
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={600}>
              {name}
            </Text>
            {meta && (
              <Badge size="sm" variant="default" className="num">
                {meta}
              </Badge>
            )}
          </Group>
          {blurb && (
            <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
              {blurb}
            </Text>
          )}
          <Group gap="sm" mt={4}>
            {facts.map((f, i) => (
              <Text key={i} size="xs" c={f.color ?? 'dimmed'} className="num">
                {f.text}
              </Text>
            ))}
          </Group>
        </div>
        <Button
          size="xs"
          variant={afford ? 'filled' : 'default'}
          disabled={!afford}
          onClick={onBuy}
          miw={72}
          className="num"
        >
          {cta ? `${cta} ${fmtCash(cost)}` : fmtCash(cost)}
        </Button>
      </Group>
      {!afford && <Progress value={Math.min(100, (cash / cost) * 100)} size={3} mt={8} color="dark.3" />}
    </Paper>
  );
}

/** Hiring, procedures, promotions — every way to grow, one panel. */
export function Grow({
  content,
  state,
  prestigeReady,
  actions,
}: {
  content: ContentPack;
  state: GameState;
  prestigeReady: number;
  actions: GameActions;
}) {
  const cash = state.cash;
  const ownedRoles = content.roles.filter((r) => (state.headcount[r.id] ?? 0) > 0);
  const availableSops = content.sops.filter((s) => (state.headcount[s.roleId] ?? 0) > 0);
  const pendingSops = availableSops.filter((s) => !state.sops.includes(s.id)).length;
  const promotable = ownedRoles.filter((r) => actions.tenureCost(r.id) !== null).length;
  const prestige = content.prestige;

  return (
    <Card withBorder padding="lg">
      <Text fw={600} mb="sm">
        Grow the company
      </Text>
      <Tabs defaultValue="hire" keepMounted={false}>
        <Tabs.List grow mb="sm">
          <Tabs.Tab value="hire">Hire</Tabs.Tab>
          <Tabs.Tab
            value="sops"
            rightSection={pendingSops > 0 ? <Badge size="xs" circle variant="default">{pendingSops}</Badge> : null}
          >
            SOPs
          </Tabs.Tab>
          <Tabs.Tab
            value="promote"
            rightSection={promotable > 0 ? <Badge size="xs" circle variant="default">{promotable}</Badge> : null}
          >
            Promote
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="hire">
          <Stack gap="xs">
            {[...content.roles]
              .sort((a, b) => a.baseCost - b.baseCost)
              .map((role, index) => {
                const owned = state.headcount[role.id] ?? 0;
                const locked =
                  index > 0 && owned === 0 && state.lifetimeCash < role.baseCost * 0.4;
                if (locked) {
                  return (
                    <Paper key={role.id} withBorder p="sm" radius="md" opacity={0.55}>
                      <Group justify="space-between">
                        <Text size="sm" fw={600}>
                          {role.name}
                        </Text>
                        <Text size="xs" c="dimmed" className="num">
                          opens at {fmtCash(role.baseCost * 0.4)}
                        </Text>
                      </Group>
                    </Paper>
                  );
                }
                const facts =
                  role.tier === 1
                    ? [
                        {
                          text: `earns ${fmtCash(role.revenuePerTask * role.throughput)}/s`,
                          color: 'green.4',
                        },
                        { text: `asks on ${fmtPct(role.confusion)} of tasks`, color: 'yellow.4' },
                      ]
                    : [
                        { text: `answers ${fmtRate(role.answerRate)} q/s for you`, color: 'green.4' },
                        { text: `passes ${fmtPct(role.escalateFraction)} up`, color: 'yellow.4' },
                      ];
                return (
                  <Offer
                    key={role.id}
                    name={role.name}
                    meta={owned > 0 ? `×${fmtInt(owned)}` : undefined}
                    blurb={role.blurb}
                    facts={facts}
                    cost={actions.hireCost(role.id)}
                    cash={cash}
                    onBuy={() => actions.hire(role.id)}
                  />
                );
              })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="sops">
          <Stack gap="xs">
            {availableSops.length === 0 && (
              <Text size="sm" c="dimmed" py="sm">
                A procedure has to be about someone. Hire a role and its SOPs open up here — each
                one permanently cuts how often that role asks.
              </Text>
            )}
            {availableSops.map((sop) => {
              const installed = state.sops.includes(sop.id);
              const role = content.roles.find((r) => r.id === sop.roleId);
              if (installed) {
                return (
                  <Paper key={sop.id} withBorder p="sm" radius="md">
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>
                        {sop.name}
                      </Text>
                      <Badge variant="light" color="green" size="sm">
                        published
                      </Badge>
                    </Group>
                  </Paper>
                );
              }
              return (
                <Offer
                  key={sop.id}
                  name={sop.name}
                  meta={role?.name}
                  blurb={sop.blurb}
                  facts={[
                    {
                      text: `${fmtPct(1 - sop.confusionMultiplier)} fewer questions`,
                      color: 'green.4',
                    },
                  ]}
                  cost={sop.cost}
                  cash={cash}
                  onBuy={() => actions.installSop(sop.id)}
                />
              );
            })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="promote">
          <Stack gap="xs">
            <Paper withBorder p="sm" radius="md">
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>
                  Defect debt
                </Text>
                <Text size="xs" c="dimmed" className="num">
                  {fmtInt(state.defects)} / {fmtInt(content.incidentThreshold)}
                </Text>
              </Group>
              <Progress
                value={(state.defects / content.incidentThreshold) * 100}
                color="red.6"
                size="sm"
              />
              <Text size="xs" c="dimmed" mt={6}>
                Promoted workers stop asking and start guessing. Wrong guesses are silent until the
                threshold — then an incident review demotes everyone a rung.
              </Text>
            </Paper>
            {ownedRoles.length === 0 && (
              <Text size="sm" c="dimmed" py="sm">
                Nobody has been here long enough to be trusted. Hire first.
              </Text>
            )}
            {ownedRoles.map((role) => {
              const rung = state.tenure[role.id] ?? 0;
              const cost = actions.tenureCost(role.id);
              const next = content.tenureLadder[rung + 1];
              if (cost === null || !next) {
                return (
                  <Paper key={role.id} withBorder p="sm" radius="md">
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>
                        {role.name}
                      </Text>
                      <Badge variant="default" size="sm">
                        {TENURE_NAMES[rung] ?? `rung ${rung}`} · top
                      </Badge>
                    </Group>
                  </Paper>
                );
              }
              return (
                <Offer
                  key={role.id}
                  name={role.name}
                  meta={TENURE_NAMES[rung] ?? `rung ${rung}`}
                  facts={[
                    {
                      text: `asks ${fmtPct(1 - next.escalationMultiplier)} less`,
                      color: 'green.4',
                    },
                    { text: `${fmtPct(next.errorRate, 1)} silent defects`, color: 'red.4' },
                  ]}
                  cost={cost}
                  cash={cash}
                  cta="Promote"
                  onBuy={() => actions.grantTenure(role.id)}
                />
              );
            })}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {prestige && (
        <Paper withBorder p="sm" radius="md" mt="sm">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="sm" fw={600}>
                {prestige.currencyName}
              </Text>
              <Text size="xs" c="dimmed" className="num">
                banked {fmtInt(state.prestigePoints)} · ×
                {(1 + state.prestigePoints * prestige.bonusPerPoint).toFixed(2)} to everything
              </Text>
            </div>
            <Button
              size="xs"
              color="violet"
              variant={prestigeReady > 0 ? 'filled' : 'default'}
              disabled={prestigeReady <= 0}
              onClick={() => actions.prestige()}
            >
              {prestigeReady > 0 ? `Start over · +${fmtInt(prestigeReady)}` : 'Nothing to bank'}
            </Button>
          </Group>
        </Paper>
      )}
    </Card>
  );
}
