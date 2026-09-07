const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, isClaudeCommand, detectLimit, nextLocalTime } = require('../src/textLimitDetector.js');

test('parses pipe-delimited unix seconds timestamp', () => {
  const seconds = 1760000400;
  const line = `Claude AI usage limit reached|${seconds}`;
  const result = detectLimit(line);
  assert.ok(result);
  assert.equal(result.resetAt.getTime(), seconds * 1000);
});

test('parses pipe-delimited unix milliseconds timestamp', () => {
  const ms = 1760000400000;
  const line = `Claude AI usage limit reached|${ms}`;
  const result = detectLimit(line);
  assert.ok(result);
  assert.equal(result.resetAt.getTime(), ms);
});

test('parses clock-time style when the reset keyword trails the time (actual regex requires the keyword after the digits for a bare 24h time, or am/pm when the keyword leads)', () => {
  // Note: the current timePatterns[0] regex requires an am/pm suffix when the
  // "reset"/"again"/etc keyword comes BEFORE the time, so "resets at 21:47"
  // (no am/pm) does NOT match and resetAt comes back null (covered below).
  // timePatterns[1] allows a bare 24h time when the keyword trails it instead.
  const result = detectLimit('You have hit your usage limit, 21:47 is when it resets');
  assert.ok(result);
  assert.ok(result.resetAt instanceof Date);
  assert.equal(result.resetAt.getHours(), 21);
  assert.equal(result.resetAt.getMinutes(), 47);
});

test('"resets at HH:mm" with no am/pm currently yields no parseable time (locks in existing regex behavior)', () => {
  const result = detectLimit('You have hit your usage limit, resets at 21:47');
  assert.ok(result);
  assert.equal(result.resetAt, null);
});

test('parses bare 7pm (no minutes)', () => {
  const result = detectLimit('You have hit your usage limit, try again after 7pm');
  assert.ok(result);
  assert.ok(result.resetAt instanceof Date);
  assert.equal(result.resetAt.getHours(), 19);
  assert.equal(result.resetAt.getMinutes(), 0);
});

test('parses "try again in 30 minutes" duration', () => {
  const before = Date.now();
  const result = detectLimit('You have hit your usage limit, try again in 30 minutes');
  const after = Date.now();
  assert.ok(result);
  assert.ok(result.resetAt instanceof Date);
  const delta = result.resetAt.getTime() - before;
  assert.ok(delta >= 30 * 60000 && delta <= 30 * 60000 + (after - before));
});

test('rejects documentation/comment-noise lines', () => {
  const result = detectLimit('For example, e.g. a usage limit reached message such as this one is documented in the README');
  assert.equal(result, null);
});

test('rejects markdown/comment-prefixed lines', () => {
  const result = detectLimit('// usage limit reached example');
  assert.equal(result, null);
});

test('returns a signal with null resetAt when limit detected but no time parseable', () => {
  const result = detectLimit('You have hit your usage limit somewhere');
  assert.ok(result);
  assert.equal(result.resetAt, null);
});

test('clean strips ANSI codes and carriage returns', () => {
  const withAnsi = '\x1B[31mhello\x1B[0m\r\nworld';
  assert.equal(clean(withAnsi), 'hello\nworld');
});

test('isClaudeCommand recognizes claude invocations', () => {
  assert.equal(isClaudeCommand('claude'), true);
  assert.equal(isClaudeCommand('npx @anthropic-ai/claude-code'), true);
  assert.equal(isClaudeCommand('ls -la'), false);
});

test('nextLocalTime returns a Date matching the requested hour/minute', () => {
  const result = nextLocalTime(13, 25);
  assert.equal(result.getHours(), 13);
  assert.equal(result.getMinutes(), 25);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const resultDay = new Date(result.getFullYear(), result.getMonth(), result.getDate());
  assert.ok(resultDay.getTime() === today.getTime() || resultDay.getTime() === tomorrow.getTime());
});

test('nextLocalTime rolls to tomorrow when time has already passed today', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 60000);
  const result = nextLocalTime(past.getHours(), past.getMinutes());
  assert.equal(result.getHours(), past.getHours());
  assert.equal(result.getMinutes(), past.getMinutes());
  assert.ok(result.getTime() > Date.now() - 1000);
});
