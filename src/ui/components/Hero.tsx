import { Button, Card, Group, RingProgress, Stack, Text } from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import type { ContentPack, Telemetry } from '../../engine/types';
import type { Pressure, Sample } from '../useGame';
import { fmtCash, fmtInt, fmtPct, fmtRate } from '../format';

const CAPTION: Record<Pressure, string> = {
  nominal: 'You are keeping up. Nobody is waiting on you.',
  strained: 'Barely keeping up. Hiring adds questions, never answers.',
  saturated:
    'More questions arrive than you can answer. Each one waiting is a worker standing still.',
  critical:
    'The floor is blocked on you. More people makes this worse — delegate, or write it down.',
};

/** One step of the money → questions → you pipeline. */
function Step({
  label,
  value,
  unit,
  sub,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" lts="0.06em">
        {label}
      </Text>
      <Group gap={6} align="baseline" wrap="nowrap">
        <Text size="1.9rem" fw={600} ff="monospace" c={color} className="num" lh={1.15}>
          {value}
        </Text>
        {unit && (
          <Text size="sm" c="dimmed">
            {unit}
          </Text>
        )}
      </Group>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <Text size="xl" c="dark.3" aria-hidden mt={20}>
      →
    </Text>
  );
}

/**
 * The one card that teaches the game: work becomes questions, questions
 * outrun your fixed attention, waiting workers stop earning. Everything else
 * on the screen is a response to this card.
 */
export function Hero({
  telemetry,
  history,
  content,
  pressure,
  onWork,
}: {
  telemetry: Telemetry;
  history: Sample[];
  content: ContentPack;
  pressure: Pressure;
  onWork: () => void;
}) {
  const answerRate = content.playerAnswerRate;
  const working = 1 - telemetry.blockedFraction;
  const empty = telemetry.headcountTotal === 0;

  const data = history.map((s) => ({
    t: s.t,
    tasks: Number(s.throughput.toFixed(2)),
    questions: Number(s.escalationRate.toFixed(2)),
  }));

  return (
    <Card withBorder padding="lg">
      {empty ? (
        <Stack align="center" gap="sm" py="xl">
          <Text size="lg" fw={600}>
            It is just you on the floor.
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={420}>
            Work the line yourself — slow, but nobody asks you anything. Save up{' '}
            {fmtCash(content.roles[0]?.baseCost ?? 25)} and hire your first worker on the right.
          </Text>
          <Button size="lg" onClick={onWork}>
            Work the line — press Space
          </Button>
        </Stack>
      ) : (
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Group gap="lg" wrap="wrap">
              <Step
                label="Your team makes"
                value={fmtRate(telemetry.throughput)}
                unit="tasks/s"
                sub={`${fmtInt(telemetry.headcountTotal)} people on the floor`}
              />
              <Arrow />
              <Step
                label="They ask you"
                value={fmtRate(telemetry.escalationRate)}
                unit="questions/s"
                color={telemetry.escalationRate > answerRate ? 'red.4' : 'yellow.4'}
              />
              <Arrow />
              <Step
                label="You can answer"
                value={fmtRate(answerRate)}
                unit="per second"
                sub="fixed. forever."
                color="green.4"
              />
            </Group>

            <RingProgress
              size={110}
              thickness={10}
              roundCaps
              sections={[{ value: working * 100, color: pressure === 'critical' ? 'red.6' : 'green.5' }]}
              label={
                <div style={{ textAlign: 'center' }}>
                  <Text size="lg" fw={600} ff="monospace" className="num" lh={1}>
                    {fmtPct(working)}
                  </Text>
                  <Text size="10px" c="dimmed" tt="uppercase">
                    working
                  </Text>
                </div>
              }
            />
          </Group>

          <Text size="sm" c={pressure === 'nominal' ? 'dimmed' : pressure === 'strained' ? 'yellow.4' : 'red.4'}>
            {CAPTION[pressure]}
            {telemetry.blockedFraction > 0 &&
              ` ${fmtPct(telemetry.blockedFraction)} of your team is stuck waiting on you right now.`}
          </Text>

          <AreaChart
            h={100}
            data={data}
            dataKey="t"
            series={[
              { name: 'tasks', label: 'Tasks/s', color: 'green.5' },
              { name: 'questions', label: 'Questions/s', color: 'yellow.6' },
            ]}
            curveType="monotone"
            withDots={false}
            withXAxis={false}
            withYAxis={false}
            gridAxis="none"
            fillOpacity={0.12}
            referenceLines={[
              { y: answerRate, label: 'your limit', color: 'red.6' },
            ]}
          />
        </Stack>
      )}
    </Card>
  );
}
