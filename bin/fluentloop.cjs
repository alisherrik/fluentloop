#!/usr/bin/env node
'use strict';
const { setup } = require('../src/setup.cjs');
const { handleInput } = require('../src/protocol.cjs');
const { version } = require('../package.json');
const HELP = `FluentLoop — practise English while you build.

  fluentloop init                         Choose Codex, Claude Code or both
  fluentloop init --tool both --dry-run    Preview without writing
  fluentloop init --tool codex --yes       Confirm explicitly for scripts
  fluentloop uninstall                    Choose what to remove
  fluentloop demo                         Local examples, no model calls

Options:
  --tool codex|claude|both   Select tools without the chooser
  --scope user|project      Default: user (all projects)
  --project <folder>        Project folder; requires --scope project
  --config <file>           Override one selected tool's settings file
  --mode coach|english-first  Default: coach; init only
  --home <folder>           Alternate home; config-directory environment variables still apply
  --data-dir <folder>       Runtime storage; default: <home>/.fluentloop
  --dry-run                Preview only; requires --tool
  --yes                    Confirm the preview noninteractively; requires --tool
  --version                Print version

Advanced aliases: install <codex|claude> --config <file> [options]
                  uninstall <codex|claude> --config <file> [options]
All writes require confirmation or --yes. No trust or instruction files are edited.
english-first is a limited non-English gate, not universal language detection.
Use [fluentloop:skip] or [fluentloop:retry] at the start of a prompt.
`;
async function main(args) {
  if (!args.length || ['--help', '-h', 'help'].includes(args[0])) { process.stdout.write(HELP); return; }
  if (args[0] === '--version' && args.length === 1) { process.stdout.write(version + '\n'); return; }
  const [action, ...rest] = args;
  if (action === 'demo') {
    if (rest.length) throw new Error('demo does not accept options.');
    for (const prompt of ['Please add a test for the login handler.', 'I wants add test for login handler.', '[fluentloop:retry] I want fix the login handler.', '[fluentloop:skip] Please work on this request without coaching.']) {
      const output = handleInput(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), { mode: 'english-first' });
      process.stdout.write(JSON.stringify({ prompt, output }, null, 2) + '\n');
    }
    return;
  }
  if (!['init', 'install', 'uninstall'].includes(action)) throw new Error('Unknown command. Run --help.');
  const options = { action: action === 'install' ? 'init' : action };
  const legacy = rest[0] && !rest[0].startsWith('--');
  if (legacy) options.tool = rest.shift();
  if (action === 'init' && legacy) throw new Error('Use init --tool <codex|claude|both>.');
  const names = { '--tool': 'tool', '--scope': 'scope', '--project': 'project', '--config': 'config', '--mode': 'mode', '--home': 'home', '--data-dir': 'dataDir' };
  const seen = new Set(legacy ? ['--tool'] : []);
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (seen.has(flag)) throw new Error(`Repeated option: ${flag}`);
    seen.add(flag);
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--yes') options.yes = true;
    else if (names[flag] && rest[i + 1] && !rest[i + 1].startsWith('--')) options[names[flag]] = rest[++i];
    else throw new Error(`Unknown or incomplete option: ${flag}`);
  }
  if (action === 'uninstall' && options.mode) throw new Error('uninstall removes either mode; omit --mode.');
  if ((legacy || action === 'install') && (!options.config || !['codex', 'claude'].includes(options.tool))) throw new Error('The explicit install/uninstall alias requires a tool and --config. Or use init --tool.');
  await setup(options);
}
if (require.main === module) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`FluentLoop: ${error.message}\n`); process.exitCode = 1; });
}
module.exports = { main };
