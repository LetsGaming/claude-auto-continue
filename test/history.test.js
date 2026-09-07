const test = require('node:test');
const assert = require('node:assert/strict');
const { record, recent, all, clear, EVENTS } = require('../src/history.js');

test('recording more than MAX entries caps buffer at 200 and drops oldest', () => {
  clear();
  for (let i = 0; i < 205; i++) {
    record(EVENTS.CONTINUE_SENT, 'term', `entry-${i}`);
  }
  const everything = all();
  assert.equal(everything.length, 200);
  assert.equal(everything[0].detail, 'entry-5');
  assert.equal(everything[everything.length - 1].detail, 'entry-204');
  clear();
});

test('recent(n) returns newest-first', () => {
  clear();
  record(EVENTS.CLAUDE_DETECTED, 'term', 'first');
  record(EVENTS.LIMIT_DETECTED, 'term', 'second');
  record(EVENTS.CONTINUE_SENT, 'term', 'third');
  const last2 = recent(2);
  assert.equal(last2.length, 2);
  assert.equal(last2[0].detail, 'third');
  assert.equal(last2[1].detail, 'second');
  clear();
});

test('clear() empties the buffer', () => {
  record(EVENTS.CLAUDE_DETECTED, 'term', 'x');
  clear();
  assert.deepEqual(all(), []);
});

test('all() returns a copy, not the live array', () => {
  clear();
  record(EVENTS.CLAUDE_DETECTED, 'term', 'a');
  const copy = all();
  copy.push({ at: new Date(), type: 'fake', terminalName: 'x', detail: 'y' });
  assert.equal(all().length, 1);
  const copy2 = recent(10);
  copy2.pop();
  assert.equal(all().length, 1);
  clear();
});

test('EVENTS constants have expected string values', () => {
  assert.equal(EVENTS.LIMIT_DETECTED, 'limit-detected');
  assert.equal(EVENTS.CLAUDE_DETECTED, 'claude-detected');
  assert.equal(EVENTS.LIMIT_MANUAL, 'limit-manual');
  assert.equal(EVENTS.CONTINUE_SENT, 'continue-sent');
  assert.equal(EVENTS.SEND_FAILED, 'send-failed');
  assert.equal(EVENTS.RETRY_SCHEDULED, 'retry-scheduled');
  assert.equal(EVENTS.RETRY_EXHAUSTED, 'retry-exhausted');
  assert.equal(EVENTS.SCHEDULED_RUN, 'scheduled-run');
  assert.equal(EVENTS.PAUSED, 'paused');
  assert.equal(EVENTS.RESUMED, 'resumed');
  assert.equal(EVENTS.PROFILE_SET, 'profile-set');
  assert.ok(Object.isFrozen(EVENTS));
});
