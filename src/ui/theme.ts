import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * shadcn-standard dark: zinc near-black, hairline borders, white primary
 * actions, gray text ramp. Color appears only where it means something —
 * green for production, amber for questions, red for saturation.
 *
 * Mantine reads this tuple positionally in dark mode: 0-2 are text (0 =
 * foreground, 2 = dimmed), 4 is the default border, 5 hover, 6 cards,
 * 7 the body. Values are the zinc scale.
 */
const dark: MantineColorsTuple = [
  '#fafafa', // 0 — foreground
  '#e4e4e7',
  '#a1a1aa', // 2 — dimmed (zinc-400)
  '#71717a',
  '#27272a', // 4 — borders (zinc-800)
  '#27272a', // 5 — hover
  '#101012', // 6 — cards, one step above black
  '#09090b', // 7 — body (zinc-950)
  '#09090b',
  '#000000',
];

/** White-filled primary buttons with black text, the shadcn signature. */
const primary: MantineColorsTuple = [
  '#ffffff',
  '#fafafa',
  '#f4f4f5',
  '#e4e4e7',
  '#d4d4d8',
  '#fafafa',
  '#fafafa',
  '#e4e4e7',
  '#fafafa', // 8 — filled bg in dark mode
  '#d4d4d8', // 9 — filled hover
];

export const theme = createTheme({
  fontFamily: "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
  headings: {
    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    fontWeight: '600',
  },
  colors: { dark, primary },
  primaryColor: 'primary',
  autoContrast: true,
  luminanceThreshold: 0.45,
  defaultRadius: 'md',
  respectReducedMotion: true,
});
