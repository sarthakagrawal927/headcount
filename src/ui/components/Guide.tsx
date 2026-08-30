import { useState } from 'react';
import {
  Accordion,
  Badge,
  Button,
  Drawer,
  Group,
  Kbd,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';

const BASE = import.meta.env.VITE_GAME_URL ?? 'http://localhost:3001';

/** UI element → harness feature, the mapping judges ask about. */
const WIRING: [string, string][] = [
  ['The game itself', 'A remote MCP server — 7 tools, each annotated read-only or destructive.'],
  ['AI designer feed', 'A TrueForge agent. It must prove changes in simulation; evidence is an HMAC token minted by the server and bound to the diff.'],
  ['Every applied change', 'Passed the harness approval gate (requireApprovalForTools) — or the agent had earned clearance at that moment.'],
  ['Before a human sees a proposal', 'Three read-only critic subagents try to refute it.'],
  ['Autonomy', 'A supervisor rewrites the approval policy at runtime — earned by changes that helped, revoked when one hurts.'],
  ['This question box', 'Another harness agent (headcount-foreman), read-only by construction: its manifest enables only observation tools.'],
];

function Foreman() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'answer'; text: string; session: string } | { kind: 'error'; text: string }
  >({ kind: 'idle' });

  const ask = async () => {
    const q = question.trim();
    if (!q || state.kind === 'busy') return;
    setState({ kind: 'busy' });
    try {
      const res = await fetch(`${BASE}/guide/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.reason ?? `HTTP ${res.status}`);
      setState({ kind: 'answer', text: body.answer, session: body.sessionId });
    } catch (err) {
      setState({ kind: 'error', text: (err as Error).message });
    }
  };

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Ask the foreman — a read-only agent on the TrueForge harness. It checks the live floor
        over MCP before it answers.
      </Text>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          flex={1}
          placeholder="Why is my output falling?"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void ask()}
          maxLength={300}
        />
        <Button onClick={() => void ask()} disabled={state.kind === 'busy' || !question.trim()}>
          {state.kind === 'busy' ? <Loader size="xs" color="dark.7" /> : 'Ask'}
        </Button>
      </Group>
      {state.kind === 'answer' && (
        <Paper withBorder p="sm" radius="md">
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {state.text}
          </Text>
          <Text size="xs" c="dimmed" mt={6} className="num">
            headcount-foreman · session {state.session.slice(0, 8)} · read-only over MCP
          </Text>
        </Paper>
      )}
      {state.kind === 'error' && (
        <Text size="sm" c="red.4">
          The foreman is off shift: {state.text}
        </Text>
      )}
    </Stack>
  );
}

/** The field guide: how to play, what the agent does, how the harness is wired. */
export function Guide({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap="xs">
          <Text fw={600}>Field guide</Text>
          <Badge variant="default" size="sm">
            HEADCOUNT
          </Badge>
        </Group>
      }
    >
      <Stack gap="md">
        <Foreman />

        <Accordion defaultValue="play" variant="separated">
          <Accordion.Item value="play">
            <Accordion.Control>How to play</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="sm">
                  1 — Press <Kbd>Space</Kbd> to work the line yourself until you can afford your
                  first hire (top of the right column).
                </Text>
                <Text size="sm">
                  2 — Hire riveters. They earn fast, but each one asks questions. Answer with the
                  buttons or <Kbd>A</Kbd> — every unanswered question is a worker standing still.
                </Text>
                <Text size="sm">
                  3 — Watch the big card: when questions arrive faster than your fixed answer
                  rate, hiring more people <em>lowers</em> output. That is the wall.
                </Text>
                <Text size="sm">
                  4 — Beat it structurally: write SOPs (fewer questions), hire supervisors (they
                  absorb questions), promote tenure (fewer questions, but silent defects).
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="designer">
            <Accordion.Control>What the AI designer does</Accordion.Control>
            <Accordion.Panel>
              <Text size="sm">
                The mechanics in this game are not hand-written. An agent reads the live
                telemetry over MCP, designs a new role, SOP, or reset layer, proves it in a
                deterministic simulator, and submits it with evidence. Critics try to refute it;
                a human approves it; only then does it land — and you see it appear in the
                timeline and the hire list mid-shift. Every entry shows what the server measured
                the change actually doing.
              </Text>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="trueforge">
            <Accordion.Control>How TrueForge is wired in</Accordion.Control>
            <Accordion.Panel>
              <Table verticalSpacing={6} withRowBorders={false}>
                <Table.Tbody>
                  {WIRING.map(([what, how]) => (
                    <Table.Tr key={what}>
                      <Table.Td w={140} style={{ verticalAlign: 'top' }}>
                        <Text size="xs" fw={600}>
                          {what}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {how}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Drawer>
  );
}
