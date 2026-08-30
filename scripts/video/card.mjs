/**
 * Render a caption card or terminal still to a 1920x1080 PNG.
 *
 *   node scripts/video/card.mjs <out.png> <json-spec-file>
 *
 * spec: { kind: "title"|"caption"|"terminal"|"close", title?, lines?, body?, label? }
 * Styled to match the operations console, so the cuts between footage and
 * cards read as one piece.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [out, specPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const css = `
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; background: #0b0f12; color: #d7e0e4;
    font-family: "IBM Plex Sans", -apple-system, sans-serif; }
  .wrap { height: 100%; display: grid; place-items: center; padding: 120px; }
  .inner { max-width: 1400px; width: 100%; }
  .brand { display: flex; align-items: baseline; gap: 16px; margin-bottom: 48px; }
  .brand b { font-size: 28px; letter-spacing: 0.14em; }
  .brand span { font-size: 16px; color: #5d6d75; letter-spacing: 0.1em; }
  h1 { font-size: 64px; line-height: 1.15; font-weight: 650; letter-spacing: -0.01em; }
  h1 em { color: #35c2b4; font-style: normal; }
  p.sub { margin-top: 28px; font-size: 30px; line-height: 1.45; color: #93a3ab; }
  .cap { font-size: 54px; line-height: 1.3; font-weight: 650; letter-spacing: -0.015em;
    text-wrap: balance; }
  .cap .l { display: block; }
  .cap .l + .l { margin-top: 10px; }
  .byline { margin-top: 46px; font-family: "IBM Plex Mono", monospace; font-size: 17px;
    letter-spacing: 0.1em; color: #43525a; text-transform: uppercase; }
  .accentbar { width: 76px; height: 3px; background: #35c2b4; margin-bottom: 40px; }
  .cap em { color: #35c2b4; font-style: normal; }
  .cap strong { color: #e5534b; font-weight: 600; }
  .term { background: #07090b; border: 1px solid #1d262b; border-radius: 6px; padding: 36px 42px;
    font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 23px; line-height: 1.62;
    white-space: pre-wrap; color: #c7d2d8; }
  .term .g { color: #35c2b4; } .term .r { color: #e5534b; } .term .d { color: #5d6d75; }
  .term .y { color: #d9a13c; } .term b { color: #fff; font-weight: 600; }
  .label { font-size: 17px; letter-spacing: 0.16em; color: #5d6d75; text-transform: uppercase;
    margin-bottom: 18px; }
  .rule { height: 1px; background: #1d262b; margin: 40px 0; }
  .close-url { margin-top: 44px; font-family: "IBM Plex Mono", monospace; font-size: 30px; color: #35c2b4; }
  .footer-chip { position: absolute; bottom: 54px; left: 120px; font-size: 15px;
    letter-spacing: 0.14em; color: #43525a; text-transform: uppercase; }
`;

let inner = '';
if (spec.kind === 'title') {
  inner = `<div class="brand"><b>HEADCOUNT</b><span>OPERATIONS CONSOLE</span></div>
    <h1>${spec.title}</h1><p class="sub">${spec.sub ?? ''}</p>`;
} else if (spec.kind === 'caption') {
  const lines = spec.lines.map((l) => `<span class="l">${l}</span>`).join('');
  inner = `<div class="accentbar"></div><div class="cap">${lines}</div>` +
    (spec.byline ? `<div class="byline">${esc(spec.byline)}</div>` : '');
} else if (spec.kind === 'terminal') {
  inner = `<div class="label">${esc(spec.label ?? '')}</div><div class="term">${spec.body}</div>`;
} else if (spec.kind === 'close') {
  inner = `<div class="brand"><b>HEADCOUNT</b><span>OPERATIONS CONSOLE</span></div>
    <h1>${spec.title}</h1><div class="close-url">${esc(spec.url)}</div>
    <p class="sub">${spec.sub ?? ''}</p>`;
}

const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
  <div class="wrap"><div class="inner">${inner}</div></div>
  <div class="footer-chip">simulated &middot; approved &middot; applied</div>`;

const tmp = `/tmp/hc-card-${Date.now()}.html`;
writeFileSync(tmp, html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', `--screenshot=${out}`, '--window-size=1920,1080',
  '--hide-scrollbars', '--default-background-color=0b0f12ff', `file://${tmp}`,
], { stdio: 'ignore' });
console.log(out);
