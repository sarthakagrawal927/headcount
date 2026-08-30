import { useEffect, useState } from 'react';
import { Badge, Card, Group, Text, Timeline } from '@mantine/core';
import type { PatchLogEntry } from '../../engine/createEngine';
import { getPatchLog, subscribeToPatchLog } from '../remoteEngine';
import { GROWN_AT, GROWN_LOG } from '../grown';
import { isHostedDemo } from '../hosted';
import { fmtClock } from '../format';

/** The live approval log, straight off the poll that already runs. */
function usePatchLog(): PatchLogEntry[] {
  const [log, setLog] = useState<PatchLogEntry[]>(getPatchLog);
  useEffect(() => subscribeToPatchLog(setLog), []);
  return log;
}

/**
 * The judge-facing panel: an agent on the harness designs this game's
 * mechanics while it runs. Each entry was proved in simulation and approved
 * by a human before it landed — the timeline is that record, live.
 */
export function Designer() {
  const live = usePatchLog();
  // The hosted demo has no harness to poll, so it replays the approval log
  // captured with the pack it is running — labeled as the recording it is.
  const hosted = isHostedDemo();
  const log = hosted && live.length === 0 ? GROWN_LOG : live;
  const entries = [...log].reverse(); // newest first
  const version = log.length ? log[log.length - 1].version : null;

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb={4}>
        <Text fw={600}>AI designer</Text>
        <Group gap={6}>
          {hosted && (
            <Badge variant="default" size="sm">
              recorded run
            </Badge>
          )}
          {version !== null && (
            <Badge variant="light" color="green" className="num">
              pack v{version}
            </Badge>
          )}
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        {hosted
          ? `Every mechanic in this demo beyond the seed was designed by an agent on the TrueForge harness — proved in simulation, human-approved, and captured verbatim on ${GROWN_AT.slice(0, 10)}. This is that session's approval log.`
          : "An agent designs this game's mechanics while you play — every change is proved in simulation and approved by a human before it lands here."}
      </Text>

      {entries.length === 0 ? (
        <Text size="sm" c="dimmed">
          No design changes yet. Approved ones appear here, with what the server measured them
          doing.
        </Text>
      ) : (
        <Timeline
          active={0}
          reverseActive
          bulletSize={26}
          lineWidth={2}
          color="green"
          className="scrollpane"
          style={{ maxHeight: 380, overflowY: 'auto' }}
        >
          {entries.map((entry) => (
            <Timeline.Item
              key={`${entry.version}-${entry.at}`}
              bullet={
                <Text size="10px" fw={600} className="num">
                  v{entry.version}
                </Text>
              }
              title={
                <Text size="sm" fw={500} lh={1.3} lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
                  {entry.summary[0] ?? 'no structural change'}
                </Text>
              }
            >
              {entry.summary.slice(1).map((line, i) => (
                <Text key={i} size="xs" c="dimmed" className="num">
                  {line}
                </Text>
              ))}
              {entry.note && (
                <Text size="xs" c="dimmed" mt={4} lineClamp={3}>
                  {entry.note}
                </Text>
              )}
              <Text size="10px" c="dimmed" mt={4} className="num">
                {fmtClock(entry.at)} on the shift clock
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      )}

      {entries.length > 0 && (
        <Text size="xs" c="dimmed" mt="sm">
          {entries.length} approved change{entries.length === 1 ? '' : 's'} · simulated → approved
          → applied
        </Text>
      )}
    </Card>
  );
}
