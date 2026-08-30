/**
 * Render docs/blog.md to public/blog.html so the Pages deploy serves it.
 *
 * Purpose-built for this one document — headers, paragraphs, lists, tables,
 * fenced code, inline code/bold/italic/links — rather than a dependency for
 * a page that changes twice a year. Styled to match the console: zinc dark,
 * IBM Plex, 70ch measure.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync('docs/blog.md', 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline spans, applied after HTML-escaping. */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

const lines = md.split('\n');
const out = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];

  if (line.startsWith('```')) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].startsWith('```')) buf.push(esc(lines[i++]));
    i++;
    out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
  } else if (line.startsWith('# ')) {
    out.push(`<h1>${inline(line.slice(2))}</h1>`);
    i++;
  } else if (line.startsWith('## ')) {
    out.push(`<h2>${inline(line.slice(3))}</h2>`);
    i++;
  } else if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
    const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
    const body = rows
      .filter((r) => !/^\|[\s\-|]+\|$/.test(r))
      .map((r, idx) => {
        const tag = idx === 0 ? 'th' : 'td';
        return `<tr>${cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;
      });
    out.push(`<table>${body.join('')}</table>`);
  } else if (/^[-*] /.test(line)) {
    const items = [];
    while (i < lines.length && /^[-*] /.test(lines[i])) {
      let item = lines[i++].slice(2);
      while (i < lines.length && /^ {2,}\S/.test(lines[i])) item += ' ' + lines[i++].trim();
      items.push(`<li>${inline(item)}</li>`);
    }
    out.push(`<ul>${items.join('')}</ul>`);
  } else if (line.trim() === '') {
    i++;
  } else {
    let para = line;
    while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^([#|`]|[-*] )/.test(lines[i + 1])) {
      para += ' ' + lines[++i].trim();
    }
    out.push(`<p>${inline(para)}</p>`);
    i++;
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Idle games have a hole in them shaped exactly like an AI agent — HEADCOUNT</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; }
  body { background: #09090b; color: #e4e4e7; margin: 0;
    font: 17px/1.65 'IBM Plex Sans', -apple-system, sans-serif; }
  main { max-width: 70ch; margin: 0 auto; padding: 48px 20px 96px; }
  h1 { font-size: 1.9rem; line-height: 1.25; letter-spacing: -0.01em; text-wrap: balance; }
  h2 { font-size: 1.25rem; margin-top: 2.2em; }
  a { color: #4ade80; }
  code { font-family: 'IBM Plex Mono', monospace; font-size: 0.88em;
    background: #18181b; border: 1px solid #27272a; border-radius: 4px; padding: 0.1em 0.35em; }
  pre { background: #101012; border: 1px solid #27272a; border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; border: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: 0.92em; }
  th, td { border: 1px solid #27272a; padding: 7px 10px; text-align: left; }
  th { background: #101012; }
  .top { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em;
    color: #a1a1aa; text-transform: uppercase; }
  .top a { color: #a1a1aa; }
  .foot { margin-top: 3em; padding-top: 1.2em; border-top: 1px solid #27272a;
    color: #a1a1aa; font-size: 0.92em; }
</style>
</head>
<body>
<main>
<p class="top">HEADCOUNT · <a href="./">play the demo</a> · <a href="https://github.com/sarthakagrawal927/headcount">repo</a></p>
${out.join('\n')}
<p class="foot">Written for the WeMakeDevs Agent Harness Hackathon. The game, the agents,
and every number above live in <a href="https://github.com/sarthakagrawal927/headcount">the repository</a> —
or <a href="./">play the in-browser demo</a>, seeded with the pack the agent actually grew.</p>
</main>
</body>
</html>
`;

writeFileSync('public/blog.html', html);
console.log(`public/blog.html written (${html.length} bytes)`);
