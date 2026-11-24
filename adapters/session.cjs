'use strict';
// SessionStart hook for Codex and Claude Code: makes sure the local dashboard is running.
// It never blocks the session; every failure prints {} and exits 0.
const { defaultDataDir } = require('../src/corrections.cjs');
const { ensureRunning } = require('../src/dashboard.cjs');

async function run() {
  try {
    for await (const chunk of process.stdin) void chunk; // The event content is not needed.
    if (process.env.FLUENTLOOP_DISABLED !== '1') await ensureRunning({ dataDir: defaultDataDir() });
  } catch {
    process.stderr.write('FluentLoop: dashboard not started.\n');
  }
  process.stdout.write('{}\n');
}
if (require.main === module) run();
