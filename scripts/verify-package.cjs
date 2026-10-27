'use strict';
// Run with npm run test:package. All npm writes and hook settings stay in this fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) throw new Error('Run this check with npm run test:package.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentloop-package-'));
function removeFixture(target) {
  const resolved = path.resolve(target);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) throw new Error('Refusing cleanup outside package fixture.');
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('fluentloop-package-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
const home = path.join(dir, 'test home');
const cache = path.join(dir, 'npm cache');
const prefix = path.join(dir, 'installed package');
fs.mkdirSync(home);
const userConfig = path.join(dir, 'empty-user.npmrc');
const globalConfig = path.join(dir, 'empty-global.npmrc');
fs.writeFileSync(userConfig, '');
fs.writeFileSync(globalConfig, '');
const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', FLUENTLOOP_DISABLED: '0',
  npm_config_cache: cache, npm_config_userconfig: userConfig, npm_config_globalconfig: globalConfig,
  npm_config_logs_max: '0', npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' };
// npm run exports config paths as well as npm_config_*; do not let those select active config.
for (const key of Object.keys(env)) {
  if (/^npm_config_/i.test(key) && !['npm_config_cache', 'npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_logs_max', 'npm_config_update_notifier', 'npm_config_audit', 'npm_config_fund'].includes(key)) delete env[key];
}
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { encoding: 'utf8', cwd: dir, env, timeout: 60000, ...options });
  assert.equal(result.status, 0, `npm ${args[0]} failed: ${result.stderr || result.error}`);
  return result.stdout;
}
try {
  const metadata = JSON.parse(run(['pack', ROOT, '--pack-destination', dir, '--ignore-scripts', '--json', '--offline']))[0];
  const paths = metadata.files.map(file => file.path);
  for (const required of ['bin/fluentloop.cjs', 'src/setup.cjs', 'src/runtime.cjs', 'src/engine.cjs', 'adapters/codex.cjs', 'adapters/claude.cjs', 'policy/coaching.md', 'LICENSE']) assert.ok(paths.includes(required), required);
  for (const file of paths) assert.match(file, /^(?:bin\/|src\/|adapters\/|policy\/|examples\/|docs\/|README\.md$|LICENSE$|LICENSE-GUIDANCE\.md$|package\.json$)/);
  const binMode = metadata.files.find(file => file.path === 'bin/fluentloop.cjs').mode;
  assert.ok(binMode & 0o444, 'Packed bin must be readable.');
  // Windows has no POSIX execute bit; verify its installed .cmd shim below.
  if (process.platform !== 'win32') assert.ok(binMode & 0o111, 'Packed POSIX bin must be executable.');
  const tarball = path.join(dir, metadata.filename);
  run(['install', '--prefix', prefix, tarball, '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  const installed = path.join(prefix, 'node_modules/fluentloop');
  const version = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version;
  assert.ok(fs.readFileSync(path.join(installed, 'bin/fluentloop.cjs'), 'utf8').startsWith('#!/usr/bin/env node\n'));
  const shim = path.join(prefix, 'node_modules/.bin', process.platform === 'win32' ? 'fluentloop.cmd' : 'fluentloop');
  const command = process.platform === 'win32' ? `"${shim}" --version` : shim;
  const binary = process.platform === 'win32'
    ? spawnSync(command, { shell: true, encoding: 'utf8', cwd: dir, env })
    : spawnSync(command, ['--version'], { encoding: 'utf8', cwd: dir, env });
  assert.equal(binary.status, 0, binary.stderr);
  assert.equal(binary.stdout.trim(), version);
  const preview = run(['exec', '--yes', '--offline', '--package', tarball, '--', 'fluentloop', 'init', '--tool', 'both', '--dry-run']);
  assert.match(preview, /Dry run/);
  assert.deepEqual(fs.readdirSync(home), []);
  const setup = run(['exec', '--yes', '--offline', '--package', tarball, '--', 'fluentloop', 'init', '--tool', 'both', '--yes']);
  assert.match(setup, /Confirmed by --yes/);
  assert.match(run(['exec', '--yes', '--offline', '--package', tarball, '--', 'fluentloop', 'init', '--tool', 'both', '--yes']), /Already up to date/);
  const claude = JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8')).hooks.UserPromptSubmit[0].hooks[0];
  const codex = JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf8')).hooks.UserPromptSubmit[0].hooks[0];
  assert.ok(claude.args[0].startsWith(home.replace(/\\/g, '/') + '/.fluentloop/runtimes/'));
  const input = '{"hook_event_name":"UserPromptSubmit","prompt":"Please explain a unit test."}';
  removeFixture(prefix);
  removeFixture(cache);
  // The npm cache and installed package are gone; the hook must still function.
  const hook = spawnSync(process.execPath, claude.args, { input, encoding: 'utf8', cwd: dir, env });
  assert.equal(hook.status, 0, hook.stderr);
  assert.ok(JSON.parse(hook.stdout).hookSpecificOutput);
  const otherHook = spawnSync(codex.command, { input, encoding: 'utf8', cwd: dir, env, shell: true });
  assert.equal(otherHook.status, 0, otherHook.stderr);
  assert.ok(JSON.parse(otherHook.stdout).hookSpecificOutput);
  // A fresh npm exec can uninstall the previous cached invocation's runtime-backed hooks.
  const removed = run(['exec', '--yes', '--offline', '--package', tarball, '--', 'fluentloop', 'uninstall', '--tool', 'both', '--yes']);
  assert.match(removed, /Removed from the selected settings/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf8')), {});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8')), {});
  console.log(`PASS: fluentloop ${version}; ${paths.length} packed files; executable bin; local install; offline npm exec init/dry-run/repeat/uninstall; both hooks survive package/cache removal.`);
} finally { removeFixture(dir); }
