'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rejectLinks, ROOT } = require('./install.cjs');
const FILES = ['adapters/codex.cjs', 'adapters/claude.cjs', 'src/engine.cjs', 'src/protocol.cjs', 'policy/coaching.md', 'LICENSE'];
const MARKER = 'fluentloop-runtime.json';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function runtimePlan(dataDir, source = ROOT) {
  const content = Object.fromEntries(FILES.map(file => [file, fs.readFileSync(path.join(source, file))]));
  const files = Object.fromEntries(FILES.map(file => [file, hash(content[file])]));
  const id = hash(JSON.stringify(files));
  const root = path.resolve(dataDir, 'runtimes', id);
  const manifest = { owner: 'fluentloop', schema: 1, files };
  rejectLinks(path.join(root, MARKER));
  if (fs.existsSync(root)) {
    const found = readManifest(root);
    if (!found || JSON.stringify(found.files) !== JSON.stringify(files)) throw new Error('Unrecognized FluentLoop runtime directory; no files changed. Choose another --data-dir.');
    for (const file of FILES) {
      const target = path.join(root, file);
      rejectLinks(target);
      if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== files[file]) throw new Error('Installed FluentLoop runtime was modified. Choose another --data-dir or restore the runtime before setup.');
    }
  }
  return { root, content, manifest, exists: fs.existsSync(root) };
}

function readManifest(root) {
  const target = path.join(root, MARKER);
  rejectLinks(target);
  if (!fs.existsSync(target)) return null;
  let value;
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return null; }
  if (value?.owner !== 'fluentloop' || value.schema !== 1 || !value.files ||
      Object.keys(value.files).length !== FILES.length ||
      FILES.some(file => !/^[a-f0-9]{64}$/.test(value.files[file]))) return null;
  const files = Object.fromEntries(FILES.map(file => [file, value.files[file]]));
  return hash(JSON.stringify(files)) === path.basename(root) ? { ...value, files } : null;
}

function knownRuntimes(dataDir) {
  const parent = path.resolve(dataDir, 'runtimes');
  rejectLinks(path.join(parent, '.path-check'));
  if (!fs.existsSync(parent)) return [];
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter(entry => /^[a-f0-9]{64}$/.test(entry.name))
    .map(entry => path.join(parent, entry.name))
    .filter(root => readManifest(root));
}

function copyRuntime(plan) {
  rejectLinks(path.join(plan.root, MARKER));
  if (plan.exists) return;
  const parent = path.dirname(plan.root);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, '.stage-'));
  try {
    for (const [file, content] of Object.entries(plan.content)) {
      const target = path.join(temporary, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
    }
    fs.writeFileSync(path.join(temporary, MARKER), JSON.stringify(plan.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, plan.root);
  } finally {
    // Only our freshly created staging directory can be removed here.
    if (path.dirname(temporary) !== parent || !path.basename(temporary).startsWith('.stage-')) throw new Error('Invalid staging cleanup path.');
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
  }
}
module.exports = { runtimePlan, knownRuntimes, copyRuntime, FILES };
