# Recording the demo

Three small pieces, no dependencies beyond ffmpeg and Chrome.

| File | What it does |
| --- | --- |
| `record.mjs` | Screenshots the live console as a frame sequence over the Chrome DevTools Protocol, using Node's built-in WebSocket. The page is loaded once and left alone, so everything on screen is the real system moving. |
| `card.mjs` | Renders a caption card or terminal still to 1920×1080, styled to match the console so the cuts read as one piece. |
| `build.sh` | Assembles frames and cards into the final cut: a slow push-in and fades on the cards, straight cuts on the footage. |

```bash
# 1. caption copy, written by an agent on the harness
npx tsx src/agent/narrator.ts --print

# 2. footage — drive the game in another shell while this records
node scripts/video/record.mjs http://localhost:5173 /tmp/hc-video/sceneA 68 6

# 3. cards, then the cut
node scripts/video/card.mjs /tmp/hc-video/cards/n1.png /tmp/hc-video/n1.json
bash scripts/video/build.sh
```

The cards are deliberately rendered rather than typed into a video editor: the
terminal stills are pasted verbatim from real runs, and regenerating them from
source is the only way that stays true as the project changes.
