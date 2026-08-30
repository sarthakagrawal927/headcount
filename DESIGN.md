# Design system — as built

- **Stack**: [Mantine](https://mantine.dev) v9 (`@mantine/core`, `@mantine/charts`
  on recharts). Theme object in `src/ui/theme.ts`; the few things it cannot
  express live in `src/ui/global.css`.
- **Theme**: forced dark. Custom `dark` ramp keeps the old console's cool cast
  (hue ~225) — body `dark.7`, cards `dark.6`.
- **Type**: IBM Plex Sans (UI) + IBM Plex Mono (numbers, via `ff="monospace"`
  and the `.num` tabular-nums class). Fixed rem scale, Mantine defaults.
- **Color strategy**: restrained, semantic only. Teal = production/health,
  yellow = questions/money, red = saturation/blocked, grape = prestige reset.
  Accents on state and primary actions, never decoration.
- **Layout**: Container 1240 → 8/4 Grid (understand + act · grow + agent),
  stacking at `lg`. Four cards total: Hero, Questions, Grow, AI designer.
- **Components**: Mantine vocabulary throughout — Card, Paper rows, Badge,
  Tabs, Timeline (agent feed), RingProgress (share of team working),
  AreaChart sparkline with a red reference line at the player's answer rate.
  Buy buttons carry the price as their label (idle-game convention).
- **Motion**: Mantine defaults only; `respectReducedMotion: true` in the theme.
- **Contrast**: no text below Mantine `dimmed` on cards; the old system's
  lesson (faint 10–11px labels failing AA) carries over — smallest text uses
  `c="dimmed"`, never `dark.3`.
