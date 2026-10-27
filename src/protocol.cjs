'use strict';
const { evaluate, MAX_INPUT_BYTES, MODES } = require('./engine.cjs');
function toHookOutput(result) {
  if (result.kind === 'block') return { decision: 'block', reason: result.reason };
  if (result.kind === 'context') return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: result.context } };
  return {};
}
function handleInput(raw, options) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) return {};
  let input;
  try { input = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { return {}; }
  return toHookOutput(evaluate(input, options));
}
async function run() {
  let mode = 'coach';
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fluentloop-managed=v1') continue;
    if (args[i] === '--mode' && MODES.includes(args[i + 1])) { mode = args[++i]; continue; }
    process.stderr.write('FluentLoop: invalid hook arguments; coaching skipped.\n');
    process.stdout.write('{}\n');
    return;
  }
  let length = 0;
  let oversized = false;
  const chunks = [];
  try {
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > MAX_INPUT_BYTES) { oversized = true; chunks.length = 0; }
      if (!oversized) chunks.push(chunk);
    }
    const output = oversized ? {} : handleInput(Buffer.concat(chunks).toString('utf8'), { mode, disabled: process.env.FLUENTLOOP_DISABLED === '1' });
    process.stdout.write(JSON.stringify(output) + '\n');
  } catch {
    process.stderr.write('FluentLoop: hook input unavailable; coaching skipped.\n');
    process.stdout.write('{}\n');
  }
}
module.exports = { handleInput, toHookOutput, run };
