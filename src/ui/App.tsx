import { useEffect } from 'react';
import { Badge, Button, Container, Grid, Group, Stack, Text } from '@mantine/core';
import { useGame, type Pressure } from './useGame';
import { Designer } from './components/Designer';
import { Grow } from './components/Grow';
import { Hero } from './components/Hero';
import { Questions } from './components/Questions';
import { fmtCash, fmtClock, fmtInt, fmtRate } from './format';

const STATUS: Record<Pressure, { text: string; color: string }> = {
  nominal: { text: 'Running smoothly', color: 'teal' },
  strained: { text: 'Barely keeping up', color: 'yellow' },
  saturated: { text: 'You are the bottleneck', color: 'orange' },
  critical: { text: 'Floor blocked on you', color: 'red' },
};

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" lts="0.06em">
        {label}
      </Text>
      <Text fw={600} ff="monospace" c={color} className="num">
        {value}
      </Text>
    </div>
  );
}

export function App() {
  const game = useGame();
  const { actions } = game;
  const status = STATUS[game.pressure];

  // Two shortcuts: A answers the oldest question, Space works the line.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'a' || e.key === 'A') actions.answer();
      if (e.code === 'Space' && !e.repeat && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        actions.work();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const lastLog = game.log.length ? game.log[game.log.length - 1] : null;

  return (
    <Container size={1240} py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="md">
            <Text fw={700} lts="0.1em" size="lg">
              HEADCOUNT
            </Text>
            <Badge color={status.color} variant="light" size="lg" radius="sm">
              {status.text}
            </Badge>
          </Group>
          <Group gap="xl">
            <Stat label="Cash" value={fmtCash(game.state.cash)} color="yellow.4" />
            <Stat label="Team" value={fmtInt(game.telemetry.headcountTotal)} />
            <Stat label="Output" value={`${fmtRate(game.telemetry.throughput)}/s`} color="teal.4" />
            <Button size="xs" variant="default" onClick={actions.toggleRunning}>
              {game.running ? 'Hold' : 'Resume'}
            </Button>
          </Group>
        </Group>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Stack gap="md">
              <Hero
                telemetry={game.telemetry}
                history={game.history}
                content={game.content}
                pressure={game.pressure}
                onWork={actions.work}
              />
              <Questions
                questions={game.questions}
                hiddenQueue={game.hiddenQueue}
                now={game.state.t}
                onAnswer={actions.answer}
              />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="md">
              <Grow
                content={game.content}
                state={game.state}
                prestigeReady={game.prestigeReady}
                actions={actions}
              />
              <Designer />
            </Stack>
          </Grid.Col>
        </Grid>

        <Group justify="space-between">
          <Text size="xs" c="dimmed" className="num" lineClamp={1}>
            {lastLog ? `${fmtClock(lastLog.t)} — ${lastLog.text}` : ' '}
          </Text>
          <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: 'nowrap' }}>
            shift {fmtClock(game.state.t)} · answered {fmtInt(game.state.answered)} · lifetime{' '}
            {fmtCash(game.state.lifetimeCash)}
          </Text>
        </Group>
      </Stack>
    </Container>
  );
}
