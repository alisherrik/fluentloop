'use strict';
// Stop hook for Codex and Claude Code: saves correction markers from the last reply to the local notebook.
// It never blocks the session; every failure prints {} and exits 0.
const { defaultDataDir, extract, lastAssistantText, save } = require('../src/corrections.cjs');
const MAX_INPUT_BYTES = 1024 * 1024;

function handleStop(raw, { dataDir = defaultDataDir(), tool = '' } = {}) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) return [];
  let input;
  try { input = JSON.parse(raw.replace(/^﻿/, '')); } catch { return []; }
  if (!input || typeof input !== 'object' || Array.isArray(input) || process.env.FLUENTLOOP_DISABLED === '1') return [];
  const session = typeof input.session_id === 'string' ? input.session_id : '';
  return save(dataDir, extract(lastAssistantText(input)), { session, tool });
}

async function run() {
  const args = process.argv.slice(2);
  const tool = args.includes('codex') ? 'codex' : args.includes('claude') ? 'claude' : '';
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > MAX_INPUT_BYTES) { chunks.length = 0; break; }
      chunks.push(chunk);
    }
    if (length <= MAX_INPUT_BYTES) handleStop(Buffer.concat(chunks).toString('utf8'), { tool });
  } catch {
    process.stderr.write('FluentLoop: correction not saved.\n');
  }
  process.stdout.write('{}\n');
}
module.exports = { handleStop };
if (require.main === module) run();
