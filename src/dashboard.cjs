'use strict';
// Local-only corrections dashboard. Binds to 127.0.0.1; no network, accounts or dependencies.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { list, remove } = require('./corrections.cjs');
const DEFAULT_PORT = 4317;
const PID_FILE = 'dashboard.pid';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FluentLoop Notebook</title>
<style>
:root { --bg:#f7f6f3; --card:#fff; --text:#1d1d1b; --muted:#6b6a65; --line:#e4e2dc; --old:#b3261e; --new:#1b6e3a; --accent:#2f5bd3; }
@media (prefers-color-scheme: dark) { :root { --bg:#151514; --card:#1f1f1d; --text:#ecebe6; --muted:#a19f97; --line:#33322e; --old:#f2867d; --new:#7fd39b; --accent:#8aa8ff; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:760px; margin:0 auto; padding:32px 16px 64px; }
header { display:flex; flex-wrap:wrap; gap:12px; align-items:baseline; justify-content:space-between; margin-bottom:20px; }
h1 { font-size:22px; margin:0; }
.stats { color:var(--muted); font-size:14px; }
input[type=search] { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--text); font:inherit; margin-bottom:16px; }
article { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:10px; }
.old { color:var(--old); text-decoration:line-through; text-decoration-thickness:1px; }
.new { color:var(--new); font-weight:600; margin-top:4px; }
.why { color:var(--muted); margin-top:6px; font-size:14px; }
.meta { display:flex; justify-content:space-between; align-items:center; margin-top:10px; color:var(--muted); font-size:12px; }
button { background:none; border:1px solid var(--line); color:var(--muted); border-radius:6px; padding:3px 10px; font:inherit; cursor:pointer; }
button:hover { color:var(--old); border-color:var(--old); }
.empty { color:var(--muted); text-align:center; padding:48px 0; }
code { background:var(--line); padding:1px 5px; border-radius:4px; }
</style>
</head>
<body>
<main>
  <header><h1>FluentLoop Notebook</h1><span class="stats" id="stats"></span></header>
  <input type="search" id="q" placeholder="Search corrections" aria-label="Search corrections">
  <section id="list"></section>
</main>
<script>
let items = [];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const shown = items.filter(i => !q || [i.original, i.corrected, i.explanation].some(t => t.toLowerCase().includes(q)));
  const week = Date.now() - 7 * 864e5;
  document.getElementById('stats').textContent = items.length + ' saved · ' + items.filter(i => Date.parse(i.at) > week).length + ' this week';
  const list = document.getElementById('list');
  list.replaceChildren();
  if (!shown.length) {
    const empty = el('p', 'empty', items.length ? 'No matches.' : 'No corrections yet. They appear here after FluentLoop coaches a prompt in Claude Code or Codex.');
    list.append(empty); return;
  }
  for (const i of shown) {
    const card = el('article');
    card.append(el('div', 'old', i.original), el('div', 'new', i.corrected), el('div', 'why', i.explanation));
    const meta = el('div', 'meta');
    meta.append(el('span', '', new Date(i.at).toLocaleString() + (i.tool ? ' · ' + i.tool : '')));
    const del = el('button', '', 'Delete');
    del.onclick = async () => {
      if (!confirm('Delete this correction?')) return;
      const r = await fetch('/api/corrections/' + encodeURIComponent(i.id), { method: 'DELETE', headers: { 'X-FluentLoop': '1' } });
      if (r.ok) { items = items.filter(x => x.id !== i.id); render(); }
    };
    meta.append(del); card.append(meta); list.append(card);
  }
}
async function load() {
  const r = await fetch('/api/corrections');
  items = (await r.json()).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  render();
}
document.getElementById('q').addEventListener('input', render);
load();
setInterval(load, 10000);
</script>
</body>
</html>`;

function createServer({ dataDir, port = DEFAULT_PORT }) {
  const server = http.createServer((req, res) => {
    const actual = server.address()?.port ?? port;
    const allowedHosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" });
      res.end(body);
    };
    // Reject other Host values so a web page cannot reach this server through DNS rebinding.
    if (!allowedHosts.has(req.headers.host)) return send(421, '{"error":"misdirected request"}');
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(200, JSON.stringify({ app: 'fluentloop', pid: process.pid, dataDir }));
      if (req.method === 'GET' && url.pathname === '/') return send(200, PAGE, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/corrections') return send(200, JSON.stringify(list(dataDir)));
      const match = /^\/api\/corrections\/([a-f0-9]{16})$/.exec(url.pathname);
      if (req.method === 'DELETE' && match) {
        // A custom header forces a CORS preflight, which this server never approves.
        if (req.headers['x-fluentloop'] !== '1') return send(403, '{"error":"forbidden"}');
        return remove(dataDir, match[1]) ? send(200, '{"deleted":true}') : send(404, '{"error":"not found"}');
      }
      return send(404, '{"error":"not found"}');
    } catch {
      return send(500, '{"error":"could not read the corrections notebook"}');
    }
  });
  return server;
}

function serve({ dataDir, port = DEFAULT_PORT, output = process.stdout }) {
  const server = createServer({ dataDir, port });
  return new Promise((resolve, reject) => {
    server.once('error', error => reject(error.code === 'EADDRINUSE' ? new Error(`Port ${port} is in use. Try --port <number>.`) : error));
    server.listen(port, '127.0.0.1', () => {
      output.write(`FluentLoop notebook: http://127.0.0.1:${server.address().port}\nData: ${dataDir}\nPress Ctrl+C to stop.\n`);
      resolve(server);
    });
  });
}
// Resolves to the dashboard's pid when a FluentLoop dashboard answers on the port, else null.
function probe(port = DEFAULT_PORT, timeout = 500, dataDir) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { const value = JSON.parse(body); resolve(value.app === 'fluentloop' && Number.isInteger(value.pid) && (!dataDir || value.dataDir === dataDir) ? value.pid : null); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// Same pattern as claude-mem's worker: check health, otherwise spawn a detached server that outlives the session.
async function ensureRunning({ dataDir, port = DEFAULT_PORT }) {
  if (await probe(port)) return false;
  const setsid = '/usr/bin/setsid';
  const args = [__filename, '--daemon', '--data-dir', dataDir, '--port', String(port)];
  const useSetsid = process.platform !== 'win32' && fs.existsSync(setsid);
  const child = spawn(useSetsid ? setsid : process.execPath, useSetsid ? [process.execPath, ...args] : args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return true;
}

async function stop({ dataDir, port = DEFAULT_PORT }) {
  // Only stop the dashboard that serves this data directory.
  const pid = await probe(port, 500, path.resolve(dataDir));
  if (!pid) return false;
  process.kill(pid);
  try { fs.unlinkSync(path.join(dataDir, PID_FILE)); } catch { /* already gone */ }
  return true;
}

async function daemon(args) {
  const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const dataDir = path.resolve(value('--data-dir'));
  const port = Number(value('--port') || DEFAULT_PORT);
  const server = await serve({ dataDir, port, output: { write() {} } });
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, PID_FILE), String(process.pid) + '\n', { mode: 0o600 });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createServer, serve, probe, ensureRunning, stop, DEFAULT_PORT };
// A port already in use (another dashboard won the race) just exits quietly.
if (require.main === module && process.argv.includes('--daemon')) daemon(process.argv.slice(2)).catch(() => process.exit(0));
