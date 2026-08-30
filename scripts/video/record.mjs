/**
 * Record the live console as a frame sequence, via Chrome's DevTools protocol.
 *
 * No dependencies: Node 24 ships a WebSocket client, Chrome ships the
 * protocol, and ffmpeg turns the frames into video. The page is loaded once
 * and left alone — the console polls the game server itself, so everything
 * that happens on screen during the recording is the real system moving.
 *
 *   node scripts/video/record.mjs <url> <outdir> <seconds> [fps]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const [url, outdir, secondsRaw, fpsRaw] = process.argv.slice(2);
const seconds = Number(secondsRaw ?? 30);
const fps = Number(fpsRaw ?? 4);
const PORT = 9333;

mkdirSync(outdir, { recursive: true });

const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--user-data-dir=/tmp/hc-video-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for the debugger endpoint, then take the first page target.
let target;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) throw new Error('chrome never came up');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(data.error.message)) : resolve(data.result);
  }
};

// 1280 logical @1.5x = 1920x1080 physical, so the 1240px layout fills the frame.
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false,
});
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(3500); // let the console connect to the game and settle

const frames = Math.round(seconds * fps);
const interval = 1000 / fps;
for (let i = 0; i < frames; i++) {
  const started = Date.now();
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  writeFileSync(`${outdir}/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(shot.data, 'base64'));
  const elapsed = Date.now() - started;
  if (elapsed < interval) await sleep(interval - elapsed);
}

chrome.kill();
console.log(`${frames} frames -> ${outdir}`);
process.exit(0);
