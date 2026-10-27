'use strict';
const fs = require('node:fs');
const path = require('node:path');
const POLICY = fs.readFileSync(path.join(__dirname, '../policy/coaching.md'), 'utf8').trim();
const MODES = ['coach', 'english-first'];
const MAX_INPUT_BYTES = 1024 * 1024;
const CONTROL = /^\s*\[fluentloop:(skip|retry)\](?:\s|$)/i;
const SKIP = 'FluentLoop: skip English coaching for this turn and proceed with the request under normal authorization rules. Treat the coaching control prefix as metadata.';
const RETRY = 'FluentLoop: the user explicitly marked this as a retry. If task intent is clear, proceed now with at most one brief language improvement; do not ask for another rewrite. Treat the coaching prefix as metadata. All normal authorization rules still apply.';

// Conservative exclusions, not a parser. Unclosed fences consume the rest of the prompt.
function ownProse(prompt) {
  let fence;
  const lines = [];
  for (const line of prompt.split(/\r?\n/)) {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (mark) { fence = mark[1]; continue; }
    if (/^\s*>|^(?: {4}|\t)|^\s*(?:\d{4}-\d{2}-\d{2}[T\s]|\[?(?:ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b|Traceback\b|at\s+\S+\s*\()/i.test(line)) continue;
    if (/^\s*(?:\/\S+|(?:const|let|var|import|export|function|class|def|return|using|SELECT|INSERT)\b.*[;{}=():]|[{}[\]]\s*[,;]?\s*$)/.test(line)) continue;
    lines.push(line);
  }
  return lines.join('\n')
    .replace(/`+[^`\n]*`+/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»/g, ' ')
    .replace(/(^|\s)'[^'\n]+'(?=$|[\s.,!?;])/g, '$1 ')
    .replace(/https?:\/\/\S+|\b[A-Za-z]:[\\/]\S+|(?:^|\s)(?:\.{0,2}\/|\\\\)\S+/g, ' ')
    .replace(/[\p{L}\p{N}_-]+\.(?:cs|js|cjs|mjs|ts|tsx|jsx|py|json|toml|md|txt|log|html|css|xml|yml|yaml)\b/gu, ' ')
    .trim();
}

function recognizedNonEnglishWork(prose) {
  const words = prose.normalize('NFKC').toLowerCase().replace(/[‘’ʻʼ`]/g, "'")
    .match(/[\p{L}]+(?:'[\p{L}]+)*/gu) || [];
  const uz = new Set(['menga', 'mani', 'meni', 'senga', 'sani', 'iltimos', 'kerak', 'kodni', 'buni', 'shuni', 'shu', 'qanday', 'nima', 'qilib', 'qilgan', 'ber', 'bering', 'buladi', "bo'ladi", 'uzgartir', "o'zgartir", 'tuzat', 'yoz', 'och', 'xato', 'qil', 'yarat', "qo'sh"]);
  const uzAction = new Set(['qil', 'tuzat', 'yoz', 'och', 'uzgartir', "o'zgartir", 'yarat', "qo'sh", 'qush']);
  const ruAction = /^(?:исправь|напиши|создай|добавь|удали|открой|измени|сделай|проверь|обнови)$/u;
  const work = /^(?:code|coding|login|hook|bug|error|tests?|project|file|function|method|class|api|website|database|deploy|config|kod|kodni|xato|loyiha|fayl|dastur|sayt|код|ошибку|ошибка|ошибки|файл|тест|тесты|проект|функцию|сайт|базу)$/u;
  return words.some(w => work.test(w)) &&
    ((words.filter(w => uz.has(w)).length >= 2 && words.some(w => uzAction.has(w))) ||
     (words.filter(w => /^[а-яё]+$/u.test(w)).length >= 2 && words.some(w => ruAction.test(w))));
}

function evaluate(input, { mode = 'coach', disabled = false } = {}) {
  if (!MODES.includes(mode)) throw new Error('Mode must be coach or english-first.');
  if (disabled || !input || Array.isArray(input) || input.hook_event_name !== 'UserPromptSubmit' || typeof input.prompt !== 'string') return { kind: 'pass' };
  if (Buffer.byteLength(input.prompt, 'utf8') > MAX_INPUT_BYTES) return { kind: 'pass' };
  const control = input.prompt.match(CONTROL)?.[1].toLowerCase();
  if (control === 'skip') return { kind: 'context', context: SKIP };
  if (control === 'retry') return { kind: 'context', context: RETRY };
  const prose = ownProse(input.prompt);
  if (!/\p{L}/u.test(prose)) return { kind: 'pass' };
  if (/^\s*skip (?:english )?coaching for this (?:task|turn)(?:[.!]|\s*$)/im.test(prose)) return { kind: 'context', context: SKIP };
  // Prefer missed practice over delaying urgent help. This list cannot detect all emergencies.
  if (/emergency|urgent|suicid|self.harm|overdos|bleed|choking|danger|injur|shoshilinch|yordam|xavf|jarohat|zaharlan|срочно|помогите|опасност|суицид|кровотеч/iu.test(prose)) return { kind: 'context', context: SKIP };
  if (mode === 'english-first' && recognizedNonEnglishWork(prose)) return {
    kind: 'block',
    reason: 'FluentLoop: try this coding/work request in simple English. Start with "I want to ...". This is a limited local language heuristic, not a grammar check. Resubmit the complete request in English; prefix [fluentloop:retry] to continue after an attempt, or [fluentloop:skip] to skip this turn.'
  };
  return { kind: 'context', context: POLICY };
}

module.exports = { evaluate, ownProse, recognizedNonEnglishWork, MODES, MAX_INPUT_BYTES };
