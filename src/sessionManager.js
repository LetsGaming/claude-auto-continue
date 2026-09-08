const vscode = require('vscode');
const logger = require('./logger');
const config = require('./config');
const { cfg, enabled } = config;
const transcriptWatcher = require('./transcriptWatcher');
const { terminalLooksLikeClaude } = require('./processDetector');
const history = require('./history');
const notify = require('./notify');
const sound = require('./sound');

const sessions = new Map();
const changeListeners = new Set();

function onChange(listener) {
  changeListeners.add(listener);
}

function notifyChange() {
  for (const listener of changeListeners) listener();
}

function sessionFor(terminal) {
  let s = sessions.get(terminal);
  if (!s) {
    s = {
      terminal,
      isClaude: false,
      limit: null,
      resetAt: null,
      execution: null,
      outputBuffer: '',
      lastSentAt: 0,
      retryTimer: null,
      retryCount: 0,
      cooldownUntil: 0,
      transcript: null,
      source: 'shell-integration',
      paused: false,
      messageProfile: null
    };
    sessions.set(terminal, s);
  }
  return s;
}

function workspaceCwdGuess() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
}

function attachTranscriptWatcher(session, cwd) {
  if (!cwd || session.transcript) return;
  session.transcript = transcriptWatcher.watch(cwd, hit => {
    handleLimit(session, { resetAt: hit.resetAt, raw: hit.text || 'transcript rate_limit' }).catch(err => logger.logError(err));
  });
}

function detachTranscriptWatcher(session) {
  session.transcript?.unwatch();
  session.transcript = null;
}

async function handleLimit(session, limit, opts = {}) {
  // Debounce repeated detections of the same limit (repeated terminal redraws, or the
  // transcript watcher and text fallback both reporting the same hit).
  const resetMs = limit.resetAt?.getTime() ?? null;
  if (!opts.force && session.limit && session.resetAt?.getTime() === resetMs) return;

  session.limit = true;
  session.resetAt = limit.resetAt;
  logger.log(`Limit detected in ${session.terminal.name}. Reset=${limit.resetAt?.toString() || 'unknown'}`);

  history.record(
    opts.force ? history.EVENTS.LIMIT_MANUAL : history.EVENTS.LIMIT_DETECTED,
    session.terminal.name,
    `resets at ${limit.resetAt ? limit.resetAt.toLocaleString() : 'unknown time'}`
  );
  notify.limitDetected(session, limit.resetAt);

  if (session.retryTimer) clearTimeout(session.retryTimer);

  if (limit.resetAt) {
    const grace = cfg().get('resetGraceSeconds', 15) * 1000;
    const delay = Math.max(0, limit.resetAt.getTime() - Date.now() + grace);
    session.retryTimer = setTimeout(() => continueSessionWhenReady(session, 'limit-reset').catch(err => logger.logError(err)), delay);
  } else {
    scheduleRetry(session);
  }

  notifyChange();
}

function scheduleRetry(session) {
  if (session.retryTimer) clearTimeout(session.retryTimer);
  session.retryCount = (session.retryCount || 0) + 1;
  const maxRetries = cfg().get('maxRetries', 10);
  if (session.retryCount > maxRetries) {
    logger.log(`Giving up on ${session.terminal.name}: limit message has no parseable reset time after ${maxRetries} retries. Use "Continue All Sessions Now" once it clears.`);
    history.record(history.EVENTS.RETRY_EXHAUSTED, session.terminal.name, `${session.retryCount - 1} retries`);
    notify.retriesExhausted(session);
    return;
  }
  const retrySeconds = cfg().get('retrySeconds', 30);
  const backoffEnabled = cfg().get('retryBackoff', true);
  const retryMaxSeconds = cfg().get('retryMaxSeconds', 600);
  let delaySeconds = retrySeconds;
  if (backoffEnabled) {
    delaySeconds = Math.min(retrySeconds * Math.pow(2, session.retryCount - 1), retryMaxSeconds);
  }
  history.record(history.EVENTS.RETRY_SCHEDULED, session.terminal.name, `retry ${session.retryCount} in ${delaySeconds}s`);
  session.retryTimer = setTimeout(() => continueSessionWhenReady(session, 'limit-retry').catch(err => logger.logError(err)), delaySeconds * 1000);
}

async function continueSessionWhenReady(session, reason) {
  if (session.paused) return;
  if (!enabled()) return;
  if (!session.terminal || !vscode.window.terminals.includes(session.terminal)) return;

  const now = Date.now();
  // Avoid duplicate sends caused by a timer firing twice or a repeated parser match.
  if (now - session.lastSentAt < 5000) return;

  // If a known reset is still in the future, reschedule precisely.
  if (session.resetAt && Date.now() < session.resetAt.getTime()) {
    const delay = session.resetAt.getTime() - Date.now() + cfg().get('resetGraceSeconds', 15) * 1000;
    session.retryTimer = setTimeout(() => continueSessionWhenReady(session, reason).catch(err => logger.logError(err)), delay);
    return;
  }

  await sendContinue(session, reason);
}

