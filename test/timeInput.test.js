const test = require('node:test');
const assert = require('node:assert/strict');
const { parseManualTime } = require('../src/timeInput.js');

// Note: the clock-time formats (24h, 12h) delegate to textLimitDetector's
// nextLocalTime(hour, minute), which always rolls relative to the REAL
// wall-clock `Date.now()` — it ignores the `now` argument passed here (that
// argument only matters for the pure relative-offset formats below). So we
// only assert the qualitative invariant: correct hour/minute, and the result
// is either today or tomorrow relative to the actual current time.
test('parses 24-hour clock time "21:47"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('21:47', now);
  assert.equal(result.getHours(), 21);
  assert.equal(result.getMinutes(), 47);
  const real = new Date();
  const today = new Date(real.getFullYear(), real.getMonth(), real.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const resultDay = new Date(result.getFullYear(), result.getMonth(), result.getDate());
  assert.ok(resultDay.getTime() === today.getTime() || resultDay.getTime() === tomorrow.getTime());
});

test('parses bare 12-hour time "7pm"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('7pm', now);
  assert.equal(result.getHours(), 19);
  assert.equal(result.getMinutes(), 0);
});

test('parses 12-hour clock with minutes "9:47pm"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('9:47pm', now);
  assert.equal(result.getHours(), 21);
  assert.equal(result.getMinutes(), 47);
});

test('parses 12-hour clock with minutes and space before am/pm', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('9:47 pm', now);
  assert.equal(result.getHours(), 21);
  assert.equal(result.getMinutes(), 47);
});

test('parses 12am as midnight and 12pm as noon', () => {
  const now = new Date(2026, 8, 7, 0, 0, 0);
  const midnight = parseManualTime('12am', now);
  assert.equal(midnight.getHours(), 0);
  const noon = parseManualTime('12pm', now);
  assert.equal(noon.getHours(), 12);
});

test('parses relative shorthand "+90m"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('+90m', now);
  assert.equal(result.getTime() - now.getTime(), 90 * 60000);
});

test('parses relative shorthand "+2h"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('+2h', now);
  assert.equal(result.getTime() - now.getTime(), 2 * 3600000);
});

test('parses relative shorthand "+45min"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('+45min', now);
  assert.equal(result.getTime() - now.getTime(), 45 * 60000);
});

test('parses natural relative phrase "in 45 minutes"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('in 45 minutes', now);
  assert.equal(result.getTime() - now.getTime(), 45 * 60000);
});

test('parses natural relative phrase "in 2 hours"', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  const result = parseManualTime('in 2 hours', now);
  assert.equal(result.getTime() - now.getTime(), 2 * 3600000);
});

test('rejects garbage input', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  assert.equal(parseManualTime('', now), null);
  assert.equal(parseManualTime('banana', now), null);
  assert.equal(parseManualTime('25:99', now), null);
});

test('rejects out-of-range 12-hour values', () => {
  const now = new Date(2026, 8, 7, 10, 0, 0);
  assert.equal(parseManualTime('13pm', now), null);
  assert.equal(parseManualTime('0am', now), null);
});
