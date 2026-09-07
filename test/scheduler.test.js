const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTimes, dueTimes, nextOccurrence } = require('../src/scheduler.js');

test('normalizeTimes dedupes and sorts', () => {
  assert.deepEqual(normalizeTimes(['09:05', '19:30', '09:05'], '19:30'), ['09:05', '19:30']);
});

test('normalizeTimes zero-pads', () => {
  assert.deepEqual(normalizeTimes(['9:05'], '19:30'), ['09:05']);
});

test('normalizeTimes falls back to legacySingle when array is empty', () => {
  assert.deepEqual(normalizeTimes([], '19:30'), ['19:30']);
});

test('normalizeTimes falls back to legacySingle when array has no valid entries', () => {
  assert.deepEqual(normalizeTimes(['nope', '25:99'], '09:00'), ['09:00']);
});

test('normalizeTimes returns empty array when both times and legacySingle are invalid', () => {
  assert.deepEqual(normalizeTimes([], 'garbage'), []);
});

test('dueTimes returns a time matching current minute and not already run', () => {
  const now = new Date(2026, 8, 7, 19, 30, 0);
  const alreadyRan = new Set();
  assert.deepEqual(dueTimes(now, ['19:30', '09:05'], alreadyRan), ['19:30']);
});

test('dueTimes excludes a time already run today', () => {
  const now = new Date(2026, 8, 7, 19, 30, 0);
  const alreadyRan = new Set(['2026-9-7|19:30']);
  assert.deepEqual(dueTimes(now, ['19:30', '09:05'], alreadyRan), []);
});

test('nextOccurrence returns null for empty times array', () => {
  assert.equal(nextOccurrence(new Date(), []), null);
});

test('nextOccurrence returns a Date matching hour/minute of a time not yet passed today', () => {
  const now = new Date();
  const future = new Date(now.getTime() + 5 * 60000);
  const hh = String(future.getHours()).padStart(2, '0');
  const mm = String(future.getMinutes()).padStart(2, '0');
  const result = nextOccurrence(now, [`${hh}:${mm}`]);
  assert.equal(result.getHours(), future.getHours());
  assert.equal(result.getMinutes(), future.getMinutes());
  assert.equal(result.getDate(), now.getDate());
});

test('nextOccurrence rolls to tomorrow for a time already passed today', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 5 * 60000);
  const hh = String(past.getHours()).padStart(2, '0');
  const mm = String(past.getMinutes()).padStart(2, '0');
  const result = nextOccurrence(now, [`${hh}:${mm}`]);
  assert.equal(result.getHours(), past.getHours());
  assert.equal(result.getMinutes(), past.getMinutes());
  const expectedTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDate();
  assert.equal(result.getDate(), expectedTomorrow);
});
