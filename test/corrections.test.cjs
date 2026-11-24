'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { defaultDataDir, extract, lastAssistantText, list, save, remove } = require('../src/corrections.cjs');
const { createServer } = require('../src/dashboard.cjs');
const { knownRuntimes } = require('../src/runtime.cjs');
const ROOT = path.resolve(__dirname, '..');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentloop-test-'));
  t.after(() => {
    assert.ok(path.basename(dir).startsWith('fluentloop-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
const marker = value => `<!-- fluentloop:correction ${JSON.stringify(value)} -->`;
const sample = { original: 'I wants add test.', corrected: 'I want to add a test.', explanation: 'Use "want to" with I.' };

test('extract keeps valid markers and ignores broken or empty ones', () => {
  const text = `Here is a better sentence.\n${marker(sample)}\n<!-- fluentloop:correction {bad json} -->\n${marker({ ...sample, explanation: '' })}\n${marker({ ...sample, corrected: sample.original })}`;
  assert.deepEqual(extract(text), [sample]);
  assert.deepEqual(extract(marker({ ...sample, original: 'x'.repeat(2001) })), []);
  assert.deepEqual(extract(undefined), []);
});

test('lastAssistantText prefers last_assistant_message, else reads the latest turn of the transcript', t => {
  assert.equal(lastAssistantText({ last_assistant_message: 'direct' }), 'direct');
  const transcript = path.join(tmp(t), 'session.jsonl');
  const lines = [
    { type: 'user', message: { content: 'first prompt' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'old turn ' + marker({ ...sample, original: 'old' }) }] } },
    { type: 'user', message: { content: 'second prompt' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'a', name: 'Read', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'file' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Done. ' + marker(sample) }] } }
  ];
  fs.writeFileSync(transcript, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  assert.deepEqual(extract(lastAssistantText({ transcript_path: transcript })), [sample]);
  assert.equal(lastAssistantText({ transcript_path: path.join(path.dirname(transcript), 'missing.jsonl') }), '');
});

test('save deduplicates per session and remove rewrites the notebook', t => {
  const dir = tmp(t);
  assert.deepEqual(list(dir), []);
  const [first] = save(dir, [sample], { session: 's1', tool: 'claude' });
  assert.equal(save(dir, [sample], { session: 's1' }).length, 0);
  assert.equal(save(dir, [sample], { session: 's2' }).length, 1);
  assert.equal(list(dir).length, 2);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'corrections.jsonl')).mode & 0o777, 0o600);
  assert.equal(remove(dir, first.id), true);
  assert.equal(remove(dir, first.id), false);
  assert.equal(list(dir).length, 1);
});

test('defaultDataDir follows an installed runtime location', () => {
  const hash = 'a'.repeat(64);
  assert.equal(defaultDataDir(path.join('/x/.fluentloop/runtimes', hash), {}), path.resolve('/x/.fluentloop'));
  assert.equal(defaultDataDir('/anything', { FLUENTLOOP_DATA_DIR: '/custom' }), path.resolve('/custom'));
});

for (const tool of ['claude', 'codex']) {
  test(`${tool}: Stop adapter saves markers, always prints {} and never fails`, t => {
    const dir = tmp(t);
    const run = input => spawnSync(process.execPath, [path.join(ROOT, 'adapters/stop.cjs'), '--fluentloop-managed=v1', '--tool', tool], { input, encoding: 'utf8', env: { ...process.env, FLUENTLOOP_DATA_DIR: dir } });
    const input = JSON.stringify({ hook_event_name: 'Stop', session_id: 'abc', last_assistant_message: 'Try this. ' + marker(sample) });
    for (const raw of [input, input, '{', '', 'null', '[]', '"x"']) {
      const result = run(raw);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '{}\n');
    }
    const saved = list(dir);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].tool, tool);
    assert.equal(saved[0].corrected, sample.corrected);
  });
}

test('dashboard serves only local hosts and guards deletion', async t => {
  const dir = tmp(t);
  const [item] = save(dir, [sample], { session: 's' });
  const server = createServer({ dataDir: dir, port: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /FluentLoop Notebook/);
  assert.deepEqual((await (await fetch(base + '/api/corrections')).json()).map(i => i.id), [item.id]);
  // Node's fetch forbids overriding Host, so use http.request for the rebinding check.
  const status = await new Promise((resolve, reject) => {
    require('node:http').get(base + '/api/corrections', { headers: { host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 421);
  assert.equal((await fetch(`${base}/api/corrections/${item.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${base}/api/corrections/${item.id}`, { method: 'DELETE', headers: { 'X-FluentLoop': '1' } })).status, 200);
  assert.deepEqual(list(dir), []);
});

test('0.2.0 six-file runtimes stay recognized after the runtime gained files', t => {
  const dataDir = tmp(t);
  const legacy = ['adapters/codex.cjs', 'adapters/claude.cjs', 'src/engine.cjs', 'src/protocol.cjs', 'policy/coaching.md', 'LICENSE'];
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const files = Object.fromEntries(legacy.map(file => [file, hash(fs.readFileSync(path.join(ROOT, file)))]));
  const root = path.join(dataDir, 'runtimes', hash(JSON.stringify(files)));
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'fluentloop-runtime.json'), JSON.stringify({ owner: 'fluentloop', schema: 1, files }));
  assert.deepEqual(knownRuntimes(dataDir), [root]);
});
