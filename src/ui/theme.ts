import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * The console's identity, restated in Mantine's vocabulary.
 *
 * Same scene as before the rebuild: a dark control room, teal for things
 * behaving, amber for things that want you, red for saturation. The dark
 * ramp keeps the cool cast of the old OKLCH tokens (hue ~225) — Mantine's
 * stock dark is warmer and flatter than this room should feel.
 */
const dark: MantineColorsTuple = [
  '#e9eef1', // 0 — brightest ink
  '#c3cdd3',
  '#99a6ae',
  '#5d6b74',
  '#3a464e',
  '#2b353c',
  '#20282e', // 6 — cards
  '#171d22', // 7 — body
  '#11161a',
  '#0c1013',
];

export const theme = createTheme({
  fontFamily: "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
  headings: {
    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    fontWeight: '600',
  },
  primaryColor: 'teal',
  primaryShade: 5,
  defaultRadius: 'md',
  colors: { dark },
  respectReducedMotion: true,
});
