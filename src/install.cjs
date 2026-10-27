'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { MODES } = require('./engine.cjs');
const ROOT = path.resolve(__dirname, '..');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function makeHandler(tool, mode, root = ROOT) {
  if (!['codex', 'claude'].includes(tool)) throw new Error('Tool must be codex or claude.');
  if (!MODES.includes(mode)) throw new Error('Mode must be coach or english-first.');
  const script = path.join(root, 'adapters', `${tool}.cjs`).replace(/\\/g, '/');
  const base = { type: 'command', timeout: 5, statusMessage: 'FluentLoop: English practice' };
  if (tool === 'claude') return { ...base, command: 'node', args: [script, '--fluentloop-managed=v1', '--mode', mode] };
  // Codex shell commands must be safe across cmd, PowerShell and POSIX shells.
  // Reject shell-active paths rather than guessing which shell will run them.
  if (!/^[\p{L}\p{N} _./:()~\-]+$/u.test(script)) throw new Error('Codex requires a checkout path containing only letters, digits, spaces, _, -, ., /, :, ~, or parentheses. Move the checkout to a simple path.');
  return { ...base, command: `node "${script}" --fluentloop-managed=v1 --mode ${mode}` };
}

function validateConfig(config) {
  if (!isObject(config)) throw new Error('Settings must be a JSON object.');
  if (Object.hasOwn(config, 'hooks') && !isObject(config.hooks)) throw new Error('Settings hooks must be an object.');
  const groups = config.hooks?.UserPromptSubmit;
  if (groups !== undefined && (!Array.isArray(groups) || groups.some(g => !isObject(g) || !Array.isArray(g.hooks) || g.hooks.some(h => !isObject(h))))) {
    throw new Error('UserPromptSubmit must contain groups with hook arrays.');
  }
}

function plan(config, { action, tool, mode = 'coach', root = ROOT }) {
  if (!['install', 'uninstall'].includes(action)) throw new Error('Action must be install or uninstall.');
  validateConfig(config);
  const desired = makeHandler(tool, mode, root);
  const known = MODES.map(m => makeHandler(tool, m, root));
  const next = structuredClone(config);
  let found = 0;
  const groups = [];
  for (const group of next.hooks?.UserPromptSubmit || []) {
    // Never take ownership of a user-edited group or handler.
    const standardGroup = Object.keys(group).every(k => k === 'hooks');
    const hooks = group.hooks.filter(handler => {
      const owned = standardGroup && known.some(k => isDeepStrictEqual(handler, k));
      const marked = (typeof handler.command === 'string' && handler.command.includes('--fluentloop-managed=v1')) ||
        (Array.isArray(handler.args) && handler.args.includes('--fluentloop-managed=v1'));
      if (marked && !owned) throw new Error('Found a modified FluentLoop hook or a different checkout. Restore its original definition or remove it manually after review; no settings changed.');
      if (owned) found++;
      return !owned;
    });
    if (hooks.length || hooks.length === group.hooks.length) groups.push({ ...group, hooks });
  }
  if (action === 'install') {
    groups.push({ hooks: [desired] });
    next.hooks ||= {};
    next.hooks.UserPromptSubmit = groups;
  } else if (found) {
    if (groups.length) next.hooks.UserPromptSubmit = groups;
    else delete next.hooks.UserPromptSubmit;
    if (!Object.keys(next.hooks).length) delete next.hooks;
  }
  return { next, changed: !isDeepStrictEqual(config, next), found, handler: desired };
}

function rejectLinks(target) {
  for (let current = target; ; current = path.dirname(current)) {
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (current === target && stat.nlink > 1)) throw new Error('Refusing linked settings paths. Choose a regular file and directory.');
      if (current === target && !stat.isFile()) throw new Error('Settings target must be a regular file.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
}

function readSettings(target) {
  let raw = null;
  try { raw = fs.readFileSync(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let config = {};
  if (raw !== null) {
    try { config = JSON.parse(raw.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Settings contain invalid JSON. No settings changed. Comments and trailing commas are not supported.'); }
  }
  return { raw, config };
}

function install({ configPath, dryRun = false, ...options }) {
  if (!configPath) throw new Error('An explicit --config path is required.');
  const target = path.resolve(configPath);
  rejectLinks(target);
  const { raw, config } = readSettings(target);
  const result = plan(config, options);
  const summary = { action: options.action, tool: options.tool, configPath: target, dryRun, changed: result.changed, matchingHandlers: result.found };
  if (options.action === 'install') summary.handler = result.handler;
  if (!result.changed || dryRun) return summary;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const lock = `${target}.fluentloop.lock`;
  let lockFd;
  let temporary;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
    rejectLinks(target);
    if (readSettings(target).raw !== raw) throw new Error('Settings changed during planning. Retry after the other editor finishes.');
    const permissions = raw === null ? 0o600 : fs.statSync(target).mode & 0o777;
    temporary = path.join(path.dirname(target), `.fluentloop-${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(result.next, null, 2) + '\n', { flag: 'wx', mode: permissions });
    fs.renameSync(temporary, target);
    temporary = undefined;
  } finally {
    if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); }
  }
  return summary;
}
module.exports = { makeHandler, plan, install };
