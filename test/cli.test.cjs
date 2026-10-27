'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const run = (file, args = [], input = '', env = {}) => spawnSync(process.execPath, [path.join(ROOT, file), ...args], {
  input, encoding: 'utf8', env: { ...process.env, FLUENTLOOP_DISABLED: '0', ...env }
});
for (const tool of ['codex', 'claude']) {
  for (const input of ['{', 'null', '[]', '']) test(`${tool} executable: malformed event ${input}`, () => {
    const result = run(`adapters/${tool}.cjs`, [], input);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
  });
  test(`${tool} executable: context, block, retry and disabled`, () => {
    const event = prompt => JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt });
    const file = `adapters/${tool}.cjs`;
    assert.ok(JSON.parse(run(file, [], event('I wants fix code.')).stdout).hookSpecificOutput);
    assert.equal(JSON.parse(run(file, ['--mode', 'english-first'], event('Menga login kodni tuzat')).stdout).decision, 'block');
    assert.ok(JSON.parse(run(file, ['--mode', 'english-first'], event('[fluentloop:retry] I want fix code.')).stdout).hookSpecificOutput);
    assert.deepEqual(JSON.parse(run(file, [], event('Please fix code.'), { FLUENTLOOP_DISABLED: '1' }).stdout), {});
    const badArgs = run(file, ['--mode', 'typo'], event('Please fix code.'));
    assert.deepEqual(JSON.parse(badArgs.stdout), {});
    assert.match(badArgs.stderr, /invalid hook arguments/);
  });
  test(`${tool} executable: bounded oversized input`, () => {
    const result = run(`adapters/${tool}.cjs`, [], 'x'.repeat(1024 * 1024 + 1));
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
  });
}
test('CLI help and synthetic demo run without model calls', () => {
  assert.match(run('bin/fluentloop.cjs', ['--help']).stdout, /dry-run/);
  const result = run('bin/fluentloop.cjs', ['demo']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"decision": "block"/);
});
for (const args of [['install', 'codex'], ['install', 'claude', '--config'], ['install', 'claude', '--wat'], ['demo', '--oops'], ['uninstall', 'codex', '--mode', 'coach'], ['install', 'codex', '--dry-run', '--dry-run']]) {
  test(`CLI rejects invalid arguments: ${args.join(' ')}`, () => assert.equal(run('bin/fluentloop.cjs', args).status, 1));
}
