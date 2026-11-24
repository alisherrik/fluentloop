'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { install, ROOT } = require('./install.cjs');
const { runtimePlan, knownRuntimes, copyRuntime } = require('./runtime.cjs');
const { MODES } = require('./engine.cjs');
const { stop } = require('./dashboard.cjs');

function resolvePaths(options, env = process.env, cwd = process.cwd()) {
  const home = path.resolve(options.home || os.homedir());
  const scope = options.scope || 'user';
  if (!['user', 'project'].includes(scope)) throw new Error('Scope must be user or project.');
  if (options.project && scope !== 'project') throw new Error('--project requires --scope project.');
  const project = path.resolve(options.project || cwd);
  const configs = scope === 'project'
    ? { codex: path.join(project, '.codex/hooks.json'), claude: path.join(project, '.claude/settings.local.json') }
    : { codex: path.resolve(env.CODEX_HOME || path.join(home, '.codex'), 'hooks.json'), claude: path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json') };
  if (options.config) {
    if (!['codex', 'claude'].includes(options.tool)) throw new Error('--config requires one explicit --tool (codex or claude).');
    configs[options.tool] = path.resolve(options.config);
  }
  return { home, scope, configs, dataDir: path.resolve(options.dataDir || path.join(home, '.fluentloop')) };
}

function reader(input, output) {
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(question) {
      output.write(question);
      const answer = await lines.next();
      if (answer.done) throw new Error('Input ended before confirmation. No settings changed. Use --tool and --yes for noninteractive setup.');
      return answer.value.trim();
    },
    close() { rl.close(); }
  };
}

