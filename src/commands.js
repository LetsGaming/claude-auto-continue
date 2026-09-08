const vscode = require('vscode');

async function pickSession(sessions, { claudeOnly = true } = {}) {
  const items = [];
  for (const session of sessions.values()) {
    if (claudeOnly && !session.isClaude) continue;
    const flags = [];
    if (session.limit) flags.push('limited');
    if (session.paused) flags.push('paused');
    if (session.messageProfile) flags.push(`profile: ${session.messageProfile}`);
    items.push({ label: session.terminal.name, description: flags.join(' · '), session });
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage('No Claude Code terminals found.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a Claude terminal' });
  return picked?.session;
}

async function setResetTime(sessionManager) {
  // Always re-prompt for a terminal here, even when invoked from notify.js's action button
  // with a specific vscode.Terminal argument — the registered command wrapper in extension.js
  // discards that argument and calls this with just sessionManager, keeping this function's
  // signature simple and the "which terminal" logic centralized in pickSession.
  const session = await pickSession(sessionManager.sessions, { claudeOnly: false });
  if (!session) return;

  const input = await vscode.window.showInputBox({
    prompt: 'When does the limit reset? (e.g. 21:47, 9:47pm, 7pm, +90m, +2h, in 45 minutes)',
    placeHolder: '7pm'
  });
  if (!input) return;

  const { parseManualTime } = require('./timeInput');
  const resetAt = parseManualTime(input);
  if (resetAt === null) {
    vscode.window.showErrorMessage(`Could not parse "${input}" as a time.`);
    return;
  }

  await sessionManager.handleLimit(session, { resetAt, raw: input }, { force: true });
}

async function togglePause(sessionManager) {
  const session = await pickSession(sessionManager.sessions, { claudeOnly: false });
  if (!session) return;

  sessionManager.setPaused(session, !session.paused);
  vscode.window.showInformationMessage(`${session.paused ? 'Paused' : 'Resumed'} auto-continue for "${session.terminal.name}".`);
}

async function selectMessageProfile(sessionManager) {
  const session = await pickSession(sessionManager.sessions, { claudeOnly: false });
  if (!session) return;

  const { profileNames } = require('./config');
  const names = profileNames();
  if (names.length === 0) {
    vscode.window.showInformationMessage('No message profiles configured. Add entries to the "claudeAutoContinue.messageProfiles" setting first.');
    return;
  }

  const items = ['(default message)', ...names];
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a message profile' });
  if (!picked) return;

  if (picked === '(default message)') {
    sessionManager.setMessageProfile(session, null);
  } else {
    sessionManager.setMessageProfile(session, picked);
  }
  vscode.window.showInformationMessage(`Message profile for "${session.terminal.name}" set to ${picked}.`);
}

async function showHistory() {
  const { recent } = require('./history');
  const events = recent(50);
  if (events.length === 0) {
    vscode.window.showInformationMessage('No activity recorded yet.');
    return;
  }

  const items = events.map(e => ({
    label: `${e.type}`,
    description: e.terminalName,
    detail: `${e.at.toLocaleString()}${e.detail ? ' — ' + e.detail : ''}`
  }));
  await vscode.window.showQuickPick(items, { placeHolder: 'Recent activity (read-only)' });
}

module.exports = { setResetTime, togglePause, selectMessageProfile, showHistory };
