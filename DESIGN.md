# Design system — as built

- **Stack**: [Mantine](https://mantine.dev) v9 (`@mantine/core`, `@mantine/charts`
  on recharts). Theme object in `src/ui/theme.ts`; the few things it cannot
  express live in `src/ui/global.css`.
- **Theme**: forced dark, shadcn-standard zinc. Body `#09090b` (zinc-950),
  cards one step above black, hairline `#27272a` borders. Primary buttons are
  white with black text (`primary` tuple + `autoContrast`).
- **Type**: IBM Plex Sans (UI) + IBM Plex Mono (numbers, via `ff="monospace"`
  and the `.num` tabular-nums class). Fixed rem scale, Mantine defaults.
- **Color strategy**: restrained, semantic only. Green = production/health,
  yellow/amber = questions, red = saturation/blocked, violet = prestige reset.
  Everything else is the gray ramp; color never decorates.
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
