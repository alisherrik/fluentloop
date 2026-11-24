'use strict';
// Local corrections notebook: one JSON object per line in <dataDir>/corrections.jsonl.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const FILE = 'corrections.jsonl';
const MARKER = /<!--\s*fluentloop:correction\s+(\{.*?\})\s*-->/g;
const LIMITS = { original: 2000, corrected: 2000, explanation: 1000 };
const TRANSCRIPT_TAIL_BYTES = 2 * 1024 * 1024;

// Installed runtimes live at <dataDir>/runtimes/<sha256>/; anything else uses ~/.fluentloop.
function defaultDataDir(root = path.resolve(__dirname, '..'), env = process.env) {
  if (env.FLUENTLOOP_DATA_DIR) return path.resolve(env.FLUENTLOOP_DATA_DIR);
  if (/^[a-f0-9]{64}$/.test(path.basename(root)) && path.basename(path.dirname(root)) === 'runtimes') return path.dirname(path.dirname(root));
  return path.join(os.homedir(), '.fluentloop');
}

function extract(text) {
  const found = [];
  if (typeof text !== 'string') return found;
  for (const match of text.matchAll(MARKER)) {
    let value;
    try { value = JSON.parse(match[1]); } catch { continue; }
    if (!value || typeof value !== 'object') continue;
    const item = {};
    for (const [key, max] of Object.entries(LIMITS)) {
      if (typeof value[key] !== 'string') break;
      const trimmed = value[key].trim();
      if (!trimmed || trimmed.length > max) break;
      item[key] = trimmed;
    }
    if (Object.keys(item).length === 3 && item.original !== item.corrected) found.push(item);
  }
  return found;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}

// Assistant text of the latest turn: Codex passes it directly; Claude Code may only give the transcript.
function lastAssistantText(input) {
  if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
  if (typeof input.transcript_path !== 'string') return '';
  let raw;
  try {
    const fd = fs.openSync(input.transcript_path, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      raw = buffer.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
  const texts = [];
  for (const line of raw.split('\n').reverse()) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type === 'assistant') texts.unshift(textOf(entry.message?.content));
    else if (entry?.type === 'user' && textOf(entry.message?.content)) break;
  }
  return texts.join('\n');
}

const idOf = (session, item) => crypto.createHash('sha256').update(JSON.stringify([session, item.original, item.corrected])).digest('hex').slice(0, 16);

function list(dataDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(dataDir, FILE), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const items = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const item = JSON.parse(line); if (item && typeof item.id === 'string') items.push(item); } catch { /* skip a torn line */ }
  }
  return items;
}

function save(dataDir, found, { session = '', tool = '', now = new Date() } = {}) {
  if (!found.length) return [];
  const known = new Set(list(dataDir).map(item => item.id));
  const added = [];
  for (const item of found) {
    const id = idOf(session, item);
    if (known.has(id)) continue;
    known.add(id);
    added.push({ id, at: now.toISOString(), tool, session, ...item });
  }
  if (!added.length) return [];
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(dataDir, FILE), added.map(item => JSON.stringify(item) + '\n').join(''), { mode: 0o600 });
  return added;
}

function remove(dataDir, id) {
  const items = list(dataDir);
  const kept = items.filter(item => item.id !== id);
  if (kept.length === items.length) return false;
  const target = path.join(dataDir, FILE);
  const temporary = path.join(dataDir, `.corrections-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, kept.map(item => JSON.stringify(item) + '\n').join(''), { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, target);
  return true;
}

module.exports = { defaultDataDir, extract, lastAssistantText, list, save, remove, FILE };
