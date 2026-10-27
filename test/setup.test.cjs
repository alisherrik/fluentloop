'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolvePaths } = require('../src/setup.cjs');
const { install, ROOT } = require('../src/install.cjs');
const { runtimePlan, copyRuntime, knownRuntimes, FILES } = require('../src/runtime.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentloop-setup-'));
  const home = path.join(dir, 'home with spaces');
  fs.mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', FLUENTLOOP_DISABLED: '0' };
  const run = (args, input = '', extra = {}) => spawnSync(process.execPath, [path.join(ROOT, 'bin/fluentloop.cjs'), ...args], {
    cwd: dir, encoding: 'utf8', input, env: { ...env, ...extra }, timeout: 15000
  });
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('fluentloop-setup-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, home, run, env };
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const foreign = () => ({ permissions: { deny: ['Bash(rm *)'] }, env: { SYNTHETIC_PRIVATE_VALUE: 'do-not-print' }, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo unchanged' }] }] } });

for (const [choice, tools] of [['1', ['codex']], ['2', ['claude']], ['3', ['codex', 'claude']]]) {
  test(`guided choice ${choice}: preview, confirm, repeat, remove`, t => {
    const { home, run } = fixture(t);
    const paths = resolvePaths({ home }, {}).configs;
    for (const tool of tools) write(paths[tool], foreign());
    const result = run(['init'], `${choice}\nyes\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Setup preview/);
    assert.match(result.stdout, /Apply these changes\? \[y\/N\]/);
    assert.doesNotMatch(result.stdout, /do-not-print|SYNTHETIC_PRIVATE_VALUE/);
    assert.ok(result.stdout.indexOf('Setup preview') < result.stdout.indexOf('Updated:'));
    assert.equal(knownRuntimes(path.join(home, '.fluentloop')).length, 1);
    for (const tool of tools) {
      const config = read(paths[tool]);
      assert.deepEqual(config.permissions, foreign().permissions);
      assert.deepEqual(config.hooks.UserPromptSubmit[0], foreign().hooks.UserPromptSubmit[0]);
      assert.equal(config.hooks.UserPromptSubmit.length, 2);
    }
    const selected = tools.length === 2 ? 'both' : tools[0];
    const again = run(['init', '--tool', selected, '--yes']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Already up to date/);
    assert.equal(run(['uninstall', '--tool', selected], 'n\n').status, 0);
    for (const tool of tools) assert.equal(read(paths[tool]).hooks.UserPromptSubmit.length, 2);
    assert.equal(run(['uninstall', '--tool', selected, '--yes']).status, 0);
    for (const tool of tools) assert.deepEqual(read(paths[tool]), foreign());
    assert.match(run(['uninstall', '--tool', selected, '--yes']).stdout, /Already up to date/);
    assert.equal(knownRuntimes(path.join(home, '.fluentloop')).length, 1);
  });
}
for (const input of ['1\nn\n', '2\n\n', '3\nno\n', '1\n', '']) {
  test(`cancel/EOF never writes settings or runtime: ${JSON.stringify(input)}`, t => {
    const { home, run } = fixture(t);
    const result = run(['init'], input);
    assert.ok([0, 1].includes(result.status), result.stderr);
    assert.deepEqual(fs.readdirSync(home), []);
  });
}
test('dry-run both creates no directories, including alternate runtime destination', t => {
  const { home, dir, run } = fixture(t);
  const result = run(['init', '--tool', 'both', '--data-dir', path.join(dir, 'runtime data'), '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run/);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(fs.readdirSync(dir), ['home with spaces']);
});
test('chooser detects existing settings without claiming the tool is installed', t => {
  const { home, run } = fixture(t);
  write(path.join(home, '.claude/settings.json'), {});
  const result = run(['init'], '\nn\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Claude Code \(settings found\)/);
  assert.match(result.stdout, /Choose a tool \[2\]/);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
});
test('chooser retries invalid input and confirmation defaults to no', t => {
  const { home, run } = fixture(t);
  const result = run(['init'], 'wrong\n2\n\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Enter 1, 2 or 3/);
  assert.deepEqual(fs.readdirSync(home), []);
});
test('all target JSON is validated before either tool or runtime is changed', t => {
  const { home, run } = fixture(t);
  write(path.join(home, '.claude/settings.json'), null);
  const result = run(['init', '--tool', 'both', '--yes']);
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  assert.equal(fs.existsSync(path.join(home, '.fluentloop')), false);
  assert.equal(read(path.join(home, '.claude/settings.json')), null);
});
test('custom config-directory environment variables are respected', t => {
  const { home, dir, run } = fixture(t);
  const codex = path.join(dir, 'custom codex');
  const claude = path.join(dir, 'custom claude');
  const result = run(['init', '--tool', 'both', '--yes'], '', { CODEX_HOME: codex, CLAUDE_CONFIG_DIR: claude });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(read(path.join(codex, 'hooks.json')).hooks);
  assert.ok(read(path.join(claude, 'settings.json')).hooks);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});
test('project scope and explicit config target leave home settings untouched', t => {
  const { home, dir, run } = fixture(t);
  const project = path.join(dir, 'project with spaces');
  assert.equal(run(['init', '--tool', 'both', '--scope', 'project', '--project', project, '--yes']).status, 0);
  assert.ok(read(path.join(project, '.codex/hooks.json')).hooks);
  assert.ok(read(path.join(project, '.claude/settings.local.json')).hooks);
  const explicit = path.join(dir, 'other settings.json');
  assert.equal(run(['init', '--tool', 'claude', '--config', explicit, '--yes']).status, 0);
  assert.ok(read(explicit).hooks);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});
test('legacy checkout hook migrates to durable runtime without duplication', t => {
  const { home, run } = fixture(t);
  const configPath = path.join(home, '.codex/hooks.json');
  install({ configPath, tool: 'codex', action: 'install' });
  const result = run(['init', '--tool', 'codex', '--yes']);
  assert.equal(result.status, 0, result.stderr);
  const groups = read(configPath).hooks.UserPromptSubmit;
  assert.equal(groups.length, 1);
  assert.match(groups[0].hooks[0].command, /\.fluentloop\/runtimes/);
});
test('new runtime version replaces only the recognized old handler', t => {
  const { home, dir, run } = fixture(t);
  const source = path.join(dir, 'older package');
  for (const file of FILES) { fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true }); fs.copyFileSync(path.join(ROOT, file), path.join(source, file)); }
  fs.appendFileSync(path.join(source, 'policy/coaching.md'), '\nSynthetic older fixture.\n');
  const old = runtimePlan(path.join(home, '.fluentloop'), source);
  copyRuntime(old);
  const configPath = path.join(home, '.claude/settings.json');
  install({ configPath, tool: 'claude', action: 'install', root: old.root });
  const result = run(['init', '--tool', 'claude', '--yes']);
  assert.equal(result.status, 0, result.stderr);
  const groups = read(configPath).hooks.UserPromptSubmit;
  assert.equal(groups.length, 1);
  assert.notEqual(groups[0].hooks[0].args[0], path.join(old.root, 'adapters/claude.cjs').replace(/\\/g, '/'));
  assert.equal(knownRuntimes(path.join(home, '.fluentloop')).length, 2);
});
test('modified runtime refuses setup; removal can still remove its hook', t => {
  const { home, run } = fixture(t);
  assert.equal(run(['init', '--tool', 'claude', '--yes']).status, 0);
  const root = knownRuntimes(path.join(home, '.fluentloop'))[0];
  fs.appendFileSync(path.join(root, 'policy/coaching.md'), 'user edit');
  assert.equal(run(['init', '--tool', 'claude', '--yes']).status, 1);
  assert.equal(run(['uninstall', '--tool', 'claude', '--yes']).status, 0);
});
test('linked runtime destination is refused', t => {
  const { home, dir, run } = fixture(t);
  const target = path.join(dir, 'unrelated');
  fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(home, '.fluentloop'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(run(['init', '--tool', 'both', '--yes']).status, 1);
  assert.deepEqual(fs.readdirSync(target), []);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
});
test('lock failure identifies completed targets and rerun finishes safely', t => {
  const { home, run } = fixture(t);
  const config = path.join(home, '.claude/settings.json');
  write(config, {});
  fs.writeFileSync(config + '.fluentloop.lock', 'synthetic lock');
  const result = run(['init', '--tool', 'both', '--yes']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Completed settings files:/);
  assert.ok(read(path.join(home, '.codex/hooks.json')).hooks);
  assert.deepEqual(read(config), {});
  fs.unlinkSync(config + '.fluentloop.lock');
  assert.equal(run(['init', '--tool', 'both', '--yes']).status, 0);
  assert.equal(read(path.join(home, '.codex/hooks.json')).hooks.UserPromptSubmit.length, 1);
});
for (const flags of [ ['--yes'], ['--dry-run'], ['--tool', 'other', '--yes'], ['--tool', 'both', '--config', 'example.json', '--yes'], ['--tool', 'codex', '--scope', 'other', '--yes'], ['--tool', 'codex', '--project', 'example', '--yes'], ['--tool', 'codex', '--mode', 'other', '--yes'] ]) {
  test(`invalid setup arguments write nothing: ${flags.join(' ')}`, t => {
    const { home, run } = fixture(t);
    assert.equal(run(['init', ...flags]).status, 1);
    assert.deepEqual(fs.readdirSync(home), []);
  });
}
