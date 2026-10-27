#!/usr/bin/env node
'use strict';
const { install } = require('../src/install.cjs');
const { handleInput } = require('../src/protocol.cjs');
const HELP = `FluentLoop — practise English while you build.

  node bin/fluentloop.cjs demo
  node bin/fluentloop.cjs install <codex|claude> --config <file> [--mode <coach|english-first>] [--dry-run]
  node bin/fluentloop.cjs uninstall <codex|claude> --config <file> [--dry-run]

Default mode: coach (model-guided feedback, no local blocking).
english-first adds a limited non-English work-request gate, not universal language detection.
Always name the settings file. No trust or instruction files are edited.
Run --dry-run first. Keep this checkout in place while installed.
Use [fluentloop:skip] or [fluentloop:retry] at the start of a prompt.
`;
function main(args) {
  if (!args.length || ['--help', '-h', 'help'].includes(args[0])) { process.stdout.write(HELP); return; }
  const [action, tool, ...flags] = args;
  if (action === 'demo') {
    if (args.length !== 1) throw new Error('demo does not accept options.');
    for (const prompt of ['Please add a test for the login handler.', 'I wants add test for login handler.', '[fluentloop:retry] I want fix the login handler.', '[fluentloop:skip] Please work on this request without coaching.']) {
      const output = handleInput(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), { mode: 'english-first' });
      process.stdout.write(JSON.stringify({ prompt, output }, null, 2) + '\n');
    }
    return;
  }
  if (!['install', 'uninstall'].includes(action)) throw new Error('Unknown command. Run --help.');
  const options = { action, tool };
  const seen = new Set();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (seen.has(flag)) throw new Error(`Repeated option: ${flag}`);
    seen.add(flag);
    if (flag === '--dry-run') options.dryRun = true;
    else if (['--config', '--mode'].includes(flag) && flags[i + 1] && !flags[i + 1].startsWith('--')) {
      if (action === 'uninstall' && flag === '--mode') throw new Error('uninstall removes either mode; omit --mode.');
      options[flag === '--config' ? 'configPath' : 'mode'] = flags[++i];
    } else throw new Error(`Unknown or incomplete option: ${flag}`);
  }
  process.stdout.write(JSON.stringify(install(options), null, 2) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`FluentLoop: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = { main };