async function sendContinue(session, reason) {
  const message = config.resolveMessage(session);

  try {
    // sendText writes to the integrated terminal's stdin. It does not require the terminal to be focused.
    // Sending text and Enter in a single call wraps them together as a bracketed paste; Claude's TUI
    // treats the embedded newline as a literal line break rather than a submit keystroke, so the message
    // sits typed in the input box but never sends. Paste the text first, then press Enter separately.
    session.terminal.sendText(message, false);
    await new Promise(resolve => setTimeout(resolve, 150));
    session.terminal.sendText('', true);
    session.lastSentAt = Date.now();
    session.limit = false;
    session.resetAt = null;
    session.retryCount = 0;
    session.outputBuffer = '';
    // Ignore limit detections for a short window after sending: the terminal often redraws
    // the still-stale (pre-send) screen once more before the new command is actually
    // processed, and that stale redraw must not be misread as a fresh limit hit.
    session.cooldownUntil = Date.now() + 10000;
    logger.log(`Sent automatic continuation to ${session.terminal.name} (${reason}).`);
    notifyChange();
    history.record(history.EVENTS.CONTINUE_SENT, session.terminal.name, reason || '');
    notify.continueSent(session, reason);
    if (cfg().get('soundOnSend', false)) {
      sound.play();
    }
  } catch (error) {
    logger.log(`Could not send continuation to ${session.terminal.name}: ${error.message || error}`);
    history.record(history.EVENTS.SEND_FAILED, session.terminal.name, String(error?.message || error));
    notify.sendFailed(session, error);
    scheduleRetry(session);
  }
}

async function markIfClaude(terminal) {
  const existing = sessions.get(terminal);
  if (existing?.isClaude) return null;
  if (!(await terminalLooksLikeClaude(terminal))) return null;
  const session = sessionFor(terminal);
  session.isClaude = true;
  history.record(history.EVENTS.CLAUDE_DETECTED, terminal.name, '');
  attachTranscriptWatcher(session, terminal.shellIntegration?.cwd?.fsPath || workspaceCwdGuess());
  return session;
}

async function continueAll(reason) {
  if (!enabled() && reason !== 'manual') return;

  const candidates = [];
  for (const terminal of vscode.window.terminals) {
    const session = sessions.get(terminal);
    if (session?.isClaude) candidates.push(session);
  }

  // Also inspect process trees for Claude sessions that were already running before extension
  // activation. This makes scheduled continuation work for existing sessions even though
  // output streaming cannot be retroactively attached to an already-running shell execution.
  for (const terminal of vscode.window.terminals) {
    if (candidates.some(s => s.terminal === terminal)) continue;
    const session = await markIfClaude(terminal);
    if (session) candidates.push(session);
  }

  let skipped = 0;
  for (const session of candidates) {
    if (session.paused) {
      skipped += 1;
      continue;
    }
    await sendContinue(session, reason);
  }
  if (skipped > 0) {
    logger.log(`Skipped ${skipped} paused session(s).`);
  }
}

async function logStartupState() {
  const terminals = vscode.window.terminals;
  logger.log(`startup: enabled=${enabled()} detectLimits=${cfg().get('detectLimits', true)} debug=${cfg().get('debug', false)} terminals=${terminals.length}`);

  if (!terminals.length) {
    logger.log('startup: no terminals are currently open');
    return;
  }

  let detectedClaude = 0;
  for (const terminal of terminals) {
    const pid = await terminal.processId;
    const session = await markIfClaude(terminal);
    logger.log(`startup: terminal=${terminal.name} pid=${pid || 'unknown'} claude=${Boolean(session)}`);
    if (session) detectedClaude += 1;
  }

  if (!detectedClaude) {
    logger.log('startup: no Claude sessions detected yet; a Claude shell execution must start after activation for live output capture');
  }
}

function disposeAll() {
  for (const session of sessions.values()) {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    detachTranscriptWatcher(session);
  }
  transcriptWatcher.disposeAll();
}

function setPaused(session, paused) {
  session.paused = Boolean(paused);
  history.record(paused ? history.EVENTS.PAUSED : history.EVENTS.RESUMED, session.terminal.name, '');
  notifyChange();
}

function setMessageProfile(session, name) {
  session.messageProfile = name || null;
  history.record(history.EVENTS.PROFILE_SET, session.terminal.name, name || '(default)');
  notifyChange();
}

module.exports = {
  sessions,
  sessionFor,
  workspaceCwdGuess,
  attachTranscriptWatcher,
  detachTranscriptWatcher,
  handleLimit,
  continueSessionWhenReady,
  continueAll,
  logStartupState,
  disposeAll,
  onChange,
  setPaused,
  setMessageProfile
};
