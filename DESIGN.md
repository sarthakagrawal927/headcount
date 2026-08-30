# Design system — as built

- **Theme**: single dark theme, OKLCH tokens in `src/ui/styles.css`.
- **Type**: IBM Plex Sans (UI) + IBM Plex Mono (data, labels); tabular-nums
  everywhere numbers move. Fixed rem scale, tight steps.
- **Color strategy**: restrained. Teal `--accent` = production/health;
  amber = questions/money; red = saturation/defect/blocked. Semantic only —
  never decorative. Page re-tints via `data-pressure` as the queue saturates.
- **Layout**: 3-column grid (roles/store · floor · escalations/agent feed),
  1px rules on `--rule-soft`, panels on `--bg-panel`.
- **Components**: panel + `panel__head` header pattern; chip stats; inline SVG
  icons only (no emoji). Buttons: uppercase mono labels, 1px border.
- **Motion**: state-conveying only, 150–250ms ease-out; `prefers-reduced-motion`
  honored. Status lamp blinks under pressure; new agent-feed entries highlight.
- **Contrast**: every ink token used for text meets WCAG AA at the size it is
  used. `scripts/contrast.py` converts the OKLCH tokens to sRGB and prints the
  ratios; run it after touching the palette. `--ink-faint` sits at L 0.60
  specifically because 0.49 measured 3.01:1 behind 11px labels.
