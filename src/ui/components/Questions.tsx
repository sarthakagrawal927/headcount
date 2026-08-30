import { Badge, Button, Card, Group, Kbd, Paper, Stack, Text } from '@mantine/core';
import type { Question } from '../useGame';
import { fmtInt } from '../format';

const STALE_AFTER = 8; // in-game seconds before a question starts costing real money

/**
 * The player's actual job. Every card is a worker standing still until the
 * button is pressed — which is why this panel sits front and center.
 */
export function Questions({
  questions,
  hiddenQueue,
  now,
  onAnswer,
}: {
  questions: Question[];
  hiddenQueue: number;
  now: number;
  onAnswer: (id?: number) => void;
}) {
  const total = questions.length + hiddenQueue;

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Text fw={600}>Questions for you</Text>
          {total > 0 && (
            <Badge color={total >= 5 ? 'red' : 'yellow'} variant="light" className="num">
              {fmtInt(total)} waiting
            </Badge>
          )}
        </Group>
        <Button
          size="xs"
          variant="default"
          disabled={questions.length === 0}
          onClick={() => onAnswer()}
        >
          Answer oldest <Kbd ml={6} size="xs">A</Kbd>
        </Button>
      </Group>

      {questions.length === 0 ? (
        <Text size="sm" c="dimmed" py="md">
          Nothing is waiting on you. Workers ask whenever the job runs past what the spec says —
          hire someone and they will.
        </Text>
      ) : (
        <Stack gap="xs" mah={340} className="scrollpane" style={{ overflowY: 'auto' }}>
          {questions.map((q) => {
            const wait = Math.max(0, now - q.raisedAt);
            const stale = wait > STALE_AFTER;
            return (
              <Paper
                key={q.id}
                withBorder
                p="sm"
                radius="md"
                style={stale ? { borderColor: 'var(--mantine-color-red-8)' } : undefined}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div>
                    <Text size="sm">{q.text}</Text>
                    <Text size="xs" c="dimmed" mt={2} className="num">
                      {q.roleName} · {q.where} · waiting {wait.toFixed(1)}s
                    </Text>
                  </div>
                  <Button size="xs" variant="light" onClick={() => onAnswer(q.id)}>
                    Answer
                  </Button>
                </Group>
              </Paper>
            );
          })}
          {hiddenQueue > 0 && (
            <Text size="xs" c="red.4" ta="center" py={4}>
              +{fmtInt(hiddenQueue)} more waiting off screen — each one is blocking someone.
            </Text>
          )}
        </Stack>
      )}
    </Card>
  );
}
