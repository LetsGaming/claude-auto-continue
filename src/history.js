const MAX = 200;

const EVENTS = Object.freeze({
  CLAUDE_DETECTED: 'claude-detected',
  LIMIT_DETECTED: 'limit-detected',
  LIMIT_MANUAL: 'limit-manual',
  CONTINUE_SENT: 'continue-sent',
  SEND_FAILED: 'send-failed',
  RETRY_SCHEDULED: 'retry-scheduled',
  RETRY_EXHAUSTED: 'retry-exhausted',
  SCHEDULED_RUN: 'scheduled-run',
  PAUSED: 'paused',
  RESUMED: 'resumed',
  PROFILE_SET: 'profile-set'
});

let entries = [];

function record(type, terminalName, detail) {
  const entry = { at: new Date(), type, terminalName, detail };
  entries.push(entry);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  try {
    const line = `[history] ${type} ${terminalName}${detail ? `: ${detail}` : ''}`;
    require('./logger').log(line);
  } catch {
    // logger may not be initialized in unit tests
  }
  return entry;
}

function recent(n = 10) {
  return entries.slice(Math.max(0, entries.length - n)).reverse();
}

function all() {
  return entries.slice();
}

function clear() {
  entries = [];
}

module.exports = { record, recent, all, clear, EVENTS };
