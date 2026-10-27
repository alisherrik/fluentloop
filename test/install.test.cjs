'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { install, plan, makeHandler } = require('../src/install.cjs');
const ROOT = path.resolve(__dirname, '..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentloop-test-'));
  t.after(() => {
    const resolved = path.resolve(dir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('fluentloop-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return dir;
}
const original = () => ({
  permissions: { allow: ['Read'], deny: ['Bash(rm *)'] },
  env: { SYNTHETIC_TEST_ONLY: 'retained' },
  hooks: {
    Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo unrelated-stop' }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo unrelated-prompt' }] }]
  }
});
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

for (const tool of ['codex', 'claude']) {
  test(`${tool}: isolated install, duplicate, mode switch, removal preserve settings`, t => {
    const configPath = path.join(fixture(t), 'project with spaces', 'settings.json');
    fs.mkdirSync(path.dirname(configPath));
    fs.writeFileSync(configPath, JSON.stringify(original()));
    const options = { tool, configPath, action: 'install' };
    assert.equal(install(options).changed, true);
    const once = fs.readFileSync(configPath, 'utf8');
    assert.equal(install(options).changed, false);
    assert.equal(fs.readFileSync(configPath, 'utf8'), once);
    install({ ...options, mode: 'english-first' });
    assert.equal(read(configPath).hooks.UserPromptSubmit.length, 2);
    assert.equal(install({ ...options, action: 'uninstall' }).changed, true);
    assert.deepEqual(read(configPath), original());
    const removed = fs.readFileSync(configPath, 'utf8');
    assert.equal(install({ ...options, action: 'uninstall' }).changed, false);
    assert.equal(fs.readFileSync(configPath, 'utf8'), removed);
  });
  test(`${tool}: dry-run creates nothing and does not expose other settings`, t => {
    const dir = fixture(t);
    const configPath = path.join(dir, 'new folder', 'settings.json');
    assert.equal(install({ tool, configPath, action: 'install', dryRun: true }).changed, true);
    assert.deepEqual(fs.readdirSync(dir), []);
    fs.writeFileSync(path.join(dir, 'existing.json'), JSON.stringify(original()));
    const output = install({ tool, configPath: path.join(dir, 'existing.json'), action: 'install', dryRun: true });
    assert.doesNotMatch(JSON.stringify(output), /retained|permissions|unrelated-stop/);
    assert.deepEqual(read(path.join(dir, 'existing.json')), original());
  });
  test(`${tool}: fresh install removal leaves only an empty settings object`, t => {
    const configPath = path.join(fixture(t), 'settings.json');
    assert.equal(install({ tool, configPath, action: 'uninstall' }).changed, false);
    assert.equal(fs.existsSync(configPath), false);
    install({ tool, configPath, action: 'install' });
    install({ tool, configPath, action: 'uninstall' });
    assert.deepEqual(read(configPath), {});
  });
  test(`${tool}: exact duplicate handlers collapse while foreign sibling survives`, () => {
    const owned = makeHandler(tool, 'coach');
    const sibling = { type: 'command', command: 'echo sibling' };
    const config = { hooks: { UserPromptSubmit: [{ hooks: [owned, sibling, owned] }] } };
    const result = plan(config, { action: 'install', tool });
    assert.deepEqual(result.next.hooks.UserPromptSubmit, [{ hooks: [sibling] }, { hooks: [owned] }]);
    assert.equal(result.found, 2);
  });
  test(`${tool}: modified hooks and foreign checkout ownership cause refusal`, () => {
    for (const action of ['install', 'uninstall']) {
      for (const group of [
        { hooks: [{ ...makeHandler(tool, 'coach'), timeout: 20 }] },
        { matcher: '*', hooks: [makeHandler(tool, 'coach')] },
        { hooks: [makeHandler(tool, 'coach', path.join(ROOT, 'other-copy'))] }
      ]) assert.throws(() => plan({ hooks: { UserPromptSubmit: [group] } }, { tool, action }), /modified FluentLoop/);
    }
  });
  test(`${tool}: generated command executes from a spaced checkout with foreign cwd`, t => {
    const dir = fixture(t);
    const root = path.join(dir, 'portable checkout with spaces');
    fs.mkdirSync(root);
    for (const part of ['adapters', 'src', 'policy']) fs.cpSync(path.join(ROOT, part), path.join(root, part), { recursive: true });
    const handler = makeHandler(tool, 'english-first', root);
    const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Menga login kodni tuzat' });
    const options = { input, cwd: dir, encoding: 'utf8', env: { ...process.env, FLUENTLOOP_DISABLED: '0' } };
    const child = tool === 'claude'
      ? spawnSync(handler.command, handler.args, options)
      : process.platform === 'win32'
        ? spawnSync(handler.command, { ...options, shell: true })
        : spawnSync('/bin/sh', ['-c', handler.command], options);
    assert.equal(child.status, 0, child.stderr || String(child.error));
    assert.equal(JSON.parse(child.stdout).decision, 'block');
    if (tool === 'codex' && process.platform === 'win32') {
      const pwsh = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', handler.command], options);
      assert.equal(pwsh.status, 0, pwsh.stderr);
      assert.equal(JSON.parse(pwsh.stdout).decision, 'block');
    }
  });
}
for (const raw of ['{', '', 'null', '[]', '{"hooks":[]}', '{"hooks":{"UserPromptSubmit":{}}}', '{"hooks":{"UserPromptSubmit":[{}]}}', '{"hooks":{"UserPromptSubmit":[{"hooks":[null]}]}}']) {
  test(`invalid settings stay byte-identical: ${raw}`, t => {
    const configPath = path.join(fixture(t), 'settings.json');
    fs.writeFileSync(configPath, raw);
    assert.throws(() => install({ action: 'install', tool: 'claude', configPath }));
    assert.equal(fs.readFileSync(configPath, 'utf8'), raw);
  });
}
test('lock conflict refuses to overwrite and does not remove another lock', t => {
  const configPath = path.join(fixture(t), 'settings.json');
  fs.writeFileSync(configPath, '{}');
  fs.writeFileSync(`${configPath}.fluentloop.lock`, 'another installer');
  assert.throws(() => install({ action: 'install', tool: 'codex', configPath }), /EEXIST/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), '{}');
  assert.equal(fs.readFileSync(`${configPath}.fluentloop.lock`, 'utf8'), 'another installer');
});
test('settings hardlink is rejected without changing source', t => {
  const dir = fixture(t);
  const source = path.join(dir, 'original.json');
  const configPath = path.join(dir, 'linked.json');
  fs.writeFileSync(source, '{}');
  fs.linkSync(source, configPath);
  assert.throws(() => install({ action: 'install', tool: 'claude', configPath }), /linked settings/);
  assert.equal(fs.readFileSync(source, 'utf8'), '{}');
});
test('linked directory is rejected without changing target', t => {
  const dir = fixture(t);
  const target = path.join(dir, 'actual');
  const link = path.join(dir, 'alias');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => install({ action: 'install', tool: 'claude', configPath: path.join(link, 'settings.json') }), /linked settings/);
  assert.deepEqual(fs.readdirSync(target), []);
});
test('Codex shell-active checkout paths are rejected', () => {
  for (const suffix of ['cash$money', 'tick`name', 'semi;colon', 'quote"name', 'percent%name', 'amp&name', "single'name", 'bang!name']) {
    assert.throws(() => makeHandler('codex', 'coach', path.join(ROOT, suffix)), /checkout path/);
    assert.ok(makeHandler('claude', 'coach', path.join(ROOT, suffix)).args);
  }
});
test('installer requires explicit target, valid action, tool, mode', () => {
  assert.throws(() => install({ action: 'install', tool: 'codex' }), /explicit/);
  assert.throws(() => plan({}, { action: 'erase', tool: 'codex' }), /Action/);
  assert.throws(() => plan({}, { action: 'install', tool: 'other' }), /Tool/);
  assert.throws(() => plan({}, { action: 'install', tool: 'codex', mode: 'other' }), /Mode/);
});
test('CLI install and uninstall complete the real fixture lifecycle', t => {
  const dir = fixture(t);
  for (const tool of ['codex', 'claude']) {
    const configPath = path.join(dir, `${tool} settings.json`);
    fs.writeFileSync(configPath, '\uFEFF' + JSON.stringify(original()));
    const invoke = (action, flags = []) => spawnSync(process.execPath, [path.join(ROOT, 'bin/fluentloop.cjs'), action, tool, '--config', configPath, ...flags], { encoding: 'utf8' });
    const preview = invoke('install', ['--dry-run']);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8')[0], '\uFEFF');
    const installed = invoke('install', ['--mode', 'english-first']);
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(JSON.parse(invoke('install', ['--mode', 'english-first']).stdout).changed, false);
    const removed = invoke('uninstall');
    assert.equal(removed.status, 0, removed.stderr);
    assert.deepEqual(read(configPath), original());
  }
});
test('Claude exec arguments support shell-active characters in a real checkout path', t => {
  const dir = fixture(t);
  const root = path.join(dir, "Claude's $demo & example");
  fs.mkdirSync(root);
  for (const part of ['adapters', 'src', 'policy']) fs.cpSync(path.join(ROOT, part), path.join(root, part), { recursive: true });
  const handler = makeHandler('claude', 'coach', root);
  const result = spawnSync(handler.command, handler.args, {
    encoding: 'utf8', cwd: dir, input: '{"hook_event_name":"UserPromptSubmit","prompt":"Please explain tests."}',
    env: { ...process.env, FLUENTLOOP_DISABLED: '0' }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).hookSpecificOutput);
});