async function setup(options, { input = process.stdin, output = process.stdout, env = process.env, cwd = process.cwd() } = {}) {
  if (!['init', 'uninstall'].includes(options.action)) throw new Error('Unknown setup action.');
  if (options.tool && !['codex', 'claude', 'both'].includes(options.tool)) throw new Error('Tool must be codex, claude or both.');
  if (options.mode !== undefined && !MODES.includes(options.mode)) throw new Error('Mode must be coach, english-first or light.');
  if (options.dashboard !== undefined && !['yes', 'no'].includes(options.dashboard)) throw new Error('--dashboard must be yes or no.');
  if ((options.yes || options.dryRun) && !options.tool) throw new Error('--yes and --dry-run require an explicit --tool (codex, claude or both).');
  const locations = resolvePaths(options, env, cwd);
  let prompts;
  const ask = question => { prompts ||= reader(input, output); return prompts.ask(question); };
  try {
    let tool = options.tool;
    if (!tool) {
      const found = ['codex', 'claude'].filter(t => fs.existsSync(locations.configs[t]));
      const defaultChoice = found.length === 1 && found[0] === 'claude' ? '2' : found.length === 2 ? '3' : '1';
      output.write('FluentLoop — practise English while you build.\n\n');
      output.write(`1. Codex CLI${found.includes('codex') ? ' (settings found)' : ''}\n2. Claude Code${found.includes('claude') ? ' (settings found)' : ''}\n3. Both\n`);
      while (!tool) {
        const choice = (await ask(`Choose a tool [${defaultChoice}]: `)) || defaultChoice;
        const choices = { '1': 'codex', '2': 'claude', '3': 'both', codex: 'codex', claude: 'claude', both: 'both' };
        tool = Object.hasOwn(choices, choice.toLowerCase()) ? choices[choice.toLowerCase()] : undefined;
        if (!tool) output.write('Enter 1, 2 or 3.\n');
      }
    }
    const tools = tool === 'both' ? ['codex', 'claude'] : [tool];
    const action = options.action === 'init' ? 'install' : 'uninstall';
    const interactive = !options.yes && !options.dryRun;
    let mode = options.mode;
    if (action === 'install' && !mode && interactive) {
      output.write('\nCoaching style:\n1. Light — correct my English and continue the task\n2. Coach — ask me for one rewrite first\n3. English-first — also stop non-English work requests\n');
      while (!mode) {
        const choice = (await ask('Choose a style [1]: ')) || '1';
        mode = { '1': 'light', '2': 'coach', '3': 'english-first' }[choice] || (MODES.includes(choice) ? choice : undefined);
        if (!mode) output.write('Enter 1, 2 or 3.\n');
      }
    }
    mode ||= 'light';
    let dashboard = options.dashboard;
    if (action === 'install' && !dashboard && interactive) {
      dashboard = /^(?:n|no)$/i.test(await ask('\nStart the corrections dashboard (http://127.0.0.1:4317) with each session? [Y/n]: ')) ? 'no' : 'yes';
    }
    dashboard = (dashboard || 'yes') === 'yes';
    const runtime = action === 'install' ? runtimePlan(locations.dataDir) : null;
    const roots = knownRuntimes(locations.dataDir);
    const knownRoots = [...roots, ROOT];
    const root = runtime?.root || roots[0] || ROOT;
    const requests = tools.map(t => ({ action, tool: t, configPath: locations.configs[t], mode, dashboard, root, knownRoots }));
    const previews = requests.map(request => install({ ...request, dryRun: true }));
    output.write(`\n${action === 'install' ? 'Setup' : 'Removal'} preview — ${options.config ? 'explicit settings file' : locations.scope === 'user' ? 'user scope (all projects)' : 'project scope'}\n`);
    const short = file => file.startsWith(locations.home + path.sep) ? '~' + file.slice(locations.home.length) : file;
    const names = { codex: 'Codex CLI', claude: 'Claude Code' };
    const width = Math.max(...previews.map(p => short(p.configPath).length));
    for (const preview of previews) {
      const change = !preview.changed ? 'no change' : action === 'install' ? `${mode} coaching + correction saver${dashboard ? ' + dashboard' : ''}` : 'remove FluentLoop hooks';
      output.write(`  ${names[preview.tool].padEnd(14)}${short(preview.configPath).padEnd(width + 3)}${change}\n`);
      if (options.dryRun && preview.handler) output.write(`    Coaching hook: ${JSON.stringify(preview.handler)}\n    Correction saver (Stop): ${JSON.stringify(preview.stopHandler)}\n${preview.sessionHandler ? `    Dashboard (SessionStart): ${JSON.stringify(preview.sessionHandler)}\n` : ''}`);
    }
    if (runtime) output.write(`  ${'Hook files'.padEnd(14)}${options.dryRun ? runtime.root : short(path.dirname(runtime.root)) + path.sep + path.basename(runtime.root).slice(0, 8) + '…'} (${runtime.exists ? 'already present' : 'new copy'})\n`);
    output.write(`Other settings stay intact. Hook trust and permissions are not changed.${options.dryRun ? '' : ' Use --dry-run to see the exact hooks.'}\n`);
    if (options.dryRun) { output.write('Dry run — no files written.\n'); return { applied: false, previews }; }
    if (!previews.some(p => p.changed) && (!runtime || runtime.exists)) {
      output.write('Already up to date. No files changed.\n'); return { applied: false, previews };
    }
    if (!options.yes && !/^(?:y|yes)$/i.test(await ask('Apply these changes? [y/N]: '))) {
      output.write('Cancelled. No files changed.\n'); return { applied: false, previews };
    }
    if (options.yes) output.write('Confirmed by --yes.\n');
    for (const request of requests) install({ ...request, dryRun: true });
    if (runtime) {
      const current = runtimePlan(locations.dataDir);
      if (current.root !== runtime.root) throw new Error('Bundled runtime changed during the preview. Run setup again; no settings changed.');
      copyRuntime(current);
    }
    const completed = [];
    try {
      for (const request of requests) {
        const result = install(request);
        completed.push(result.configPath);
        output.write(`${result.changed ? 'Updated' : 'Unchanged'}: ${result.configPath}\n`);
      }
    } catch (error) {
      throw new Error(`${error.message} Completed settings files: ${completed.length ? completed.join(', ') : 'none'}. Re-run after resolving the error; existing changes are preserved.`);
    }
    if (action === 'uninstall' && await stop({ dataDir: locations.dataDir }).catch(() => false)) output.write('Stopped the running dashboard.\n');
    output.write(action === 'install'
      ? 'Ready. Open /hooks in your coding tool to review activation; restart it if needed. FluentLoop has not approved hook trust.\n'
      : 'Removed from the selected settings. Bundled runtimes are retained for other scopes. Restart your coding tool if needed.\n');
    return { applied: true, previews };
  } finally { prompts?.close(); }
}
module.exports = { setup, resolvePaths };
