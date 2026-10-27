'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, MAX_INPUT_BYTES } = require('../src/engine.cjs');
const { handleInput } = require('../src/protocol.cjs');
const event = prompt => ({ hook_event_name: 'UserPromptSubmit', prompt });
const gate = prompt => evaluate(event(prompt), { mode: 'english-first' });

for (const prompt of ['Menga login kodni tuzat', 'Iltimos kodni yoz', 'Исправь ошибку в коде', 'Создай файл проекта']) {
  test(`limited gate recognizes: ${prompt}`, () => {
    assert.equal(gate(prompt).kind, 'block');
    assert.equal(evaluate(event(prompt)).kind, 'context');
  });
}
for (const prompt of ['Please fix the login handler.', 'I wants fix login.', 'Fix bug', 'Salom', 'Bonjour, corrige le code.', 'Please update the manner and opening settings.']) {
  test(`gate does not claim general language/grammar detection: ${prompt}`, () => assert.equal(gate(prompt).kind, 'context'));
}
for (const prompt of [
  '```text\nMenga login kodni tuzat\n```',
  '~~~text\nИсправь ошибку в коде\n~~~',
  '```\nMenga login kodni tuzat',
  '> Menga login kodni tuzat',
  '    Menga login kodni tuzat',
  '\tMenga login kodni tuzat',
  '[ERROR] Menga login kodni tuzat',
  '2026-10-27T12:00:00 Menga login kodni tuzat',
  'at Menga.login(kodni.tuzat)',
  '`Menga login kodni tuzat`',
  '"Menga login kodni tuzat"',
  '“Menga login kodni tuzat”',
  '«Исправь ошибку в коде»',
  "'Menga login kodni tuzat'",
  'const message = "Menga login kodni tuzat";',
  'C:\\sample\\login.js', '/tmp/login.js', 'https://example.invalid/login',
  '/review Menga login kodni tuzat', '', '12345'
]) test(`code/log/quote/command exemption: ${JSON.stringify(prompt)}`, () => assert.equal(gate(prompt).kind, 'pass'));

test('preserves actual prose around excluded code', () => {
  assert.equal(gate('Menga login kodni tuzat\n```js\nconst x = 1;\n```').kind, 'block');
  assert.equal(gate('Please explain:\n```text\nMenga login kodni tuzat\n```').kind, 'context');
});
for (const control of ['skip', 'retry']) test(`${control} bypasses the gate only at the start`, () => {
  const output = gate(`[fluentloop:${control}] Menga login kodni tuzat`);
  assert.equal(output.kind, 'context');
  assert.match(output.context, control === 'skip' ? /skip English/ : /proceed now/);
  assert.equal(gate(`Menga login kodni tuzat [fluentloop:${control}]`).kind, 'block');
  assert.equal(gate(`> [fluentloop:${control}]\nMenga login kodni tuzat`).kind, 'block');
});
test('English rewrite can pass without stored session state', () => {
  assert.equal(gate('Menga login kodni tuzat').kind, 'block');
  assert.equal(gate('I want to fix the login handler.').kind, 'context');
  assert.equal(gate('Menga login kodni tuzat').kind, 'block');
});
for (const prefix of ['Skip English coaching for this task.', 'Skip coaching for this turn!', 'Emergency:', 'Shoshilinch:', 'Срочно:']) {
  test(`escape or urgency: ${prefix}`, () => assert.match(gate(`${prefix}\nMenga login kodni tuzat`).context, /skip English/));
}
test('disable switch skips all coaching output', () => assert.deepEqual(evaluate(event('Menga login kodni tuzat'), { disabled: true }), { kind: 'pass' }));
test('invalid mode is rejected by the library', () => assert.throws(() => evaluate(event('Hello'), { mode: 'invalid' })));
for (const raw of ['', '{', 'null', '[]', '42', 'true', '{}', '{"prompt":null}', '{"hook_event_name":"Stop","prompt":"Menga login kodni tuzat"}']) {
  test(`malformed or irrelevant input is fail-open: ${raw}`, () => assert.deepEqual(handleInput(raw), {}));
}
test('BOM input is accepted', () => assert.ok(handleInput('\uFEFF' + JSON.stringify(event('Please fix the test.'))).hookSpecificOutput));
test('oversized event is fail-open', () => assert.deepEqual(handleInput(JSON.stringify(event('x'.repeat(MAX_INPUT_BYTES)))), {}));
test('does not echo prompt or access transcript paths', () => {
  const output = handleInput(JSON.stringify({ ...event('privateSyntheticMarker'), transcript_path: 'DO-NOT-READ.jsonl', session_id: 'private-session' }));
  assert.ok(output.hookSpecificOutput);
  assert.doesNotMatch(JSON.stringify(output), /privateSyntheticMarker|private-session|DO-NOT-READ/);
});
test('block response has no promised model feedback', () => {
  const output = handleInput(JSON.stringify(event('Menga login kodni tuzat')), { mode: 'english-first' });
  assert.equal(output.decision, 'block');
  assert.equal(output.hookSpecificOutput, undefined);
  assert.match(output.reason, /complete request/);
});
